package configuration_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/MarcoPoloResearchLab/social_threader/internal/configuration"
)

const validConfiguration = `server:
  address: "127.0.0.1:8080"
  read_header_timeout_seconds: 5
  idle_timeout_seconds: 60
  shutdown_timeout_seconds: 10
llm_proxy:
  base_url: "${LLM_PROXY_BASE_URL}"
  secret: "${LLM_PROXY_SECRET}"
  provider: "openai"
  model: "gpt-5.6-terra"
  reasoning_effort: "medium"
  request_timeout_seconds: 30
auth:
  signing_key: "${TAUTH_JWT_SIGNING_KEY}"
  issuer: "tauth"
  tenant_id: "social-threader"
profiles:
  selected: "${SOCIAL_THREADER_PROFILE}"
  local:
    frontend_origin: "http://localhost:4173"
    api_origin: "http://localhost:4173"
    tauth_browser_origin: ""
    oauth_callback: "http://localhost:4173/auth/google/callback"
    tenant_id: "social-threader"
    session_cookie_name: "social_threader_development_session"
    refresh_cookie_name: "social_threader_development_refresh"
    cookie_domain: ""
    cookie_secure: false
    cookie_same_site: "Lax"
    cors_credentials: true
    dns_owner: "local operator"
    reverse_proxy_owner: "local Caddy front door"
    upstream_service: "social-threader-api"
    container_port: 8080
  hosted:
    frontend_origin: "https://threader.mprlab.com"
    api_origin: "https://threader-api.mprlab.com"
    tauth_browser_origin: "https://tauth-api.mprlab.com"
    oauth_callback: "https://tauth-api.mprlab.com/auth/google/callback"
    tenant_id: "social-threader"
    session_cookie_name: "social_threader_session"
    refresh_cookie_name: "social_threader_refresh"
    cookie_domain: ".mprlab.com"
    cookie_secure: true
    cookie_same_site: "Lax"
    cors_credentials: true
    dns_owner: "mprlab-gateway DNS handler"
    reverse_proxy_owner: "mprlab-gateway Caddy handler"
    upstream_service: "social-threader-api"
    container_port: 8080
limits:
  max_body_bytes: 8192
  max_input_characters: 5000
  max_response_characters: 10000
  max_output_tokens: 2048
  per_user_requests: 5
  rate_window_seconds: 60
  global_concurrency: 2
  idempotency_retention_seconds: 300
  capacity:
    enabled: true
    max_requests: 100
    window_seconds: 3600
application_policy:
  persist_text: false
  log_content: false
  automatic_retry: false
`

func TestLoadExpandsEnvironmentAndSelectsOneValidatedProfile(testingInstance *testing.T) {
	setConfigurationEnvironment(testingInstance)
	configurationPath := writeConfiguration(testingInstance, validConfiguration)

	loadedConfiguration, loadError := configuration.Load(configurationPath)
	if loadError != nil {
		testingInstance.Fatalf("load configuration: %v", loadError)
	}

	if loadedConfiguration.LLMProxy.BaseURL != "http://proxy.local" {
		testingInstance.Fatalf("base URL=%q", loadedConfiguration.LLMProxy.BaseURL)
	}
	if loadedConfiguration.LLMProxy.Secret != "test-tenant-secret" {
		testingInstance.Fatalf("secret was not expanded")
	}
	if loadedConfiguration.Auth.SigningKey != "test-signing-key" {
		testingInstance.Fatalf("signing key was not expanded")
	}
	if loadedConfiguration.SelectedProfile.Name != "local" {
		testingInstance.Fatalf("selected profile=%q", loadedConfiguration.SelectedProfile.Name)
	}
	if loadedConfiguration.SelectedProfile.SessionCookieName != "social_threader_development_session" {
		testingInstance.Fatalf("session cookie=%q", loadedConfiguration.SelectedProfile.SessionCookieName)
	}
}

func TestLoadRejectsEveryMissingOrMalformedRequiredField(testingInstance *testing.T) {
	setConfigurationEnvironment(testingInstance)

	testCases := []struct {
		name        string
		oldValue    string
		replacement string
	}{
		{name: "server address missing", oldValue: "  address: \"127.0.0.1:8080\"\n", replacement: ""},
		{name: "server address malformed", oldValue: "127.0.0.1:8080", replacement: "not-an-address"},
		{name: "server port must be numeric", oldValue: "127.0.0.1:8080", replacement: "127.0.0.1:http"},
		{name: "server port must be in range", oldValue: "127.0.0.1:8080", replacement: "127.0.0.1:70000"},
		{name: "server read header timeout invalid", oldValue: "  read_header_timeout_seconds: 5", replacement: "  read_header_timeout_seconds: 0"},
		{name: "server idle timeout invalid", oldValue: "  idle_timeout_seconds: 60", replacement: "  idle_timeout_seconds: 0"},
		{name: "server shutdown timeout invalid", oldValue: "  shutdown_timeout_seconds: 10", replacement: "  shutdown_timeout_seconds: 0"},
		{name: "proxy base URL missing", oldValue: "  base_url: \"${LLM_PROXY_BASE_URL}\"\n", replacement: ""},
		{name: "proxy base URL malformed", oldValue: "${LLM_PROXY_BASE_URL}", replacement: "file:///tmp/proxy"},
		{name: "proxy secret missing", oldValue: "  secret: \"${LLM_PROXY_SECRET}\"\n", replacement: ""},
		{name: "proxy provider missing", oldValue: "  provider: \"openai\"\n", replacement: ""},
		{name: "proxy provider malformed", oldValue: "  provider: \"openai\"", replacement: "  provider: \"Open AI\""},
		{name: "proxy model missing", oldValue: "  model: \"gpt-5.6-terra\"\n", replacement: ""},
		{name: "proxy model malformed", oldValue: "  model: \"gpt-5.6-terra\"", replacement: "  model: \"gpt 5.6 terra\""},
		{name: "proxy reasoning effort missing", oldValue: "  reasoning_effort: \"medium\"\n", replacement: ""},
		{name: "proxy reasoning effort unsupported", oldValue: "  reasoning_effort: \"medium\"", replacement: "  reasoning_effort: \"extreme\""},
		{name: "proxy timeout invalid", oldValue: "  request_timeout_seconds: 30", replacement: "  request_timeout_seconds: 0"},
		{name: "auth signing key missing", oldValue: "  signing_key: \"${TAUTH_JWT_SIGNING_KEY}\"\n", replacement: ""},
		{name: "auth issuer missing", oldValue: "  issuer: \"tauth\"\n", replacement: ""},
		{name: "auth issuer invalid", oldValue: "  issuer: \"tauth\"", replacement: "  issuer: \"other\""},
		{name: "auth tenant missing", oldValue: "  tenant_id: \"social-threader\"\nprofiles:", replacement: "profiles:"},
		{name: "auth tenant malformed", oldValue: "  tenant_id: \"social-threader\"\nprofiles:", replacement: "  tenant_id: \"Social Threader\"\nprofiles:"},
		{name: "selected profile missing", oldValue: "  selected: \"${SOCIAL_THREADER_PROFILE}\"\n", replacement: ""},
		{name: "selected profile unknown", oldValue: "${SOCIAL_THREADER_PROFILE}", replacement: "preview"},
		{name: "local frontend origin malformed", oldValue: "    frontend_origin: \"http://localhost:4173\"", replacement: "    frontend_origin: \"localhost:4173\""},
		{name: "local API origin malformed", oldValue: "    api_origin: \"http://localhost:4173\"", replacement: "    api_origin: \"/api\""},
		{name: "local TAuth origin field missing", oldValue: "    tauth_browser_origin: \"\"\n", replacement: ""},
		{name: "local TAuth origin malformed", oldValue: "    tauth_browser_origin: \"\"", replacement: "    tauth_browser_origin: \"not-an-origin\""},
		{name: "local OAuth callback malformed", oldValue: "    oauth_callback: \"http://localhost:4173/auth/google/callback\"", replacement: "    oauth_callback: \"callback\""},
		{name: "local OAuth callback wrong path", oldValue: "    oauth_callback: \"http://localhost:4173/auth/google/callback\"", replacement: "    oauth_callback: \"http://localhost:4173/auth/other\""},
		{name: "local tenant mismatch", oldValue: "    tenant_id: \"social-threader\"", replacement: "    tenant_id: \"wrong-tenant\""},
		{name: "local session cookie missing", oldValue: "    session_cookie_name: \"social_threader_development_session\"", replacement: "    session_cookie_name: \"\""},
		{name: "local refresh cookie missing", oldValue: "    refresh_cookie_name: \"social_threader_development_refresh\"", replacement: "    refresh_cookie_name: \"\""},
		{name: "local cookie domain field missing", oldValue: "    cookie_domain: \"\"\n", replacement: ""},
		{name: "local cookie secure field missing", oldValue: "    cookie_secure: false\n", replacement: ""},
		{name: "local same site invalid", oldValue: "    cookie_same_site: \"Lax\"", replacement: "    cookie_same_site: \"Sometimes\""},
		{name: "local credentials disabled", oldValue: "    cors_credentials: true", replacement: "    cors_credentials: false"},
		{name: "local DNS owner missing", oldValue: "    dns_owner: \"local operator\"", replacement: "    dns_owner: \"\""},
		{name: "local proxy owner missing", oldValue: "    reverse_proxy_owner: \"local Caddy front door\"", replacement: "    reverse_proxy_owner: \"\""},
		{name: "local upstream missing", oldValue: "    upstream_service: \"social-threader-api\"", replacement: "    upstream_service: \"\""},
		{name: "local port invalid", oldValue: "    container_port: 8080", replacement: "    container_port: 0"},
		{name: "hosted frontend must use TLS", oldValue: "    frontend_origin: \"https://threader.mprlab.com\"", replacement: "    frontend_origin: \"http://threader.mprlab.com\""},
		{name: "hosted API must use TLS", oldValue: "    api_origin: \"https://threader-api.mprlab.com\"", replacement: "    api_origin: \"http://threader-api.mprlab.com\""},
		{name: "hosted TAuth origin missing", oldValue: "    tauth_browser_origin: \"https://tauth-api.mprlab.com\"", replacement: "    tauth_browser_origin: \"\""},
		{name: "hosted OAuth callback must use TLS", oldValue: "    oauth_callback: \"https://tauth-api.mprlab.com/auth/google/callback\"", replacement: "    oauth_callback: \"http://tauth-api.mprlab.com/auth/google/callback\""},
		{name: "hosted OAuth callback must use TAuth origin", oldValue: "    oauth_callback: \"https://tauth-api.mprlab.com/auth/google/callback\"", replacement: "    oauth_callback: \"https://other.mprlab.com/auth/google/callback\""},
		{name: "hosted tenant mismatch", oldValue: "    tenant_id: \"social-threader\"\n    session_cookie_name: \"social_threader_session\"", replacement: "    tenant_id: \"other-tenant\"\n    session_cookie_name: \"social_threader_session\""},
		{name: "hosted session cookie malformed", oldValue: "    session_cookie_name: \"social_threader_session\"", replacement: "    session_cookie_name: \"invalid-name\""},
		{name: "hosted refresh cookie missing", oldValue: "    refresh_cookie_name: \"social_threader_refresh\"\n", replacement: ""},
		{name: "hosted cookie domain missing", oldValue: "    cookie_domain: \".mprlab.com\"", replacement: "    cookie_domain: \"\""},
		{name: "hosted cookie domain malformed", oldValue: "    cookie_domain: \".mprlab.com\"", replacement: "    cookie_domain: \"not a domain\""},
		{name: "hosted cookie domain does not cover profiles", oldValue: "    cookie_domain: \".mprlab.com\"", replacement: "    cookie_domain: \".example.com\""},
		{name: "hosted cookie not secure", oldValue: "    cookie_secure: true", replacement: "    cookie_secure: false"},
		{name: "hosted same site missing", oldValue: "    cookie_same_site: \"Lax\"\n    cors_credentials: true\n    dns_owner: \"mprlab-gateway DNS handler\"", replacement: "    cors_credentials: true\n    dns_owner: \"mprlab-gateway DNS handler\""},
		{name: "hosted credentials disabled", oldValue: "    cors_credentials: true\n    dns_owner: \"mprlab-gateway DNS handler\"", replacement: "    cors_credentials: false\n    dns_owner: \"mprlab-gateway DNS handler\""},
		{name: "hosted DNS owner missing", oldValue: "    dns_owner: \"mprlab-gateway DNS handler\"", replacement: "    dns_owner: \"\""},
		{name: "hosted proxy owner missing", oldValue: "    reverse_proxy_owner: \"mprlab-gateway Caddy handler\"", replacement: "    reverse_proxy_owner: \"\""},
		{name: "hosted upstream missing", oldValue: "    upstream_service: \"social-threader-api\"\n    container_port: 8080\nlimits:", replacement: "    upstream_service: \"\"\n    container_port: 8080\nlimits:"},
		{name: "hosted port invalid", oldValue: "    container_port: 8080\nlimits:", replacement: "    container_port: 70000\nlimits:"},
		{name: "body limit invalid", oldValue: "  max_body_bytes: 8192", replacement: "  max_body_bytes: 0"},
		{name: "input limit invalid", oldValue: "  max_input_characters: 5000", replacement: "  max_input_characters: 0"},
		{name: "response limit invalid", oldValue: "  max_response_characters: 10000", replacement: "  max_response_characters: 0"},
		{name: "output token limit invalid", oldValue: "  max_output_tokens: 2048", replacement: "  max_output_tokens: 0"},
		{name: "rate count invalid", oldValue: "  per_user_requests: 5", replacement: "  per_user_requests: 0"},
		{name: "rate window invalid", oldValue: "  rate_window_seconds: 60", replacement: "  rate_window_seconds: 0"},
		{name: "concurrency invalid", oldValue: "  global_concurrency: 2", replacement: "  global_concurrency: 0"},
		{name: "idempotency retention invalid", oldValue: "  idempotency_retention_seconds: 300", replacement: "  idempotency_retention_seconds: 0"},
		{name: "capacity disabled", oldValue: "    enabled: true", replacement: "    enabled: false"},
		{name: "capacity count invalid", oldValue: "    max_requests: 100", replacement: "    max_requests: 0"},
		{name: "capacity window invalid", oldValue: "    window_seconds: 3600", replacement: "    window_seconds: 0"},
		{name: "text persistence enabled", oldValue: "  persist_text: false", replacement: "  persist_text: true"},
		{name: "content logging enabled", oldValue: "  log_content: false", replacement: "  log_content: true"},
		{name: "automatic retry enabled", oldValue: "  automatic_retry: false", replacement: "  automatic_retry: true"},
		{name: "unknown field", oldValue: "server:\n", replacement: "server:\n  unsupported: true\n"},
	}

	for _, testCase := range testCases {
		testingInstance.Run(testCase.name, func(subTest *testing.T) {
			configurationText := strings.Replace(validConfiguration, testCase.oldValue, testCase.replacement, 1)
			if configurationText == validConfiguration {
				subTest.Fatalf("test replacement did not change the fixture")
			}
			_, loadError := configuration.Load(writeConfiguration(subTest, configurationText))
			if loadError == nil {
				subTest.Fatal("expected configuration rejection")
			}
		})
	}
}

func TestLoadRejectsUnresolvedEnvironmentReference(testingInstance *testing.T) {
	setConfigurationEnvironment(testingInstance)
	if unsetError := os.Unsetenv("LLM_PROXY_SECRET"); unsetError != nil {
		testingInstance.Fatalf("unset secret: %v", unsetError)
	}

	_, loadError := configuration.Load(writeConfiguration(testingInstance, validConfiguration))
	if loadError == nil {
		testingInstance.Fatal("expected unresolved environment reference rejection")
	}
}

func TestLoadExpandsSecretValuesWithoutYAMLTextInjection(testingInstance *testing.T) {
	setConfigurationEnvironment(testingInstance)
	proxySecret := "proxy:\"quoted\"\nsecond-line\\value"
	signingKey := "signing:\"quoted\"\nsecond-line\\value"
	testingInstance.Setenv("LLM_PROXY_SECRET", proxySecret)
	testingInstance.Setenv("TAUTH_JWT_SIGNING_KEY", signingKey)

	loadedConfiguration, loadError := configuration.Load(writeConfiguration(testingInstance, validConfiguration))
	if loadError != nil {
		testingInstance.Fatalf("load configuration: %v", loadError)
	}
	if loadedConfiguration.LLMProxy.Secret != proxySecret {
		testingInstance.Fatal("proxy secret bytes changed during expansion")
	}
	if loadedConfiguration.Auth.SigningKey != signingKey {
		testingInstance.Fatal("signing key bytes changed during expansion")
	}
}

func TestLoadRejectsLiteralSecretBearingFields(testingInstance *testing.T) {
	setConfigurationEnvironment(testingInstance)
	testCases := []struct {
		name        string
		oldValue    string
		replacement string
	}{
		{name: "proxy tenant secret", oldValue: "${LLM_PROXY_SECRET}", replacement: "literal-proxy-secret"},
		{name: "TAuth signing key", oldValue: "${TAUTH_JWT_SIGNING_KEY}", replacement: "literal-signing-key"},
	}
	for _, testCase := range testCases {
		testingInstance.Run(testCase.name, func(subTest *testing.T) {
			configurationText := strings.Replace(validConfiguration, testCase.oldValue, testCase.replacement, 1)
			_, loadError := configuration.Load(writeConfiguration(subTest, configurationText))
			if loadError == nil {
				subTest.Fatal("expected literal secret rejection")
			}
		})
	}
}

func setConfigurationEnvironment(testingInstance *testing.T) {
	testingInstance.Helper()
	testingInstance.Setenv("LLM_PROXY_BASE_URL", "http://proxy.local")
	testingInstance.Setenv("LLM_PROXY_SECRET", "test-tenant-secret")
	testingInstance.Setenv("TAUTH_JWT_SIGNING_KEY", "test-signing-key")
	testingInstance.Setenv("SOCIAL_THREADER_PROFILE", "local")
}

func writeConfiguration(testingInstance *testing.T, content string) string {
	testingInstance.Helper()
	configurationPath := filepath.Join(testingInstance.TempDir(), "config.yml")
	if writeError := os.WriteFile(configurationPath, []byte(content), 0o600); writeError != nil {
		testingInstance.Fatalf("write configuration: %v", writeError)
	}
	return configurationPath
}
