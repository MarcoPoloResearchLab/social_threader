package application_test

import (
	"bytes"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/MarcoPoloResearchLab/social_threader/internal/application"
	"github.com/MarcoPoloResearchLab/social_threader/internal/configuration"
	"github.com/golang-jwt/jwt/v5"
	"github.com/tyemirov/tauth/pkg/sessionvalidator"
)

func TestNewComposesAuthenticatedAPIThroughOneOfficialProxyClient(testingInstance *testing.T) {
	proxyCalls := 0
	proxyRequestMatched := false
	proxyServer := httptest.NewServer(http.HandlerFunc(func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		proxyCalls += 1
		proxyRequestMatched = httpRequest.URL.Path == "/v2" &&
			httpRequest.URL.Query().Get("key") == "dedicated-secret"
		_, _ = io.Copy(io.Discard, httpRequest.Body)
		responseWriter.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = responseWriter.Write([]byte("Composed result"))
	}))
	defer proxyServer.Close()

	applicationConfig := validApplicationConfig(proxyServer.URL)
	handler, compositionError := application.New(application.Input{
		Config:     applicationConfig,
		HTTPClient: proxyServer.Client(),
		Logger:     slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil)),
		Clock:      time.Now,
	})
	if compositionError != nil {
		testingInstance.Fatalf("compose application: %v", compositionError)
	}

	healthRequest := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	healthResponse := httptest.NewRecorder()
	handler.ServeHTTP(healthResponse, healthRequest)
	if healthResponse.Code != http.StatusOK {
		testingInstance.Fatalf("health status=%d", healthResponse.Code)
	}

	transformationRequest := httptest.NewRequest(
		http.MethodPost,
		"/v1/thread-transformations",
		strings.NewReader(`{"operation":"polish","text":"Original","request_id":"composition-001"}`),
	)
	transformationRequest.Header.Set("Content-Type", "application/json")
	transformationRequest.Header.Set("Origin", applicationConfig.SelectedProfile.FrontendOrigin)
	transformationRequest.AddCookie(&http.Cookie{
		Name:  applicationConfig.SelectedProfile.SessionCookieName,
		Value: mintApplicationSession(testingInstance),
	})
	transformationResponse := httptest.NewRecorder()
	handler.ServeHTTP(transformationResponse, transformationRequest)
	if transformationResponse.Code != http.StatusOK {
		testingInstance.Fatalf("transformation status=%d body=%s", transformationResponse.Code, transformationResponse.Body.String())
	}
	if proxyCalls != 1 {
		testingInstance.Fatalf("proxy calls=%d", proxyCalls)
	}
	if !proxyRequestMatched {
		testingInstance.Fatal("official proxy request did not match the application contract")
	}
}

func validApplicationConfig(proxyURL string) configuration.Config {
	localProfile := configuration.Profile{
		Name:               "local",
		FrontendOrigin:     "http://localhost:4173",
		APIOrigin:          "http://localhost:4173",
		TAuthBrowserOrigin: "",
		OAuthCallback:      "http://localhost:4173/auth/google/callback",
		TenantID:           "social-threader",
		SessionCookieName:  "social_threader_development_session",
		RefreshCookieName:  "social_threader_development_refresh",
		CookieSameSite:     "Lax",
		CORSCredentials:    true,
		DNSOwner:           "local operator",
		ReverseProxyOwner:  "local Caddy front door",
		UpstreamService:    "social-threader-api",
		ContainerPort:      8080,
	}
	return configuration.Config{
		Server: configuration.ServerConfig{
			Address:                  ":8080",
			ReadHeaderTimeoutSeconds: 5,
			IdleTimeoutSeconds:       60,
			ShutdownTimeoutSeconds:   15,
		},
		LLMProxy: configuration.LLMProxyConfig{
			BaseURL:               proxyURL,
			Secret:                "dedicated-secret",
			Provider:              "openai",
			Model:                 "gpt-5.6-terra",
			ReasoningEffort:       "medium",
			RequestTimeoutSeconds: 30,
		},
		Auth: configuration.AuthConfig{
			SigningKey: "application-signing-key",
			Issuer:     "tauth",
			TenantID:   "social-threader",
		},
		Limits: configuration.LimitsConfig{
			MaxBodyBytes:                8192,
			MaxInputCharacters:          5000,
			MaxResponseCharacters:       10000,
			MaxOutputTokens:             2048,
			PerUserRequests:             5,
			RateWindowSeconds:           60,
			GlobalConcurrency:           2,
			IdempotencyRetentionSeconds: 300,
			Capacity: configuration.CapacityConfig{
				Enabled:       true,
				MaxRequests:   100,
				WindowSeconds: 3600,
			},
		},
		ApplicationPolicy: configuration.ApplicationPolicy{},
		SelectedProfile:   localProfile,
		Profiles:          configuration.Profiles{Local: localProfile},
	}
}

func mintApplicationSession(testingInstance *testing.T) string {
	testingInstance.Helper()
	currentTime := time.Now().UTC()
	claims := sessionvalidator.Claims{
		TenantID: "social-threader",
		UserID:   "composition-user",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "tauth",
			IssuedAt:  jwt.NewNumericDate(currentTime.Add(-time.Minute)),
			ExpiresAt: jwt.NewNumericDate(currentTime.Add(time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signedToken, signingError := token.SignedString([]byte("application-signing-key"))
	if signingError != nil {
		testingInstance.Fatalf("sign session: %v", signingError)
	}
	return signedToken
}
