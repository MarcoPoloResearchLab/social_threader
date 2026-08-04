package llmproxyadapter_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/MarcoPoloResearchLab/social_threader/internal/llmproxyadapter"
	"github.com/MarcoPoloResearchLab/social_threader/internal/transformation"
	"github.com/tyemirov/llm-proxy/pkg/llmproxyclient"
)

const proxySecret = "test-social-threader-tenant-secret"

func TestOfficialClientBoundarySendsConfiguredMessagesRequest(testingInstance *testing.T) {
	type capturedRequest struct {
		path             string
		query            url.Values
		requestTimeout   string
		requestBody      map[string]any
		secretWasCorrect bool
	}
	captured := capturedRequest{}

	proxyServer := httptest.NewServer(http.HandlerFunc(func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		captured.path = httpRequest.URL.Path
		captured.query = httpRequest.URL.Query()
		captured.secretWasCorrect = captured.query.Get("key") == proxySecret
		captured.query.Del("key")
		captured.requestTimeout = httpRequest.Header.Get("X-LLM-Proxy-Request-Timeout-Seconds")
		requestBytes, readError := io.ReadAll(httpRequest.Body)
		if readError != nil {
			testingInstance.Fatalf("read request: %v", readError)
		}
		if decodeError := json.Unmarshal(requestBytes, &captured.requestBody); decodeError != nil {
			testingInstance.Fatalf("decode request: %v", decodeError)
		}
		responseWriter.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = responseWriter.Write([]byte("Revised thread text"))
	}))
	defer proxyServer.Close()

	adapter := newOfficialAdapter(testingInstance, proxyServer.URL, proxyServer.Client())
	operation, operationError := transformation.ParseOperation("polish")
	if operationError != nil {
		testingInstance.Fatalf("parse operation: %v", operationError)
	}
	prompt, promptError := transformation.BuildPrompt(operation, "Original thread text")
	if promptError != nil {
		testingInstance.Fatalf("build prompt: %v", promptError)
	}
	responseText, completionError := adapter.Complete(context.Background(), prompt)
	if completionError != nil {
		testingInstance.Fatalf("complete: %v", completionError)
	}

	if responseText != "Revised thread text" {
		testingInstance.Fatalf("response=%q", responseText)
	}
	if captured.path != "/v2" {
		testingInstance.Fatalf("path=%q", captured.path)
	}
	if !captured.secretWasCorrect {
		testingInstance.Fatal("tenant secret did not reach the official client boundary")
	}
	if captured.query.Get("provider") != "openai" || captured.query.Get("format") != "text/plain" {
		testingInstance.Fatalf("query=%v", captured.query)
	}
	if len(captured.query) != 2 {
		testingInstance.Fatalf("official client sent unexpected non-secret query fields")
	}
	if captured.requestTimeout != "37" {
		testingInstance.Fatalf("timeout header=%q", captured.requestTimeout)
	}
	if captured.requestBody["model"] != "gpt-5.6-terra" {
		testingInstance.Fatalf("model=%v", captured.requestBody["model"])
	}
	if captured.requestBody["reasoning_effort"] != "medium" {
		testingInstance.Fatalf("reasoning effort=%v", captured.requestBody["reasoning_effort"])
	}
	if captured.requestBody["max_tokens"] != float64(2048) {
		testingInstance.Fatalf("max tokens=%v", captured.requestBody["max_tokens"])
	}
	if captured.requestBody["web_search"] != false {
		testingInstance.Fatalf("web search=%v", captured.requestBody["web_search"])
	}
	messageValues, messagesOK := captured.requestBody["messages"].([]any)
	if !messagesOK || len(messageValues) != 2 {
		testingInstance.Fatalf("official client sent an unexpected message count")
	}
	for messageIndex, messageValue := range messageValues {
		messageRecord, messageRecordOK := messageValue.(map[string]any)
		if !messageRecordOK ||
			messageRecord["role"] != prompt.Messages[messageIndex].Role ||
			messageRecord["content"] != prompt.Messages[messageIndex].Content {
			testingInstance.Fatalf("official client changed prompt message %d", messageIndex)
		}
	}
	if _, promptExists := captured.requestBody["prompt"]; promptExists {
		testingInstance.Fatal("legacy prompt field reached request body")
	}
	if len(captured.requestBody) != 5 {
		testingInstance.Fatal("official client sent an unexpected request body field")
	}
}

func TestOfficialClientBoundaryPropagatesCancellation(testingInstance *testing.T) {
	requestStarted := make(chan struct{})
	releaseServerRequest := make(chan struct{})
	var releaseOnce sync.Once
	proxyServer := httptest.NewServer(http.HandlerFunc(func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		close(requestStarted)
		select {
		case <-httpRequest.Context().Done():
		case <-releaseServerRequest:
		}
	}))
	testingInstance.Cleanup(func() {
		releaseOnce.Do(func() { close(releaseServerRequest) })
		proxyServer.CloseClientConnections()
		proxyServer.Close()
	})

	adapter := newOfficialAdapter(testingInstance, proxyServer.URL, proxyServer.Client())
	operation, operationError := transformation.ParseOperation("expand")
	if operationError != nil {
		testingInstance.Fatalf("parse operation: %v", operationError)
	}
	requestContext, cancelRequest := context.WithCancel(context.Background())
	prompt, promptError := transformation.BuildPrompt(operation, "Source")
	if promptError != nil {
		testingInstance.Fatalf("build prompt: %v", promptError)
	}
	completionResult := make(chan error, 1)
	go func() {
		_, completionError := adapter.Complete(requestContext, prompt)
		completionResult <- completionError
	}()
	<-requestStarted
	cancelRequest()

	select {
	case completionError := <-completionResult:
		if !errors.Is(completionError, context.Canceled) {
			testingInstance.Fatalf("completion error=%v", completionError)
		}
	case <-time.After(time.Second):
		testingInstance.Fatal("canceled request did not stop")
	}
	releaseOnce.Do(func() { close(releaseServerRequest) })
}

func TestOfficialClientBoundarySanitizesUpstreamFailure(testingInstance *testing.T) {
	proxyServer := httptest.NewServer(http.HandlerFunc(func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		responseWriter.WriteHeader(http.StatusBadGateway)
		_, _ = responseWriter.Write([]byte("provider-body-with-sensitive-source"))
	}))
	defer proxyServer.Close()

	adapter := newOfficialAdapter(testingInstance, proxyServer.URL, proxyServer.Client())
	operation, operationError := transformation.ParseOperation("punch_up")
	if operationError != nil {
		testingInstance.Fatalf("parse operation: %v", operationError)
	}
	prompt, promptError := transformation.BuildPrompt(operation, "Source")
	if promptError != nil {
		testingInstance.Fatalf("build prompt: %v", promptError)
	}
	_, completionError := adapter.Complete(context.Background(), prompt)
	if !errors.Is(completionError, transformation.ErrUpstreamFailure) {
		testingInstance.Fatalf("completion error=%v", completionError)
	}
	if strings.Contains(completionError.Error(), "provider-body") {
		testingInstance.Fatalf("upstream body leaked through sanitized error=%v", completionError)
	}
}

func TestOfficialClientBoundaryClassifiesProxyTimeoutWithoutLeakingBody(testingInstance *testing.T) {
	proxyServer := httptest.NewServer(http.HandlerFunc(func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		responseWriter.WriteHeader(http.StatusGatewayTimeout)
		_, _ = responseWriter.Write([]byte("timeout-body-with-sensitive-source"))
	}))
	defer proxyServer.Close()

	adapter := newOfficialAdapter(testingInstance, proxyServer.URL, proxyServer.Client())
	operation, operationError := transformation.ParseOperation("polish")
	if operationError != nil {
		testingInstance.Fatalf("parse operation: %v", operationError)
	}
	prompt, promptError := transformation.BuildPrompt(operation, "Source")
	if promptError != nil {
		testingInstance.Fatalf("build prompt: %v", promptError)
	}
	_, completionError := adapter.Complete(context.Background(), prompt)
	if !errors.Is(completionError, context.DeadlineExceeded) {
		testingInstance.Fatalf("completion error=%v", completionError)
	}
	if strings.Contains(completionError.Error(), "timeout-body") {
		testingInstance.Fatalf("timeout body leaked through sanitized error=%v", completionError)
	}
}

func newOfficialAdapter(testingInstance *testing.T, baseURL string, httpClient *http.Client) *llmproxyadapter.Adapter {
	testingInstance.Helper()
	clientConfig, configError := llmproxyclient.NewConfig(llmproxyclient.ConfigInput{
		BaseURL:  baseURL,
		Secret:   proxySecret,
		Provider: "openai",
	})
	if configError != nil {
		testingInstance.Fatalf("official config: %v", configError)
	}
	officialClient, clientError := llmproxyclient.NewClient(clientConfig, httpClient)
	if clientError != nil {
		testingInstance.Fatalf("official client: %v", clientError)
	}
	adapter, adapterError := llmproxyadapter.New(officialClient, llmproxyadapter.Settings{
		Model:                 "gpt-5.6-terra",
		ReasoningEffort:       "medium",
		RequestTimeoutSeconds: 37,
		MaxOutputTokens:       2048,
	})
	if adapterError != nil {
		testingInstance.Fatalf("adapter: %v", adapterError)
	}
	return adapter
}
