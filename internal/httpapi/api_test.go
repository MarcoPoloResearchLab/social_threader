package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/MarcoPoloResearchLab/social_threader/internal/httpapi"
	"github.com/MarcoPoloResearchLab/social_threader/internal/transformation"
)

const allowedFrontendOrigin = "https://threader.mprlab.com"

type fakeAuthorizer struct{}

func (fakeAuthorizer) Authorize(httpRequest *http.Request) (httpapi.Subject, error) {
	userID := httpRequest.Header.Get("X-Test-User")
	if userID == "" {
		return httpapi.Subject{}, errors.New("test unauthorized")
	}
	return httpapi.Subject{UserID: userID, TenantID: "social-threader"}, nil
}

type fakeTransformer struct {
	mutex       sync.Mutex
	callCount   int
	requests    []transformation.Request
	response    transformation.Response
	err         error
	requestGate chan struct{}
	started     chan struct{}
}

func (transformer *fakeTransformer) Transform(
	contextValue context.Context,
	request transformation.Request,
) (transformation.Response, error) {
	transformer.mutex.Lock()
	transformer.callCount += 1
	transformer.requests = append(transformer.requests, request)
	requestNumber := transformer.callCount
	transformer.mutex.Unlock()
	if requestNumber == 1 && transformer.started != nil {
		close(transformer.started)
	}
	if requestNumber == 1 && transformer.requestGate != nil {
		select {
		case <-transformer.requestGate:
		case <-contextValue.Done():
			return transformation.Response{}, contextValue.Err()
		}
	}
	response := transformer.response
	response.Operation = request.Operation
	response.RequestID = request.RequestID
	if response.TemplateVersion == "" {
		response.TemplateVersion = string(request.Operation) + ".v1"
	}
	return response, transformer.err
}

func (transformer *fakeTransformer) calls() int {
	transformer.mutex.Lock()
	defer transformer.mutex.Unlock()
	return transformer.callCount
}

func TestAPIRequiresAuthenticationAndAllowsOnlyExactCredentialedOrigin(testingInstance *testing.T) {
	transformer := &fakeTransformer{response: transformation.Response{Text: "PRIVATE-RESULT"}}
	logBuffer := &bytes.Buffer{}
	api := newTestAPI(testingInstance, transformer, defaultPolicy(), logBuffer)

	unauthenticatedResponse := performJSONRequest(api, http.MethodPost, allowedFrontendOrigin, "", validRequestBody("request-auth-001"))
	assertStatusAndCode(testingInstance, unauthenticatedResponse, http.StatusUnauthorized, "authentication_required")
	if transformer.calls() != 0 {
		testingInstance.Fatalf("unauthenticated request reached transformer")
	}

	disallowedResponse := performJSONRequest(api, http.MethodPost, "https://evil.example", "user-1", validRequestBody("request-origin-001"))
	assertStatusAndCode(testingInstance, disallowedResponse, http.StatusBadRequest, "origin_not_allowed")
	if disallowedResponse.Header().Get("Access-Control-Allow-Origin") != "" {
		testingInstance.Fatalf("disallowed origin received CORS access")
	}

	preflightRequest := httptest.NewRequest(http.MethodOptions, "/v1/thread-transformations", nil)
	preflightRequest.Header.Set("Origin", allowedFrontendOrigin)
	preflightRequest.Header.Set("Access-Control-Request-Method", http.MethodPost)
	preflightResponse := httptest.NewRecorder()
	api.ServeHTTP(preflightResponse, preflightRequest)
	if preflightResponse.Code != http.StatusNoContent {
		testingInstance.Fatalf("preflight status=%d", preflightResponse.Code)
	}
	assertCredentialedCORS(testingInstance, preflightResponse)

	successResponse := performJSONRequest(api, http.MethodPost, allowedFrontendOrigin, "user-1", validRequestBody("request-success-001"))
	if successResponse.Code != http.StatusOK {
		testingInstance.Fatalf("success status=%d body=%s", successResponse.Code, successResponse.Body.String())
	}
	assertCredentialedCORS(testingInstance, successResponse)
	if successResponse.Header().Get("Cache-Control") != "no-store" {
		testingInstance.Fatalf("cache control=%q", successResponse.Header().Get("Cache-Control"))
	}
	responsePayload := decodeJSON(testingInstance, successResponse)
	if responsePayload["text"] != "PRIVATE-RESULT" || responsePayload["template_version"] != "polish.v1" {
		testingInstance.Fatalf("response=%v", responsePayload)
	}
	logText := logBuffer.String()
	for _, forbiddenContent := range []string{"PRIVATE-SOURCE", "PRIVATE-RESULT", proxySecretForLogAssertion} {
		if strings.Contains(logText, forbiddenContent) {
			testingInstance.Fatalf("content leaked into log: %q", logText)
		}
	}
	for _, safeField := range []string{"request_id", "operation", "template_version", "input_characters", "output_characters", "duration_ms", "outcome"} {
		if !strings.Contains(logText, safeField) {
			testingInstance.Fatalf("safe metadata field %q missing from log: %q", safeField, logText)
		}
	}
}

func TestAPISubjectRateKeyIsProcessLocalAndContentFree(testingInstance *testing.T) {
	subjectKeys := make([]string, 0, 2)
	for processIndex := 0; processIndex < 2; processIndex++ {
		logBuffer := &bytes.Buffer{}
		transformer := &fakeTransformer{response: transformation.Response{Text: "result"}}
		api := newTestAPI(testingInstance, transformer, defaultPolicy(), logBuffer)
		response := performJSONRequest(
			api,
			http.MethodPost,
			allowedFrontendOrigin,
			"guessable-user@example.com",
			validRequestBody("request-subject-key-001"),
		)
		if response.Code != http.StatusOK {
			testingInstance.Fatalf("process %d status=%d", processIndex, response.Code)
		}
		logRecord := map[string]any{}
		if decodeError := json.Unmarshal(logBuffer.Bytes(), &logRecord); decodeError != nil {
			testingInstance.Fatalf("decode process %d log: %v", processIndex, decodeError)
		}
		subjectKey, subjectKeyOK := logRecord["subject_key"].(string)
		if !subjectKeyOK || subjectKey == "" {
			testingInstance.Fatalf("process %d subject key=%v", processIndex, logRecord["subject_key"])
		}
		if strings.Contains(logBuffer.String(), "guessable-user@example.com") {
			testingInstance.Fatalf("process %d log exposed the subject identifier", processIndex)
		}
		subjectKeys = append(subjectKeys, subjectKey)
	}
	if subjectKeys[0] == subjectKeys[1] {
		testingInstance.Fatal("separate API processes used the same guessable subject digest")
	}
}

const proxySecretForLogAssertion = "test-social-threader-tenant-secret"

func TestAPIRejectsInvalidHTTPBoundaryInputs(testingInstance *testing.T) {
	testCases := []struct {
		name         string
		method       string
		contentType  string
		body         string
		policy       httpapi.Policy
		expectedCode int
		errorCode    string
	}{
		{name: "method", method: http.MethodGet, contentType: "application/json", body: validRequestBody("request-method-001"), policy: defaultPolicy(), expectedCode: http.StatusMethodNotAllowed, errorCode: "method_not_allowed"},
		{name: "media type", method: http.MethodPost, contentType: "text/plain", body: validRequestBody("request-media-001"), policy: defaultPolicy(), expectedCode: http.StatusBadRequest, errorCode: "invalid_media_type"},
		{name: "malformed JSON", method: http.MethodPost, contentType: "application/json", body: "{", policy: defaultPolicy(), expectedCode: http.StatusBadRequest, errorCode: "invalid_request"},
		{name: "unknown field", method: http.MethodPost, contentType: "application/json", body: `{"operation":"polish","text":"source","request_id":"request-field-001","prompt":"forbidden"}`, policy: defaultPolicy(), expectedCode: http.StatusBadRequest, errorCode: "invalid_request"},
		{name: "unknown operation", method: http.MethodPost, contentType: "application/json", body: `{"operation":"translate","text":"source","request_id":"request-operation-001"}`, policy: defaultPolicy(), expectedCode: http.StatusBadRequest, errorCode: "unknown_operation"},
		{name: "blank text", method: http.MethodPost, contentType: "application/json", body: `{"operation":"polish","text":"  ","request_id":"request-blank-001"}`, policy: defaultPolicy(), expectedCode: http.StatusBadRequest, errorCode: "invalid_text"},
		{name: "invalid request ID", method: http.MethodPost, contentType: "application/json", body: `{"operation":"polish","text":"source","request_id":"bad id"}`, policy: defaultPolicy(), expectedCode: http.StatusBadRequest, errorCode: "invalid_request_id"},
		{name: "input too large", method: http.MethodPost, contentType: "application/json", body: `{"operation":"polish","text":"123456","request_id":"request-input-001"}`, policy: policyWithInputLimit(5), expectedCode: http.StatusRequestEntityTooLarge, errorCode: "input_too_large"},
		{name: "body too large", method: http.MethodPost, contentType: "application/json", body: validRequestBody("request-body-001"), policy: policyWithBodyLimit(20), expectedCode: http.StatusRequestEntityTooLarge, errorCode: "request_too_large"},
	}

	for _, testCase := range testCases {
		testingInstance.Run(testCase.name, func(subTest *testing.T) {
			transformer := &fakeTransformer{response: transformation.Response{Text: "result"}}
			api := newTestAPI(subTest, transformer, testCase.policy, &bytes.Buffer{})
			request := httptest.NewRequest(testCase.method, "/v1/thread-transformations", strings.NewReader(testCase.body))
			request.Header.Set("Origin", allowedFrontendOrigin)
			request.Header.Set("Content-Type", testCase.contentType)
			request.Header.Set("X-Test-User", "user-validation")
			response := httptest.NewRecorder()
			api.ServeHTTP(response, request)
			assertStatusAndCode(subTest, response, testCase.expectedCode, testCase.errorCode)
			if testCase.expectedCode == http.StatusMethodNotAllowed && response.Header().Get("Allow") != "POST, OPTIONS" {
				subTest.Fatalf("Allow=%q", response.Header().Get("Allow"))
			}
			if transformer.calls() != 0 {
				subTest.Fatalf("invalid request reached transformer")
			}
		})
	}
}

func TestAPIIdempotencyReusesExactResultAndRejectsConflictingRequestID(testingInstance *testing.T) {
	transformer := &fakeTransformer{response: transformation.Response{Text: "cached result"}}
	policy := defaultPolicy()
	policy.PerUserRequests = 1
	api := newTestAPI(testingInstance, transformer, policy, &bytes.Buffer{})

	firstResponse := performJSONRequest(api, http.MethodPost, allowedFrontendOrigin, "user-idempotency", validRequestBody("request-retry-001"))
	if firstResponse.Code != http.StatusOK {
		testingInstance.Fatalf("first status=%d body=%s", firstResponse.Code, firstResponse.Body.String())
	}
	secondResponse := performJSONRequest(api, http.MethodPost, allowedFrontendOrigin, "user-idempotency", validRequestBody("request-retry-001"))
	if secondResponse.Code != http.StatusOK {
		testingInstance.Fatalf("retry status=%d body=%s", secondResponse.Code, secondResponse.Body.String())
	}
	if transformer.calls() != 1 {
		testingInstance.Fatalf("exact retry completion calls=%d", transformer.calls())
	}

	conflictingBody := `{"operation":"expand","text":"different","request_id":"request-retry-001"}`
	conflictingResponse := performJSONRequest(api, http.MethodPost, allowedFrontendOrigin, "user-idempotency", conflictingBody)
	assertStatusAndCode(testingInstance, conflictingResponse, http.StatusConflict, "request_id_conflict")
	if transformer.calls() != 1 {
		testingInstance.Fatalf("conflicting retry reached transformer")
	}
}

func TestAPIIdempotencyRetentionBoundsExactRetryReuse(testingInstance *testing.T) {
	currentTime := time.Unix(1_800_000_000, 0).UTC()
	transformer := &fakeTransformer{response: transformation.Response{Text: "bounded result"}}
	policy := defaultPolicy()
	policy.IdempotencyRetention = time.Minute
	api, apiError := httpapi.New(httpapi.Input{
		Transformer: transformer,
		Authorizer:  fakeAuthorizer{},
		Policy:      policy,
		Logger:      slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil)),
		Clock:       func() time.Time { return currentTime },
	})
	if apiError != nil {
		testingInstance.Fatalf("new API: %v", apiError)
	}

	requestBody := validRequestBody("request-retention-001")
	firstResponse := performJSONRequest(api, http.MethodPost, allowedFrontendOrigin, "retention-user", requestBody)
	if firstResponse.Code != http.StatusOK {
		testingInstance.Fatalf("first status=%d body=%s", firstResponse.Code, firstResponse.Body.String())
	}
	currentTime = currentTime.Add(30 * time.Second)
	reusedResponse := performJSONRequest(api, http.MethodPost, allowedFrontendOrigin, "retention-user", requestBody)
	if reusedResponse.Code != http.StatusOK || transformer.calls() != 1 {
		testingInstance.Fatalf("bounded retry status=%d completion calls=%d", reusedResponse.Code, transformer.calls())
	}

	currentTime = currentTime.Add(31 * time.Second)
	expiredResponse := performJSONRequest(api, http.MethodPost, allowedFrontendOrigin, "retention-user", requestBody)
	if expiredResponse.Code != http.StatusOK || transformer.calls() != 2 {
		testingInstance.Fatalf("expired retry status=%d completion calls=%d", expiredResponse.Code, transformer.calls())
	}
}

func TestAPIRateConcurrencyAndCapacityAdmission(testingInstance *testing.T) {
	testingInstance.Run("per-user rate", func(subTest *testing.T) {
		policy := defaultPolicy()
		policy.PerUserRequests = 1
		transformer := &fakeTransformer{response: transformation.Response{Text: "result"}}
		api := newTestAPI(subTest, transformer, policy, &bytes.Buffer{})
		firstResponse := performJSONRequest(api, http.MethodPost, allowedFrontendOrigin, "rate-user", validRequestBody("request-rate-001"))
		if firstResponse.Code != http.StatusOK {
			subTest.Fatalf("first status=%d", firstResponse.Code)
		}
		secondResponse := performJSONRequest(api, http.MethodPost, allowedFrontendOrigin, "rate-user", validRequestBody("request-rate-002"))
		assertStatusAndCode(subTest, secondResponse, http.StatusTooManyRequests, "rate_limited")
	})

	testingInstance.Run("global concurrency", func(subTest *testing.T) {
		policy := defaultPolicy()
		policy.GlobalConcurrency = 1
		requestGate := make(chan struct{})
		transformer := &fakeTransformer{
			response:    transformation.Response{Text: "result"},
			requestGate: requestGate,
			started:     make(chan struct{}),
		}
		api := newTestAPI(subTest, transformer, policy, &bytes.Buffer{})
		firstResponseChannel := make(chan *httptest.ResponseRecorder, 1)
		go func() {
			firstResponseChannel <- performJSONRequest(api, http.MethodPost, allowedFrontendOrigin, "user-one", validRequestBody("request-concurrency-001"))
		}()
		<-transformer.started
		secondResponse := performJSONRequest(api, http.MethodPost, allowedFrontendOrigin, "user-two", validRequestBody("request-concurrency-002"))
		assertStatusAndCode(subTest, secondResponse, http.StatusTooManyRequests, "concurrency_limited")
		close(requestGate)
		if firstResponse := <-firstResponseChannel; firstResponse.Code != http.StatusOK {
			subTest.Fatalf("first status=%d", firstResponse.Code)
		}
	})

	testingInstance.Run("global capacity", func(subTest *testing.T) {
		policy := defaultPolicy()
		policy.CapacityMaxRequests = 1
		transformer := &fakeTransformer{response: transformation.Response{Text: "result"}}
		api := newTestAPI(subTest, transformer, policy, &bytes.Buffer{})
		firstResponse := performJSONRequest(api, http.MethodPost, allowedFrontendOrigin, "capacity-one", validRequestBody("request-capacity-001"))
		if firstResponse.Code != http.StatusOK {
			subTest.Fatalf("first status=%d", firstResponse.Code)
		}
		secondResponse := performJSONRequest(api, http.MethodPost, allowedFrontendOrigin, "capacity-two", validRequestBody("request-capacity-002"))
		assertStatusAndCode(subTest, secondResponse, http.StatusServiceUnavailable, "capacity_unavailable")
	})

	testingInstance.Run("capacity rejection does not consume user rate allowance", func(subTest *testing.T) {
		currentTime := time.Unix(1_800_000_000, 0).UTC()
		policy := defaultPolicy()
		policy.PerUserRequests = 1
		policy.RateWindow = time.Hour
		policy.CapacityMaxRequests = 1
		policy.CapacityWindow = time.Minute
		transformer := &fakeTransformer{response: transformation.Response{Text: "result"}}
		api, apiError := httpapi.New(httpapi.Input{
			Transformer: transformer,
			Authorizer:  fakeAuthorizer{},
			Policy:      policy,
			Logger:      slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil)),
			Clock:       func() time.Time { return currentTime },
		})
		if apiError != nil {
			subTest.Fatalf("new API: %v", apiError)
		}

		firstResponse := performJSONRequest(api, http.MethodPost, allowedFrontendOrigin, "capacity-owner", validRequestBody("request-capacity-owner-001"))
		if firstResponse.Code != http.StatusOK {
			subTest.Fatalf("first status=%d", firstResponse.Code)
		}
		rejectedResponse := performJSONRequest(api, http.MethodPost, allowedFrontendOrigin, "capacity-rejected", validRequestBody("request-capacity-rejected-001"))
		assertStatusAndCode(subTest, rejectedResponse, http.StatusServiceUnavailable, "capacity_unavailable")

		currentTime = currentTime.Add(2 * time.Minute)
		retryResponse := performJSONRequest(api, http.MethodPost, allowedFrontendOrigin, "capacity-rejected", validRequestBody("request-capacity-rejected-001"))
		if retryResponse.Code != http.StatusOK {
			subTest.Fatalf("retry status=%d body=%s", retryResponse.Code, retryResponse.Body.String())
		}
	})
}

func TestAPIMapsSanitizedTransformationFailures(testingInstance *testing.T) {
	testCases := []struct {
		name                string
		transformationError error
		expectedStatus      int
		expectedCode        string
	}{
		{name: "upstream", transformationError: transformation.ErrUpstreamFailure, expectedStatus: http.StatusBadGateway, expectedCode: "upstream_failure"},
		{name: "timeout", transformationError: context.DeadlineExceeded, expectedStatus: http.StatusGatewayTimeout, expectedCode: "upstream_timeout"},
		{name: "cancellation", transformationError: context.Canceled, expectedStatus: http.StatusServiceUnavailable, expectedCode: "request_canceled"},
		{name: "blank completion", transformationError: transformation.ErrBlankCompletion, expectedStatus: http.StatusBadGateway, expectedCode: "invalid_completion"},
		{name: "oversized completion", transformationError: transformation.ErrResponseTooLarge, expectedStatus: http.StatusBadGateway, expectedCode: "invalid_completion"},
	}

	for _, testCase := range testCases {
		testingInstance.Run(testCase.name, func(subTest *testing.T) {
			transformer := &fakeTransformer{err: testCase.transformationError}
			api := newTestAPI(subTest, transformer, defaultPolicy(), &bytes.Buffer{})
			response := performJSONRequest(api, http.MethodPost, allowedFrontendOrigin, "failure-user", validRequestBody("request-failure-001"))
			assertStatusAndCode(subTest, response, testCase.expectedStatus, testCase.expectedCode)
			if strings.Contains(response.Body.String(), "provider") {
				subTest.Fatalf("raw upstream detail leaked: %s", response.Body.String())
			}
		})
	}
}

func newTestAPI(
	testingInstance *testing.T,
	transformer httpapi.Transformer,
	policy httpapi.Policy,
	logBuffer *bytes.Buffer,
) http.Handler {
	testingInstance.Helper()
	logger := slog.New(slog.NewJSONHandler(logBuffer, nil))
	api, apiError := httpapi.New(httpapi.Input{
		Transformer: transformer,
		Authorizer:  fakeAuthorizer{},
		Policy:      policy,
		Logger:      logger,
		Clock:       func() time.Time { return time.Unix(1_800_000_000, 0).UTC() },
	})
	if apiError != nil {
		testingInstance.Fatalf("new API: %v", apiError)
	}
	return api
}

func defaultPolicy() httpapi.Policy {
	return httpapi.Policy{
		AllowedFrontendOrigin: allowedFrontendOrigin,
		MaxBodyBytes:          8192,
		MaxInputCharacters:    5000,
		PerUserRequests:       20,
		RateWindow:            time.Minute,
		GlobalConcurrency:     4,
		IdempotencyRetention:  fiveMinutes,
		CapacityMaxRequests:   100,
		CapacityWindow:        time.Hour,
	}
}

const fiveMinutes = 5 * time.Minute

func policyWithInputLimit(maximumInputCharacters int) httpapi.Policy {
	policy := defaultPolicy()
	policy.MaxInputCharacters = maximumInputCharacters
	return policy
}

func policyWithBodyLimit(maximumBodyBytes int64) httpapi.Policy {
	policy := defaultPolicy()
	policy.MaxBodyBytes = maximumBodyBytes
	return policy
}

func validRequestBody(requestID string) string {
	return `{"operation":"polish","text":"PRIVATE-SOURCE","request_id":"` + requestID + `"}`
}

func performJSONRequest(handler http.Handler, method string, origin string, userID string, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, "/v1/thread-transformations", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	if origin != "" {
		request.Header.Set("Origin", origin)
	}
	if userID != "" {
		request.Header.Set("X-Test-User", userID)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func assertStatusAndCode(testingInstance *testing.T, response *httptest.ResponseRecorder, expectedStatus int, expectedCode string) {
	testingInstance.Helper()
	if response.Code != expectedStatus {
		testingInstance.Fatalf("status=%d expected=%d body=%s", response.Code, expectedStatus, response.Body.String())
	}
	payload := decodeJSON(testingInstance, response)
	errorPayload, errorPayloadOK := payload["error"].(map[string]any)
	if !errorPayloadOK || errorPayload["code"] != expectedCode {
		testingInstance.Fatalf("error payload=%v", payload)
	}
}

func assertCredentialedCORS(testingInstance *testing.T, response *httptest.ResponseRecorder) {
	testingInstance.Helper()
	if response.Header().Get("Access-Control-Allow-Origin") != allowedFrontendOrigin {
		testingInstance.Fatalf("allow origin=%q", response.Header().Get("Access-Control-Allow-Origin"))
	}
	if response.Header().Get("Access-Control-Allow-Credentials") != "true" {
		testingInstance.Fatalf("allow credentials=%q", response.Header().Get("Access-Control-Allow-Credentials"))
	}
}

func decodeJSON(testingInstance *testing.T, response *httptest.ResponseRecorder) map[string]any {
	testingInstance.Helper()
	payload := map[string]any{}
	if decodeError := json.Unmarshal(response.Body.Bytes(), &payload); decodeError != nil {
		testingInstance.Fatalf("decode response: %v body=%s", decodeError, response.Body.String())
	}
	return payload
}
