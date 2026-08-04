package httpapi

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/MarcoPoloResearchLab/social_threader/internal/transformation"
)

// New validates API dependencies and creates one shared admission state.
func New(input Input) (*API, error) {
	if input.Transformer == nil {
		return nil, errors.New("httpapi.new: transformer is required")
	}
	if input.Authorizer == nil {
		return nil, errors.New("httpapi.new: authorizer is required")
	}
	if strings.TrimSpace(input.Policy.AllowedFrontendOrigin) == "" {
		return nil, errors.New("httpapi.new: allowed frontend origin is required")
	}
	if input.Policy.MaxBodyBytes <= 0 || input.Policy.MaxInputCharacters <= 0 {
		return nil, errors.New("httpapi.new: body and input limits must be positive")
	}
	if input.Policy.PerUserRequests <= 0 || input.Policy.RateWindow <= 0 {
		return nil, errors.New("httpapi.new: rate limit must be positive")
	}
	if input.Policy.GlobalConcurrency <= 0 {
		return nil, errors.New("httpapi.new: concurrency limit must be positive")
	}
	if input.Policy.IdempotencyRetention <= 0 {
		return nil, errors.New("httpapi.new: idempotency retention must be positive")
	}
	if input.Policy.CapacityMaxRequests <= 0 || input.Policy.CapacityWindow <= 0 {
		return nil, errors.New("httpapi.new: capacity policy must be positive")
	}
	if input.Logger == nil {
		return nil, errors.New("httpapi.new: logger is required")
	}
	if input.Clock == nil {
		return nil, errors.New("httpapi.new: clock is required")
	}
	subjectKeySecret := make([]byte, subjectKeySecretLength)
	if _, randomError := rand.Read(subjectKeySecret); randomError != nil {
		return nil, errors.New("httpapi.new: secure subject-key material is unavailable")
	}
	return &API{
		transformer:      input.Transformer,
		authorizer:       input.Authorizer,
		policy:           input.Policy,
		logger:           input.Logger,
		clock:            input.Clock,
		semaphore:        make(chan struct{}, input.Policy.GlobalConcurrency),
		subjectKeySecret: subjectKeySecret,
		rateWindows:      make(map[string]requestWindow),
		idempotencyCache: make(map[string]*idempotencyEntry),
	}, nil
}

// ServeHTTP routes health and transformation requests.
func (api *API) ServeHTTP(responseWriter http.ResponseWriter, httpRequest *http.Request) {
	responseWriter.Header().Set("Cache-Control", "no-store")
	responseWriter.Header().Set("X-Content-Type-Options", "nosniff")

	switch httpRequest.URL.Path {
	case healthPath:
		api.handleHealth(responseWriter, httpRequest)
	case transformationPath:
		api.handleTransformation(responseWriter, httpRequest)
	default:
		writeFailure(responseWriter, apiFailure{
			statusCode: http.StatusNotFound,
			code:       "resource_not_found",
			message:    "The requested resource does not exist.",
		})
	}
}

func (api *API) handleHealth(responseWriter http.ResponseWriter, httpRequest *http.Request) {
	if httpRequest.Method != http.MethodGet {
		responseWriter.Header().Set("Allow", http.MethodGet)
		writeFailure(responseWriter, methodNotAllowedFailure())
		return
	}
	writeJSON(responseWriter, http.StatusOK, map[string]string{"status": "ok"})
}

func (api *API) handleTransformation(responseWriter http.ResponseWriter, httpRequest *http.Request) {
	requestStartedAt := api.clock()
	if corsFailure := api.applyCORS(responseWriter, httpRequest); corsFailure != nil {
		writeFailure(responseWriter, *corsFailure)
		return
	}
	if httpRequest.Method == http.MethodOptions {
		responseWriter.WriteHeader(http.StatusNoContent)
		return
	}
	if httpRequest.Method != http.MethodPost {
		responseWriter.Header().Set("Allow", "POST, OPTIONS")
		writeFailure(responseWriter, methodNotAllowedFailure())
		return
	}
	if !hasJSONMediaType(httpRequest.Header.Get("Content-Type")) {
		writeFailure(responseWriter, apiFailure{
			statusCode: http.StatusBadRequest,
			code:       "invalid_media_type",
			message:    "Content-Type must be application/json.",
		})
		return
	}

	subject, authorizationError := api.authorizer.Authorize(httpRequest)
	if authorizationError != nil || strings.TrimSpace(subject.UserID) == "" || strings.TrimSpace(subject.TenantID) == "" {
		writeFailure(responseWriter, apiFailure{
			statusCode: http.StatusUnauthorized,
			code:       "authentication_required",
			message:    "An authenticated session is required.",
		})
		return
	}

	payload, payloadFailure := api.decodeRequest(responseWriter, httpRequest)
	if payloadFailure != nil {
		writeFailure(responseWriter, *payloadFailure)
		return
	}
	request, validationFailure := api.validateRequest(payload)
	if validationFailure != nil {
		writeFailure(responseWriter, *validationFailure)
		return
	}

	subjectKey := irreversibleSubjectKey(subject, api.subjectKeySecret)
	fingerprint := requestFingerprint(request)
	cacheKey := subjectKey + ":" + request.RequestID
	entry, entryOwner, conflict := api.beginIdempotentRequest(cacheKey, fingerprint)
	if conflict {
		writeFailure(responseWriter, apiFailure{
			statusCode: http.StatusConflict,
			code:       "request_id_conflict",
			message:    "The request identifier was already used for different input.",
		})
		return
	}
	if !entryOwner {
		api.writeIdempotentReplay(responseWriter, httpRequest, entry)
		return
	}

	response, failure := api.executeTransformation(httpRequest.Context(), subjectKey, request)
	api.completeIdempotentRequest(cacheKey, entry, response, failure)
	api.logOutcome(subjectKey, request, response, failure, api.clock().Sub(requestStartedAt))
	if failure != nil {
		writeFailure(responseWriter, *failure)
		return
	}
	writeJSON(responseWriter, http.StatusOK, response)
}

func (api *API) applyCORS(responseWriter http.ResponseWriter, httpRequest *http.Request) *apiFailure {
	origin := strings.TrimSpace(httpRequest.Header.Get("Origin"))
	if origin == "" {
		return nil
	}
	responseWriter.Header().Add("Vary", "Origin")
	if origin != api.policy.AllowedFrontendOrigin {
		return &apiFailure{
			statusCode: http.StatusBadRequest,
			code:       "origin_not_allowed",
			message:    "The request origin is not allowed.",
		}
	}
	responseWriter.Header().Set("Access-Control-Allow-Origin", origin)
	responseWriter.Header().Set("Access-Control-Allow-Credentials", "true")
	responseWriter.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	responseWriter.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	return nil
}

func (api *API) decodeRequest(responseWriter http.ResponseWriter, httpRequest *http.Request) (transformationRequestPayload, *apiFailure) {
	limitedBody := http.MaxBytesReader(responseWriter, httpRequest.Body, api.policy.MaxBodyBytes)
	defer limitedBody.Close()
	decoder := json.NewDecoder(limitedBody)
	decoder.DisallowUnknownFields()
	var payload transformationRequestPayload
	if decodeError := decoder.Decode(&payload); decodeError != nil {
		var maximumBytesError *http.MaxBytesError
		if errors.As(decodeError, &maximumBytesError) {
			return transformationRequestPayload{}, &apiFailure{
				statusCode: http.StatusRequestEntityTooLarge,
				code:       "request_too_large",
				message:    "The request body is too large.",
			}
		}
		return transformationRequestPayload{}, invalidRequestFailure()
	}
	if trailingError := decoder.Decode(&struct{}{}); trailingError != io.EOF {
		return transformationRequestPayload{}, invalidRequestFailure()
	}
	return payload, nil
}

func (api *API) validateRequest(payload transformationRequestPayload) (transformation.Request, *apiFailure) {
	operation, operationError := transformation.ParseOperation(payload.Operation)
	if operationError != nil {
		return transformation.Request{}, &apiFailure{
			statusCode: http.StatusBadRequest,
			code:       "unknown_operation",
			message:    "The transformation operation is not supported.",
		}
	}
	if !requestIDPattern.MatchString(payload.RequestID) {
		return transformation.Request{}, &apiFailure{
			statusCode: http.StatusBadRequest,
			code:       "invalid_request_id",
			message:    "The request identifier is invalid.",
		}
	}
	if strings.TrimSpace(payload.Text) == "" || !utf8.ValidString(payload.Text) {
		return transformation.Request{}, &apiFailure{
			statusCode: http.StatusBadRequest,
			code:       "invalid_text",
			message:    "The source text must contain valid nonblank text.",
		}
	}
	if utf8.RuneCountInString(payload.Text) > api.policy.MaxInputCharacters {
		return transformation.Request{}, &apiFailure{
			statusCode: http.StatusRequestEntityTooLarge,
			code:       "input_too_large",
			message:    "The source text is too large.",
		}
	}
	return transformation.Request{
		Operation: operation,
		Text:      payload.Text,
		RequestID: payload.RequestID,
	}, nil
}

func hasJSONMediaType(contentType string) bool {
	mediaType, _, parseError := mime.ParseMediaType(contentType)
	return parseError == nil && mediaType == "application/json"
}

func invalidRequestFailure() *apiFailure {
	return &apiFailure{
		statusCode: http.StatusBadRequest,
		code:       "invalid_request",
		message:    "The request body is invalid.",
	}
}

func methodNotAllowedFailure() apiFailure {
	return apiFailure{
		statusCode: http.StatusMethodNotAllowed,
		code:       "method_not_allowed",
		message:    "The HTTP method is not allowed.",
	}
}

func writeFailure(responseWriter http.ResponseWriter, failure apiFailure) {
	writeJSON(responseWriter, failure.statusCode, errorEnvelope{
		Error: errorPayload{Code: failure.code, Message: failure.message},
	})
}

func writeJSON(responseWriter http.ResponseWriter, statusCode int, payload any) {
	encodedPayload, encodeError := json.Marshal(payload)
	if encodeError != nil {
		encodedPayload = []byte(`{"error":{"code":"response_encoding_failed","message":"The response could not be encoded."}}`)
		statusCode = http.StatusInternalServerError
	}
	responseWriter.Header().Set("Content-Type", "application/json; charset=utf-8")
	responseWriter.WriteHeader(statusCode)
	_, _ = responseWriter.Write(append(encodedPayload, '\n'))
}
