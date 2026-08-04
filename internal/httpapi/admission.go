package httpapi

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"time"
	"unicode/utf8"

	"github.com/MarcoPoloResearchLab/social_threader/internal/transformation"
)

func (api *API) executeTransformation(
	contextValue context.Context,
	subjectKey string,
	request transformation.Request,
) (transformation.Response, *apiFailure) {
	select {
	case api.semaphore <- struct{}{}:
		defer func() { <-api.semaphore }()
	default:
		return transformation.Response{}, &apiFailure{
			statusCode: http.StatusTooManyRequests,
			code:       "concurrency_limited",
			message:    "The transformation service is busy. Try again later.",
		}
	}

	currentTime := api.clock()
	if admissionFailure := api.admitRequest(subjectKey, currentTime); admissionFailure != nil {
		return transformation.Response{}, admissionFailure
	}

	response, transformationError := api.transformer.Transform(contextValue, request)
	if transformationError != nil {
		return transformation.Response{}, mapTransformationFailure(transformationError)
	}
	return response, nil
}

func (api *API) admitRequest(subjectKey string, currentTime time.Time) *apiFailure {
	api.stateMutex.Lock()
	defer api.stateMutex.Unlock()
	for existingSubjectKey, existingWindow := range api.rateWindows {
		if currentTime.Sub(existingWindow.startedAt) >= api.policy.RateWindow {
			delete(api.rateWindows, existingSubjectKey)
		}
	}
	if api.capacityWindow.startedAt.IsZero() || currentTime.Sub(api.capacityWindow.startedAt) >= api.policy.CapacityWindow {
		api.capacityWindow = requestWindow{startedAt: currentTime}
	}

	requestWindowValue := api.rateWindows[subjectKey]
	if requestWindowValue.startedAt.IsZero() || currentTime.Sub(requestWindowValue.startedAt) >= api.policy.RateWindow {
		requestWindowValue = requestWindow{startedAt: currentTime}
	}
	if requestWindowValue.count >= api.policy.PerUserRequests {
		return &apiFailure{
			statusCode: http.StatusTooManyRequests,
			code:       "rate_limited",
			message:    "The transformation request rate was exceeded.",
		}
	}
	if api.capacityWindow.count >= api.policy.CapacityMaxRequests {
		return &apiFailure{
			statusCode: http.StatusServiceUnavailable,
			code:       "capacity_unavailable",
			message:    "Transformation capacity is temporarily unavailable.",
		}
	}
	requestWindowValue.count += 1
	api.rateWindows[subjectKey] = requestWindowValue
	api.capacityWindow.count += 1
	return nil
}

func (api *API) beginIdempotentRequest(cacheKey string, fingerprint string) (*idempotencyEntry, bool, bool) {
	api.stateMutex.Lock()
	defer api.stateMutex.Unlock()
	currentTime := api.clock()
	for existingKey, existingEntry := range api.idempotencyCache {
		if existingEntry.completed && !existingEntry.expiresAt.After(currentTime) {
			delete(api.idempotencyCache, existingKey)
		}
	}
	if existingEntry, exists := api.idempotencyCache[cacheKey]; exists {
		if existingEntry.fingerprint != fingerprint {
			return existingEntry, false, true
		}
		return existingEntry, false, false
	}
	newEntry := &idempotencyEntry{
		fingerprint: fingerprint,
		expiresAt:   currentTime.Add(api.policy.IdempotencyRetention),
		done:        make(chan struct{}),
	}
	api.idempotencyCache[cacheKey] = newEntry
	return newEntry, true, false
}

func (api *API) completeIdempotentRequest(
	cacheKey string,
	entry *idempotencyEntry,
	response transformation.Response,
	failure *apiFailure,
) {
	api.stateMutex.Lock()
	entry.response = response
	entry.failure = failure
	entry.completed = true
	entry.expiresAt = api.clock().Add(api.policy.IdempotencyRetention)
	if failure != nil {
		delete(api.idempotencyCache, cacheKey)
	}
	close(entry.done)
	api.stateMutex.Unlock()
}

func (api *API) writeIdempotentReplay(
	responseWriter http.ResponseWriter,
	httpRequest *http.Request,
	entry *idempotencyEntry,
) {
	select {
	case <-entry.done:
		api.stateMutex.Lock()
		response := entry.response
		failure := entry.failure
		api.stateMutex.Unlock()
		if failure != nil {
			writeFailure(responseWriter, *failure)
			return
		}
		writeJSON(responseWriter, http.StatusOK, response)
	case <-httpRequest.Context().Done():
		writeFailure(responseWriter, apiFailure{
			statusCode: http.StatusServiceUnavailable,
			code:       "request_canceled",
			message:    "The request was canceled.",
		})
	}
}

func (api *API) logOutcome(
	subjectKey string,
	request transformation.Request,
	response transformation.Response,
	failure *apiFailure,
	duration time.Duration,
) {
	outcome := "success"
	templateVersion := response.TemplateVersion
	outputCharacters := utf8.RuneCountInString(response.Text)
	if failure != nil {
		outcome = failure.code
	}
	api.logger.Info(
		"thread transformation outcome",
		"request_id", request.RequestID,
		"subject_key", subjectKey,
		"operation", string(request.Operation),
		"template_version", templateVersion,
		"input_characters", utf8.RuneCountInString(request.Text),
		"output_characters", outputCharacters,
		"duration_ms", duration.Milliseconds(),
		"outcome", outcome,
	)
}

func mapTransformationFailure(transformationError error) *apiFailure {
	switch {
	case errors.Is(transformationError, context.DeadlineExceeded):
		return &apiFailure{statusCode: http.StatusGatewayTimeout, code: "upstream_timeout", message: "The transformation request timed out."}
	case errors.Is(transformationError, context.Canceled):
		return &apiFailure{statusCode: http.StatusServiceUnavailable, code: "request_canceled", message: "The transformation request was canceled."}
	case errors.Is(transformationError, transformation.ErrBlankCompletion), errors.Is(transformationError, transformation.ErrResponseTooLarge):
		return &apiFailure{statusCode: http.StatusBadGateway, code: "invalid_completion", message: "The transformation service returned an invalid result."}
	case errors.Is(transformationError, transformation.ErrUpstreamFailure):
		return &apiFailure{statusCode: http.StatusBadGateway, code: "upstream_failure", message: "The transformation service failed."}
	default:
		return &apiFailure{statusCode: http.StatusBadGateway, code: "upstream_failure", message: "The transformation service failed."}
	}
}

func requestFingerprint(request transformation.Request) string {
	digest := sha256.Sum256([]byte(string(request.Operation) + "\x00" + request.Text))
	return hex.EncodeToString(digest[:])
}

func irreversibleSubjectKey(subject Subject, secret []byte) string {
	digest := hmac.New(sha256.New, secret)
	_, _ = digest.Write([]byte(subject.TenantID + "\x00" + subject.UserID))
	return hex.EncodeToString(digest.Sum(nil))
}
