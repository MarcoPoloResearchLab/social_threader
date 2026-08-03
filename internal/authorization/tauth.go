// Package authorization adapts the published TAuth session validator to API resource authorization.
package authorization

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/MarcoPoloResearchLab/social_threader/internal/httpapi"
	"github.com/tyemirov/tauth/pkg/sessionvalidator"
)

// TAuthConfig identifies the exact selected tenant session contract.
type TAuthConfig struct {
	SigningKey []byte
	Issuer     string
	CookieName string
	TenantID   string
}

// TAuthAuthorizer validates TAuth sessions only for protected application resources.
type TAuthAuthorizer struct {
	validator *sessionvalidator.Validator
	tenantID  string
}

// NewTAuthAuthorizer constructs one published validator for backend startup injection.
func NewTAuthAuthorizer(config TAuthConfig) (*TAuthAuthorizer, error) {
	tenantID := strings.TrimSpace(config.TenantID)
	if tenantID == "" {
		return nil, errors.New("authorization.new: tenant ID is required")
	}
	validator, validatorError := sessionvalidator.New(sessionvalidator.Config{
		SigningKey: append([]byte(nil), config.SigningKey...),
		Issuer:     config.Issuer,
		CookieName: config.CookieName,
	})
	if validatorError != nil {
		return nil, fmt.Errorf("authorization.new: construct TAuth validator: %w", validatorError)
	}
	return &TAuthAuthorizer{validator: validator, tenantID: tenantID}, nil
}

// Authorize validates the configured cookie and selected tenant identity.
func (authorizer *TAuthAuthorizer) Authorize(httpRequest *http.Request) (httpapi.Subject, error) {
	claims, validationError := authorizer.validator.ValidateRequest(httpRequest)
	if validationError != nil {
		return httpapi.Subject{}, errors.New("authorization.session_invalid")
	}
	userID := strings.TrimSpace(claims.GetUserID())
	tenantID := strings.TrimSpace(claims.GetTenantID())
	if userID == "" || tenantID != authorizer.tenantID {
		return httpapi.Subject{}, errors.New("authorization.session_invalid")
	}
	return httpapi.Subject{UserID: userID, TenantID: tenantID}, nil
}
