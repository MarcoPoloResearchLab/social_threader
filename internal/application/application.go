// Package application composes the Social Threader API dependency graph.
package application

import (
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/MarcoPoloResearchLab/social_threader/internal/authorization"
	"github.com/MarcoPoloResearchLab/social_threader/internal/configuration"
	"github.com/MarcoPoloResearchLab/social_threader/internal/httpapi"
	"github.com/MarcoPoloResearchLab/social_threader/internal/llmproxyadapter"
	"github.com/MarcoPoloResearchLab/social_threader/internal/transformation"
	"github.com/tyemirov/llm-proxy/pkg/llmproxyclient"
)

// Input supplies validated configuration and process-owned adapters.
type Input struct {
	Config     configuration.Config
	HTTPClient llmproxyclient.HTTPDoer
	Logger     *slog.Logger
	Clock      func() time.Time
}

// New constructs one official proxy client and injects the complete HTTP handler graph.
func New(input Input) (http.Handler, error) {
	proxyClientConfig, proxyConfigError := llmproxyclient.NewConfig(llmproxyclient.ConfigInput{
		BaseURL:  input.Config.LLMProxy.BaseURL,
		Secret:   input.Config.LLMProxy.Secret,
		Provider: input.Config.LLMProxy.Provider,
	})
	if proxyConfigError != nil {
		return nil, fmt.Errorf("application.new: proxy config: %w", proxyConfigError)
	}
	proxyClient, proxyClientError := llmproxyclient.NewClient(proxyClientConfig, input.HTTPClient)
	if proxyClientError != nil {
		return nil, fmt.Errorf("application.new: proxy client: %w", proxyClientError)
	}
	completionAdapter, adapterError := llmproxyadapter.New(proxyClient, llmproxyadapter.Settings{
		Model:                 input.Config.LLMProxy.Model,
		ReasoningEffort:       input.Config.LLMProxy.ReasoningEffort,
		RequestTimeoutSeconds: input.Config.LLMProxy.RequestTimeoutSeconds,
		MaxOutputTokens:       input.Config.Limits.MaxOutputTokens,
	})
	if adapterError != nil {
		return nil, fmt.Errorf("application.new: completion adapter: %w", adapterError)
	}
	transformationService, serviceError := transformation.NewService(
		completionAdapter,
		input.Config.Limits.MaxResponseCharacters,
	)
	if serviceError != nil {
		return nil, fmt.Errorf("application.new: transformation service: %w", serviceError)
	}
	tauthAuthorizer, authorizerError := authorization.NewTAuthAuthorizer(authorization.TAuthConfig{
		SigningKey: []byte(input.Config.Auth.SigningKey),
		Issuer:     input.Config.Auth.Issuer,
		CookieName: input.Config.SelectedProfile.SessionCookieName,
		TenantID:   input.Config.SelectedProfile.TenantID,
	})
	if authorizerError != nil {
		return nil, fmt.Errorf("application.new: TAuth authorizer: %w", authorizerError)
	}
	httpHandler, apiError := httpapi.New(httpapi.Input{
		Transformer: transformationService,
		Authorizer:  tauthAuthorizer,
		Policy: httpapi.Policy{
			AllowedFrontendOrigin: input.Config.SelectedProfile.FrontendOrigin,
			MaxBodyBytes:          input.Config.Limits.MaxBodyBytes,
			MaxInputCharacters:    input.Config.Limits.MaxInputCharacters,
			PerUserRequests:       input.Config.Limits.PerUserRequests,
			RateWindow:            time.Duration(input.Config.Limits.RateWindowSeconds) * time.Second,
			GlobalConcurrency:     input.Config.Limits.GlobalConcurrency,
			IdempotencyRetention: time.Duration(
				input.Config.Limits.IdempotencyRetentionSeconds,
			) * time.Second,
			CapacityMaxRequests: input.Config.Limits.Capacity.MaxRequests,
			CapacityWindow: time.Duration(
				input.Config.Limits.Capacity.WindowSeconds,
			) * time.Second,
		},
		Logger: input.Logger,
		Clock:  input.Clock,
	})
	if apiError != nil {
		return nil, fmt.Errorf("application.new: HTTP API: %w", apiError)
	}
	return httpHandler, nil
}
