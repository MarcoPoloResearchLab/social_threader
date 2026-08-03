package configuration

import (
	"errors"
	"net"
	"regexp"
	"strconv"
)

const requiredJWTIssuer = "tauth"

var routingIdentifierPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{0,127}$`)

func validateRawConfig(raw rawConfig) (Config, error) {
	serverConfig, serverError := validateServer(raw.Server)
	if serverError != nil {
		return Config{}, serverError
	}
	proxyConfig, proxyError := validateLLMProxy(raw.LLMProxy)
	if proxyError != nil {
		return Config{}, proxyError
	}
	authConfig, authError := validateAuth(raw.Auth)
	if authError != nil {
		return Config{}, authError
	}
	profiles, selectedProfile, profilesError := validateProfiles(raw.Profiles, authConfig.TenantID)
	if profilesError != nil {
		return Config{}, profilesError
	}
	limits, limitsError := validateLimits(raw.Limits)
	if limitsError != nil {
		return Config{}, limitsError
	}
	applicationPolicy, policyError := validateApplicationPolicy(raw.ApplicationPolicy)
	if policyError != nil {
		return Config{}, policyError
	}
	return Config{
		Server:            serverConfig,
		LLMProxy:          proxyConfig,
		Auth:              authConfig,
		Limits:            limits,
		ApplicationPolicy: applicationPolicy,
		SelectedProfile:   selectedProfile,
		Profiles:          profiles,
	}, nil
}

func validateServer(raw rawServerConfig) (ServerConfig, error) {
	address, addressError := requiredString("server.address", raw.Address)
	if addressError != nil {
		return ServerConfig{}, addressError
	}
	_, portText, splitError := net.SplitHostPort(address)
	portNumber, portError := strconv.Atoi(portText)
	if splitError != nil || portError != nil || portNumber <= 0 || portNumber > 65535 {
		return ServerConfig{}, errors.New("configuration.invalid: server.address must include a positive port")
	}
	readHeaderTimeout, readHeaderError := requiredPositiveInteger("server.read_header_timeout_seconds", raw.ReadHeaderTimeoutSeconds)
	if readHeaderError != nil {
		return ServerConfig{}, readHeaderError
	}
	idleTimeout, idleError := requiredPositiveInteger("server.idle_timeout_seconds", raw.IdleTimeoutSeconds)
	if idleError != nil {
		return ServerConfig{}, idleError
	}
	shutdownTimeout, timeoutError := requiredPositiveInteger("server.shutdown_timeout_seconds", raw.ShutdownTimeoutSeconds)
	if timeoutError != nil {
		return ServerConfig{}, timeoutError
	}
	return ServerConfig{
		Address:                  address,
		ReadHeaderTimeoutSeconds: readHeaderTimeout,
		IdleTimeoutSeconds:       idleTimeout,
		ShutdownTimeoutSeconds:   shutdownTimeout,
	}, nil
}

func validateLLMProxy(raw rawLLMProxyConfig) (LLMProxyConfig, error) {
	baseURL, baseURLError := requiredHTTPURL("llm_proxy.base_url", raw.BaseURL, false)
	if baseURLError != nil {
		return LLMProxyConfig{}, baseURLError
	}
	secret, secretError := requiredString("llm_proxy.secret", raw.Secret)
	if secretError != nil {
		return LLMProxyConfig{}, secretError
	}
	provider, providerError := requiredCanonicalName("llm_proxy.provider", raw.Provider)
	if providerError != nil {
		return LLMProxyConfig{}, providerError
	}
	model, modelError := requiredRoutingIdentifier("llm_proxy.model", raw.Model)
	if modelError != nil {
		return LLMProxyConfig{}, modelError
	}
	reasoningEffort, reasoningError := requiredString("llm_proxy.reasoning_effort", raw.ReasoningEffort)
	if reasoningError != nil {
		return LLMProxyConfig{}, reasoningError
	}
	if !isSupportedReasoningEffort(reasoningEffort) {
		return LLMProxyConfig{}, errors.New("configuration.invalid: llm_proxy.reasoning_effort is unsupported")
	}
	requestTimeout, timeoutError := requiredPositiveInteger("llm_proxy.request_timeout_seconds", raw.RequestTimeoutSeconds)
	if timeoutError != nil {
		return LLMProxyConfig{}, timeoutError
	}
	return LLMProxyConfig{
		BaseURL:               baseURL,
		Secret:                secret,
		Provider:              provider,
		Model:                 model,
		ReasoningEffort:       reasoningEffort,
		RequestTimeoutSeconds: requestTimeout,
	}, nil
}

func requiredRoutingIdentifier(fieldName string, fieldValue *string) (string, error) {
	value, valueError := requiredString(fieldName, fieldValue)
	if valueError != nil {
		return "", valueError
	}
	if !routingIdentifierPattern.MatchString(value) {
		return "", errors.New("configuration.invalid: " + fieldName + " must be a routing identifier")
	}
	return value, nil
}

func isSupportedReasoningEffort(value string) bool {
	switch value {
	case "none", "minimal", "low", "medium", "high", "xhigh", "max":
		return true
	default:
		return false
	}
}

func validateAuth(raw rawAuthConfig) (AuthConfig, error) {
	signingKey, signingKeyError := requiredString("auth.signing_key", raw.SigningKey)
	if signingKeyError != nil {
		return AuthConfig{}, signingKeyError
	}
	issuer, issuerError := requiredString("auth.issuer", raw.Issuer)
	if issuerError != nil {
		return AuthConfig{}, issuerError
	}
	if issuer != requiredJWTIssuer {
		return AuthConfig{}, errors.New("configuration.invalid: auth.issuer must be tauth")
	}
	tenantID, tenantError := requiredCanonicalName("auth.tenant_id", raw.TenantID)
	if tenantError != nil {
		return AuthConfig{}, tenantError
	}
	return AuthConfig{SigningKey: signingKey, Issuer: issuer, TenantID: tenantID}, nil
}

func validateLimits(raw rawLimitsConfig) (LimitsConfig, error) {
	maxBodyBytes, bodyError := requiredPositiveInteger64("limits.max_body_bytes", raw.MaxBodyBytes)
	if bodyError != nil {
		return LimitsConfig{}, bodyError
	}
	maxInputCharacters, inputError := requiredPositiveInteger("limits.max_input_characters", raw.MaxInputCharacters)
	if inputError != nil {
		return LimitsConfig{}, inputError
	}
	maxResponseCharacters, responseError := requiredPositiveInteger("limits.max_response_characters", raw.MaxResponseCharacters)
	if responseError != nil {
		return LimitsConfig{}, responseError
	}
	maxOutputTokens, outputError := requiredPositiveInteger("limits.max_output_tokens", raw.MaxOutputTokens)
	if outputError != nil {
		return LimitsConfig{}, outputError
	}
	perUserRequests, rateError := requiredPositiveInteger("limits.per_user_requests", raw.PerUserRequests)
	if rateError != nil {
		return LimitsConfig{}, rateError
	}
	rateWindowSeconds, windowError := requiredPositiveInteger("limits.rate_window_seconds", raw.RateWindowSeconds)
	if windowError != nil {
		return LimitsConfig{}, windowError
	}
	globalConcurrency, concurrencyError := requiredPositiveInteger("limits.global_concurrency", raw.GlobalConcurrency)
	if concurrencyError != nil {
		return LimitsConfig{}, concurrencyError
	}
	idempotencyRetention, retentionError := requiredPositiveInteger("limits.idempotency_retention_seconds", raw.IdempotencyRetentionSeconds)
	if retentionError != nil {
		return LimitsConfig{}, retentionError
	}
	capacityEnabled, enabledError := requiredBoolean("limits.capacity.enabled", raw.Capacity.Enabled)
	if enabledError != nil {
		return LimitsConfig{}, enabledError
	}
	if !capacityEnabled {
		return LimitsConfig{}, errors.New("configuration.invalid: limits.capacity.enabled must be true")
	}
	capacityMaxRequests, capacityCountError := requiredPositiveInteger("limits.capacity.max_requests", raw.Capacity.MaxRequests)
	if capacityCountError != nil {
		return LimitsConfig{}, capacityCountError
	}
	capacityWindowSeconds, capacityWindowError := requiredPositiveInteger("limits.capacity.window_seconds", raw.Capacity.WindowSeconds)
	if capacityWindowError != nil {
		return LimitsConfig{}, capacityWindowError
	}
	return LimitsConfig{
		MaxBodyBytes:                maxBodyBytes,
		MaxInputCharacters:          maxInputCharacters,
		MaxResponseCharacters:       maxResponseCharacters,
		MaxOutputTokens:             maxOutputTokens,
		PerUserRequests:             perUserRequests,
		RateWindowSeconds:           rateWindowSeconds,
		GlobalConcurrency:           globalConcurrency,
		IdempotencyRetentionSeconds: idempotencyRetention,
		Capacity: CapacityConfig{
			Enabled:       capacityEnabled,
			MaxRequests:   capacityMaxRequests,
			WindowSeconds: capacityWindowSeconds,
		},
	}, nil
}

func validateApplicationPolicy(raw rawApplicationPolicy) (ApplicationPolicy, error) {
	persistText, persistError := requiredBoolean("application_policy.persist_text", raw.PersistText)
	if persistError != nil {
		return ApplicationPolicy{}, persistError
	}
	logContent, logError := requiredBoolean("application_policy.log_content", raw.LogContent)
	if logError != nil {
		return ApplicationPolicy{}, logError
	}
	automaticRetry, retryError := requiredBoolean("application_policy.automatic_retry", raw.AutomaticRetry)
	if retryError != nil {
		return ApplicationPolicy{}, retryError
	}
	if persistText || logContent || automaticRetry {
		return ApplicationPolicy{}, errors.New("configuration.invalid: application policy must disable persistence, content logging, and automatic retry")
	}
	return ApplicationPolicy{PersistText: persistText, LogContent: logContent, AutomaticRetry: automaticRetry}, nil
}
