package httpapi_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/MarcoPoloResearchLab/social_threader/internal/transformation"
)

func TestAPIContractThroughRealHTTPListener(testingInstance *testing.T) {
	transformer := &fakeTransformer{response: responseWithText("listener result")}
	api := newTestAPI(testingInstance, transformer, defaultPolicy(), &bytes.Buffer{})
	testServer := httptest.NewServer(api)
	defer testServer.Close()

	healthResponse, healthError := testServer.Client().Get(testServer.URL + "/healthz")
	if healthError != nil {
		testingInstance.Fatalf("health request: %v", healthError)
	}
	closeResponseBody(testingInstance, healthResponse)
	if healthResponse.StatusCode != http.StatusOK {
		testingInstance.Fatalf("health status=%d", healthResponse.StatusCode)
	}

	transformationRequest, requestError := http.NewRequest(
		http.MethodPost,
		testServer.URL+"/v1/thread-transformations",
		strings.NewReader(validRequestBody("request-listener-001")),
	)
	if requestError != nil {
		testingInstance.Fatalf("new transformation request: %v", requestError)
	}
	transformationRequest.Header.Set("Content-Type", "application/json")
	transformationRequest.Header.Set("Origin", allowedFrontendOrigin)
	transformationRequest.Header.Set("X-Test-User", "listener-user")
	transformationResponse, transformationError := testServer.Client().Do(transformationRequest)
	if transformationError != nil {
		testingInstance.Fatalf("transformation request: %v", transformationError)
	}
	defer closeResponseBody(testingInstance, transformationResponse)
	if transformationResponse.StatusCode != http.StatusOK {
		testingInstance.Fatalf("transformation status=%d", transformationResponse.StatusCode)
	}
	if transformationResponse.Header.Get("Access-Control-Allow-Origin") != allowedFrontendOrigin {
		testingInstance.Fatalf("allow origin=%q", transformationResponse.Header.Get("Access-Control-Allow-Origin"))
	}
	var payload map[string]any
	if decodeError := json.NewDecoder(transformationResponse.Body).Decode(&payload); decodeError != nil {
		testingInstance.Fatalf("decode transformation response: %v", decodeError)
	}
	if payload["text"] != "listener result" || payload["request_id"] != "request-listener-001" {
		testingInstance.Fatal("real listener returned an unexpected transformation representation")
	}
}

func responseWithText(text string) transformation.Response {
	return transformation.Response{Text: text}
}

func closeResponseBody(testingInstance *testing.T, response *http.Response) {
	testingInstance.Helper()
	if _, readError := io.Copy(io.Discard, response.Body); readError != nil {
		testingInstance.Fatalf("drain response body: %v", readError)
	}
	if closeError := response.Body.Close(); closeError != nil {
		testingInstance.Fatalf("close response body: %v", closeError)
	}
}
