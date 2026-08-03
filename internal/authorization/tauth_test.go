package authorization_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/MarcoPoloResearchLab/social_threader/internal/authorization"
	"github.com/golang-jwt/jwt/v5"
	"github.com/tyemirov/tauth/pkg/sessionvalidator"
)

const (
	testSigningKey = "test-profile-signing-key"
	testCookieName = "social_threader_development_session"
	testTenantID   = "social-threader"
)

func TestTAuthAuthorizerAcceptsOnlyExactProfileSession(testingInstance *testing.T) {
	authorizer, authorizerError := authorization.NewTAuthAuthorizer(authorization.TAuthConfig{
		SigningKey: []byte(testSigningKey),
		Issuer:     "tauth",
		CookieName: testCookieName,
		TenantID:   testTenantID,
	})
	if authorizerError != nil {
		testingInstance.Fatalf("new authorizer: %v", authorizerError)
	}

	validRequest := httptest.NewRequest("POST", "/v1/thread-transformations", nil)
	validRequest.AddCookie(&http.Cookie{Name: testCookieName, Value: mintSession(testingInstance, testTenantID)})
	subject, authorizationError := authorizer.Authorize(validRequest)
	if authorizationError != nil {
		testingInstance.Fatalf("authorize exact session: %v", authorizationError)
	}
	if subject.UserID != "user-123" || subject.TenantID != testTenantID {
		testingInstance.Fatalf("subject=%#v", subject)
	}

	missingRequest := httptest.NewRequest("POST", "/v1/thread-transformations", nil)
	if _, missingError := authorizer.Authorize(missingRequest); missingError == nil {
		testingInstance.Fatal("expected missing cookie rejection")
	}

	wrongTenantRequest := httptest.NewRequest("POST", "/v1/thread-transformations", nil)
	wrongTenantRequest.AddCookie(&http.Cookie{Name: testCookieName, Value: mintSession(testingInstance, "other-tenant")})
	if _, wrongTenantError := authorizer.Authorize(wrongTenantRequest); wrongTenantError == nil {
		testingInstance.Fatal("expected tenant mismatch rejection")
	}
}

func mintSession(testingInstance *testing.T, tenantID string) string {
	testingInstance.Helper()
	currentTime := time.Now().UTC()
	claims := sessionvalidator.Claims{
		TenantID:  tenantID,
		UserID:    "user-123",
		UserEmail: "operator@example.test",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "tauth",
			IssuedAt:  jwt.NewNumericDate(currentTime.Add(-time.Minute)),
			ExpiresAt: jwt.NewNumericDate(currentTime.Add(time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signedToken, signingError := token.SignedString([]byte(testSigningKey))
	if signingError != nil {
		testingInstance.Fatalf("sign token: %v", signingError)
	}
	return signedToken
}
