// Command fake-llm-proxy provides a content-free local LLM Proxy boundary for tests and development.
package main

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	fakeProxyAddress       = ":8080"
	fakeProxySecretEnvName = "LLM_PROXY_SECRET"
)

type fakeMessagesRequest struct {
	Messages        []fakeMessage `json:"messages"`
	Model           string        `json:"model"`
	WebSearch       bool          `json:"web_search"`
	MaxTokens       int           `json:"max_tokens"`
	ReasoningEffort string        `json:"reasoning_effort"`
}

type fakeMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	secret := strings.TrimSpace(os.Getenv(fakeProxySecretEnvName))
	if secret == "" {
		logger.Error("fake LLM Proxy configuration failed", "outcome", "missing_secret")
		os.Exit(1)
	}
	multiplexer := http.NewServeMux()
	multiplexer.HandleFunc("GET /healthz", func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		responseWriter.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = responseWriter.Write([]byte(`{"status":"ok"}`))
	})
	multiplexer.HandleFunc("POST /v2", func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		if httpRequest.URL.Query().Get("key") != secret || httpRequest.URL.Query().Get("format") != "text/plain" {
			http.Error(responseWriter, "unauthorized", http.StatusUnauthorized)
			return
		}
		decoder := json.NewDecoder(httpRequest.Body)
		decoder.DisallowUnknownFields()
		var requestPayload fakeMessagesRequest
		if decodeError := decoder.Decode(&requestPayload); decodeError != nil || len(requestPayload.Messages) == 0 {
			http.Error(responseWriter, "invalid request", http.StatusBadRequest)
			return
		}
		responseWriter.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = responseWriter.Write([]byte("Local fake transformation result."))
	})
	httpServer := &http.Server{
		Addr:              fakeProxyAddress,
		Handler:           multiplexer,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	logger.Info("fake LLM Proxy started", "address", fakeProxyAddress)
	if serverError := httpServer.ListenAndServe(); serverError != nil && serverError != http.ErrServerClosed {
		logger.Error("fake LLM Proxy stopped", "outcome", "runtime_failure")
		os.Exit(1)
	}
}
