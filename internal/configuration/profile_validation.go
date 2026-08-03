package configuration

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

var (
	cookieNamePattern    = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]{2,127}$`)
	canonicalNamePattern = regexp.MustCompile(`^[a-z][a-z0-9-]{1,62}$`)
	cookieDomainPattern  = regexp.MustCompile(`^\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$`)
)

const oauthCallbackPath = "/auth/google/callback"

func validateProfiles(raw rawProfiles, authTenantID string) (Profiles, Profile, error) {
	selectedName, selectedError := requiredString("profiles.selected", raw.Selected)
	if selectedError != nil {
		return Profiles{}, Profile{}, selectedError
	}
	localProfile, localError := validateProfile("local", raw.Local, authTenantID, false)
	if localError != nil {
		return Profiles{}, Profile{}, localError
	}
	hostedProfile, hostedError := validateProfile("hosted", raw.Hosted, authTenantID, true)
	if hostedError != nil {
		return Profiles{}, Profile{}, hostedError
	}
	profiles := Profiles{Local: localProfile, Hosted: hostedProfile}
	switch selectedName {
	case "local":
		return profiles, localProfile, nil
	case "hosted":
		return profiles, hostedProfile, nil
	default:
		return Profiles{}, Profile{}, errors.New("configuration.invalid: profiles.selected must be local or hosted")
	}
}

func validateProfile(name string, raw rawProfile, authTenantID string, hosted bool) (Profile, error) {
	fieldPrefix := "profiles." + name + "."
	frontendOrigin, frontendError := requiredHTTPURL(fieldPrefix+"frontend_origin", raw.FrontendOrigin, hosted)
	if frontendError != nil {
		return Profile{}, frontendError
	}
	if !isOrigin(frontendOrigin) {
		return Profile{}, fmt.Errorf("configuration.invalid: %sfrontend_origin must be an origin", fieldPrefix)
	}
	apiOrigin, apiError := requiredHTTPURL(fieldPrefix+"api_origin", raw.APIOrigin, hosted)
	if apiError != nil {
		return Profile{}, apiError
	}
	if !isOrigin(apiOrigin) {
		return Profile{}, fmt.Errorf("configuration.invalid: %sapi_origin must be an origin", fieldPrefix)
	}
	tauthBrowserOrigin, tauthError := requiredPresentString(fieldPrefix+"tauth_browser_origin", raw.TAuthBrowserOrigin)
	if tauthError != nil {
		return Profile{}, tauthError
	}
	if hosted && tauthBrowserOrigin == "" {
		return Profile{}, fmt.Errorf("configuration.invalid: %stauth_browser_origin is required", fieldPrefix)
	}
	if tauthBrowserOrigin != "" {
		validatedTAuthOrigin, originError := validateHTTPURLValue(
			fieldPrefix+"tauth_browser_origin",
			tauthBrowserOrigin,
			hosted,
		)
		if originError != nil || !isOrigin(validatedTAuthOrigin) {
			return Profile{}, fmt.Errorf("configuration.invalid: %stauth_browser_origin must be an HTTP origin", fieldPrefix)
		}
		tauthBrowserOrigin = validatedTAuthOrigin
	}
	oauthCallback, callbackError := requiredHTTPURL(fieldPrefix+"oauth_callback", raw.OAuthCallback, hosted)
	if callbackError != nil {
		return Profile{}, callbackError
	}
	expectedAuthOrigin := frontendOrigin
	if tauthBrowserOrigin != "" {
		expectedAuthOrigin = tauthBrowserOrigin
	}
	if !isExactOAuthCallback(oauthCallback, expectedAuthOrigin) {
		return Profile{}, fmt.Errorf(
			"configuration.invalid: %soauth_callback must use the selected TAuth origin and callback path",
			fieldPrefix,
		)
	}
	tenantID, tenantError := requiredCanonicalName(fieldPrefix+"tenant_id", raw.TenantID)
	if tenantError != nil {
		return Profile{}, tenantError
	}
	if tenantID != authTenantID {
		return Profile{}, fmt.Errorf("configuration.invalid: %stenant_id must match auth.tenant_id", fieldPrefix)
	}
	sessionCookieName, sessionError := requiredCookieName(fieldPrefix+"session_cookie_name", raw.SessionCookieName)
	if sessionError != nil {
		return Profile{}, sessionError
	}
	refreshCookieName, refreshError := requiredCookieName(fieldPrefix+"refresh_cookie_name", raw.RefreshCookieName)
	if refreshError != nil {
		return Profile{}, refreshError
	}
	if sessionCookieName == refreshCookieName {
		return Profile{}, fmt.Errorf("configuration.invalid: %s cookie names must differ", fieldPrefix)
	}
	cookieDomain, cookieDomainError := requiredPresentString(fieldPrefix+"cookie_domain", raw.CookieDomain)
	if cookieDomainError != nil {
		return Profile{}, cookieDomainError
	}
	cookieSecure, secureError := requiredBoolean(fieldPrefix+"cookie_secure", raw.CookieSecure)
	if secureError != nil {
		return Profile{}, secureError
	}
	cookieSameSite, sameSiteError := requiredString(fieldPrefix+"cookie_same_site", raw.CookieSameSite)
	if sameSiteError != nil {
		return Profile{}, sameSiteError
	}
	if cookieSameSite != "Lax" && cookieSameSite != "Strict" && cookieSameSite != "None" {
		return Profile{}, fmt.Errorf("configuration.invalid: %scookie_same_site is unsupported", fieldPrefix)
	}
	if hosted && (cookieDomain == "" || !cookieSecure) {
		return Profile{}, fmt.Errorf("configuration.invalid: %s hosted cookies require domain and Secure", fieldPrefix)
	}
	if hosted && (!cookieDomainPattern.MatchString(cookieDomain) || !cookieDomainCoversProfile(
		cookieDomain,
		frontendOrigin,
		apiOrigin,
		tauthBrowserOrigin,
	)) {
		return Profile{}, fmt.Errorf("configuration.invalid: %scookie_domain must cover every hosted profile origin", fieldPrefix)
	}
	if cookieSameSite == "None" && !cookieSecure {
		return Profile{}, fmt.Errorf("configuration.invalid: %s SameSite None requires Secure", fieldPrefix)
	}
	corsCredentials, corsError := requiredBoolean(fieldPrefix+"cors_credentials", raw.CORSCredentials)
	if corsError != nil {
		return Profile{}, corsError
	}
	if !corsCredentials {
		return Profile{}, fmt.Errorf("configuration.invalid: %scors_credentials must be true", fieldPrefix)
	}
	dnsOwner, dnsError := requiredString(fieldPrefix+"dns_owner", raw.DNSOwner)
	if dnsError != nil {
		return Profile{}, dnsError
	}
	reverseProxyOwner, proxyError := requiredString(fieldPrefix+"reverse_proxy_owner", raw.ReverseProxyOwner)
	if proxyError != nil {
		return Profile{}, proxyError
	}
	upstreamService, upstreamError := requiredCanonicalName(fieldPrefix+"upstream_service", raw.UpstreamService)
	if upstreamError != nil {
		return Profile{}, upstreamError
	}
	containerPort, portError := requiredPositiveInteger(fieldPrefix+"container_port", raw.ContainerPort)
	if portError != nil || containerPort > 65535 {
		return Profile{}, fmt.Errorf("configuration.invalid: %scontainer_port must be between 1 and 65535", fieldPrefix)
	}
	return Profile{
		Name:               name,
		FrontendOrigin:     frontendOrigin,
		APIOrigin:          apiOrigin,
		TAuthBrowserOrigin: tauthBrowserOrigin,
		OAuthCallback:      oauthCallback,
		TenantID:           tenantID,
		SessionCookieName:  sessionCookieName,
		RefreshCookieName:  refreshCookieName,
		CookieDomain:       cookieDomain,
		CookieSecure:       cookieSecure,
		CookieSameSite:     cookieSameSite,
		CORSCredentials:    corsCredentials,
		DNSOwner:           dnsOwner,
		ReverseProxyOwner:  reverseProxyOwner,
		UpstreamService:    upstreamService,
		ContainerPort:      containerPort,
	}, nil
}

func isExactOAuthCallback(callbackValue string, authOrigin string) bool {
	callbackURL, callbackError := url.Parse(callbackValue)
	if callbackError != nil || callbackURL.RawQuery != "" || callbackURL.Fragment != "" {
		return false
	}
	return originValue(callbackURL) == canonicalOrigin(authOrigin) && callbackURL.Path == oauthCallbackPath
}

func cookieDomainCoversProfile(cookieDomain string, originValues ...string) bool {
	domainName := strings.TrimPrefix(cookieDomain, ".")
	for _, originValue := range originValues {
		parsedOrigin, parseError := url.Parse(originValue)
		if parseError != nil {
			return false
		}
		hostname := strings.ToLower(parsedOrigin.Hostname())
		if hostname != domainName && !strings.HasSuffix(hostname, "."+domainName) {
			return false
		}
	}
	return true
}

func canonicalOrigin(origin string) string {
	parsedOrigin, parseError := url.Parse(origin)
	if parseError != nil {
		return ""
	}
	return originValue(parsedOrigin)
}

func originValue(parsedURL *url.URL) string {
	return parsedURL.Scheme + "://" + parsedURL.Host
}

func requiredString(fieldName string, fieldValue *string) (string, error) {
	if fieldValue == nil || strings.TrimSpace(*fieldValue) == "" {
		return "", fmt.Errorf("configuration.invalid: %s is required", fieldName)
	}
	return strings.TrimSpace(*fieldValue), nil
}

func requiredPresentString(fieldName string, fieldValue *string) (string, error) {
	if fieldValue == nil {
		return "", fmt.Errorf("configuration.invalid: %s is required", fieldName)
	}
	return strings.TrimSpace(*fieldValue), nil
}

func requiredCanonicalName(fieldName string, fieldValue *string) (string, error) {
	value, valueError := requiredString(fieldName, fieldValue)
	if valueError != nil {
		return "", valueError
	}
	if !canonicalNamePattern.MatchString(value) {
		return "", fmt.Errorf("configuration.invalid: %s must be a canonical name", fieldName)
	}
	return value, nil
}

func requiredCookieName(fieldName string, fieldValue *string) (string, error) {
	value, valueError := requiredString(fieldName, fieldValue)
	if valueError != nil {
		return "", valueError
	}
	if !cookieNamePattern.MatchString(value) {
		return "", fmt.Errorf("configuration.invalid: %s is malformed", fieldName)
	}
	return value, nil
}

func requiredPositiveInteger(fieldName string, fieldValue *int) (int, error) {
	if fieldValue == nil || *fieldValue <= 0 {
		return 0, fmt.Errorf("configuration.invalid: %s must be positive", fieldName)
	}
	return *fieldValue, nil
}

func requiredPositiveInteger64(fieldName string, fieldValue *int64) (int64, error) {
	if fieldValue == nil || *fieldValue <= 0 {
		return 0, fmt.Errorf("configuration.invalid: %s must be positive", fieldName)
	}
	return *fieldValue, nil
}

func requiredBoolean(fieldName string, fieldValue *bool) (bool, error) {
	if fieldValue == nil {
		return false, fmt.Errorf("configuration.invalid: %s is required", fieldName)
	}
	return *fieldValue, nil
}

func requiredHTTPURL(fieldName string, fieldValue *string, requireTLS bool) (string, error) {
	value, valueError := requiredString(fieldName, fieldValue)
	if valueError != nil {
		return "", valueError
	}
	return validateHTTPURLValue(fieldName, value, requireTLS)
}

func validateHTTPURLValue(fieldName string, value string, requireTLS bool) (string, error) {
	parsedURL, parseError := url.Parse(value)
	if parseError != nil || parsedURL.Host == "" || parsedURL.User != nil {
		return "", fmt.Errorf("configuration.invalid: %s must be an HTTP URL", fieldName)
	}
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return "", fmt.Errorf("configuration.invalid: %s must be an HTTP URL", fieldName)
	}
	if requireTLS && parsedURL.Scheme != "https" {
		return "", fmt.Errorf("configuration.invalid: %s must use TLS", fieldName)
	}
	return parsedURL.String(), nil
}

func isOrigin(value string) bool {
	parsedURL, parseError := url.Parse(value)
	if parseError != nil {
		return false
	}
	return (parsedURL.Path == "" || parsedURL.Path == "/") && parsedURL.RawQuery == "" && parsedURL.Fragment == ""
}
