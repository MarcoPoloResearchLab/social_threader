// Package llmproxyadapter connects transformation prompts to the official LLM Proxy client.
package llmproxyadapter

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/MarcoPoloResearchLab/social_threader/internal/transformation"
	"github.com/tyemirov/llm-proxy/pkg/llmproxyclient"
)

const officialGatewayTimeoutMarker = "status=504 body="

type messagesPoster interface {
	PostMessages(contextValue context.Context, request llmproxyclient.MessagesRequest) (string, error)
}

// Settings contains request-scoped policy from the canonical application configuration.
type Settings struct {
	Model                 string
	ReasoningEffort       string
	RequestTimeoutSeconds int
	MaxOutputTokens       int
}

// Adapter uses the released official client for provider-neutral completions.
type Adapter struct {
	client   messagesPoster
	settings Settings
}

// New validates request policy and constructs an application-owned adapter.
func New(client messagesPoster, settings Settings) (*Adapter, error) {
	if client == nil {
		return nil, errors.New("llmproxyadapter.new: client is required")
	}
	settings.Model = strings.TrimSpace(settings.Model)
	settings.ReasoningEffort = strings.TrimSpace(settings.ReasoningEffort)
	if settings.Model == "" {
		return nil, errors.New("llmproxyadapter.new: model is required")
	}
	if settings.ReasoningEffort == "" {
		return nil, errors.New("llmproxyadapter.new: reasoning effort is required")
	}
	if settings.RequestTimeoutSeconds <= 0 {
		return nil, errors.New("llmproxyadapter.new: request timeout must be positive")
	}
	if settings.MaxOutputTokens <= 0 {
		return nil, errors.New("llmproxyadapter.new: max output tokens must be positive")
	}
	return &Adapter{client: client, settings: settings}, nil
}

// Complete maps an application prompt to one official messages request.
func (adapter *Adapter) Complete(contextValue context.Context, prompt transformation.Prompt) (string, error) {
	messages := make([]llmproxyclient.MessageInput, 0, len(prompt.Messages))
	for _, promptMessage := range prompt.Messages {
		messages = append(messages, llmproxyclient.MessageInput{
			Role:    promptMessage.Role,
			Content: promptMessage.Content,
		})
	}
	maxOutputTokens := adapter.settings.MaxOutputTokens
	reasoningEffort := adapter.settings.ReasoningEffort
	requestTimeoutSeconds := adapter.settings.RequestTimeoutSeconds
	messagesRequest, requestError := llmproxyclient.NewMessagesRequest(llmproxyclient.MessagesRequestInput{
		Messages:              messages,
		Model:                 adapter.settings.Model,
		WebSearch:             false,
		MaxTokens:             &maxOutputTokens,
		ReasoningEffort:       &reasoningEffort,
		RequestTimeoutSeconds: &requestTimeoutSeconds,
	})
	if requestError != nil {
		return "", fmt.Errorf("llmproxyadapter.complete: construct official request: %w", transformation.ErrUpstreamFailure)
	}
	responseText, postError := adapter.client.PostMessages(contextValue, messagesRequest)
	if postError != nil {
		if contextError := contextValue.Err(); contextError != nil {
			return "", fmt.Errorf("llmproxyadapter.complete: %w", contextError)
		}
		if errors.Is(postError, llmproxyclient.ErrClientHTTPFailure) &&
			strings.Contains(postError.Error(), officialGatewayTimeoutMarker) {
			return "", fmt.Errorf("llmproxyadapter.complete: %w", context.DeadlineExceeded)
		}
		return "", fmt.Errorf("llmproxyadapter.complete: %w", transformation.ErrUpstreamFailure)
	}
	return responseText, nil
}
