// Package configuration loads and validates the Social Threader API configuration.
package configuration

// Config is the validated API runtime configuration.
type Config struct {
	Server            ServerConfig
	LLMProxy          LLMProxyConfig
	Auth              AuthConfig
	Limits            LimitsConfig
	ApplicationPolicy ApplicationPolicy
	SelectedProfile   Profile
	Profiles          Profiles
}

// ServerConfig controls the HTTP server lifecycle.
type ServerConfig struct {
	Address                  string
	ReadHeaderTimeoutSeconds int
	IdleTimeoutSeconds       int
	ShutdownTimeoutSeconds   int
}

// LLMProxyConfig controls the official LLM Proxy client.
type LLMProxyConfig struct {
	BaseURL               string
	Secret                string
	Provider              string
	Model                 string
	ReasoningEffort       string
	RequestTimeoutSeconds int
}

// AuthConfig controls TAuth session validation.
type AuthConfig struct {
	SigningKey string
	Issuer     string
	TenantID   string
}

// CapacityConfig controls the global request circuit breaker.
type CapacityConfig struct {
	Enabled       bool
	MaxRequests   int
	WindowSeconds int
}

// LimitsConfig controls request size and paid-compute admission.
type LimitsConfig struct {
	MaxBodyBytes                int64
	MaxInputCharacters          int
	MaxResponseCharacters       int
	MaxOutputTokens             int
	PerUserRequests             int
	RateWindowSeconds           int
	GlobalConcurrency           int
	IdempotencyRetentionSeconds int
	Capacity                    CapacityConfig
}

// ApplicationPolicy makes content-handling restrictions explicit.
type ApplicationPolicy struct {
	PersistText    bool
	LogContent     bool
	AutomaticRetry bool
}

// Profile defines one exact browser, auth, and runtime topology.
type Profile struct {
	Name               string
	FrontendOrigin     string
	APIOrigin          string
	TAuthBrowserOrigin string
	OAuthCallback      string
	TenantID           string
	SessionCookieName  string
	RefreshCookieName  string
	CookieDomain       string
	CookieSecure       bool
	CookieSameSite     string
	CORSCredentials    bool
	DNSOwner           string
	ReverseProxyOwner  string
	UpstreamService    string
	ContainerPort      int
}

// Profiles contains the two supported application profiles.
type Profiles struct {
	Local  Profile
	Hosted Profile
}

type rawConfig struct {
	Server            rawServerConfig      `yaml:"server"`
	LLMProxy          rawLLMProxyConfig    `yaml:"llm_proxy"`
	Auth              rawAuthConfig        `yaml:"auth"`
	Profiles          rawProfiles          `yaml:"profiles"`
	Limits            rawLimitsConfig      `yaml:"limits"`
	ApplicationPolicy rawApplicationPolicy `yaml:"application_policy"`
}

type rawServerConfig struct {
	Address                  *string `yaml:"address"`
	ReadHeaderTimeoutSeconds *int    `yaml:"read_header_timeout_seconds"`
	IdleTimeoutSeconds       *int    `yaml:"idle_timeout_seconds"`
	ShutdownTimeoutSeconds   *int    `yaml:"shutdown_timeout_seconds"`
}

type rawLLMProxyConfig struct {
	BaseURL               *string `yaml:"base_url"`
	Secret                *string `yaml:"secret"`
	Provider              *string `yaml:"provider"`
	Model                 *string `yaml:"model"`
	ReasoningEffort       *string `yaml:"reasoning_effort"`
	RequestTimeoutSeconds *int    `yaml:"request_timeout_seconds"`
}

type rawAuthConfig struct {
	SigningKey *string `yaml:"signing_key"`
	Issuer     *string `yaml:"issuer"`
	TenantID   *string `yaml:"tenant_id"`
}

type rawProfiles struct {
	Selected *string    `yaml:"selected"`
	Local    rawProfile `yaml:"local"`
	Hosted   rawProfile `yaml:"hosted"`
}

type rawProfile struct {
	FrontendOrigin     *string `yaml:"frontend_origin"`
	APIOrigin          *string `yaml:"api_origin"`
	TAuthBrowserOrigin *string `yaml:"tauth_browser_origin"`
	OAuthCallback      *string `yaml:"oauth_callback"`
	TenantID           *string `yaml:"tenant_id"`
	SessionCookieName  *string `yaml:"session_cookie_name"`
	RefreshCookieName  *string `yaml:"refresh_cookie_name"`
	CookieDomain       *string `yaml:"cookie_domain"`
	CookieSecure       *bool   `yaml:"cookie_secure"`
	CookieSameSite     *string `yaml:"cookie_same_site"`
	CORSCredentials    *bool   `yaml:"cors_credentials"`
	DNSOwner           *string `yaml:"dns_owner"`
	ReverseProxyOwner  *string `yaml:"reverse_proxy_owner"`
	UpstreamService    *string `yaml:"upstream_service"`
	ContainerPort      *int    `yaml:"container_port"`
}

type rawLimitsConfig struct {
	MaxBodyBytes                *int64            `yaml:"max_body_bytes"`
	MaxInputCharacters          *int              `yaml:"max_input_characters"`
	MaxResponseCharacters       *int              `yaml:"max_response_characters"`
	MaxOutputTokens             *int              `yaml:"max_output_tokens"`
	PerUserRequests             *int              `yaml:"per_user_requests"`
	RateWindowSeconds           *int              `yaml:"rate_window_seconds"`
	GlobalConcurrency           *int              `yaml:"global_concurrency"`
	IdempotencyRetentionSeconds *int              `yaml:"idempotency_retention_seconds"`
	Capacity                    rawCapacityConfig `yaml:"capacity"`
}

type rawCapacityConfig struct {
	Enabled       *bool `yaml:"enabled"`
	MaxRequests   *int  `yaml:"max_requests"`
	WindowSeconds *int  `yaml:"window_seconds"`
}

type rawApplicationPolicy struct {
	PersistText    *bool `yaml:"persist_text"`
	LogContent     *bool `yaml:"log_content"`
	AutomaticRetry *bool `yaml:"automatic_retry"`
}
