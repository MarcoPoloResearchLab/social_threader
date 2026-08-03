// Package httpapi exposes the authenticated Social Threader transformation resource.
package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"regexp"
	"sync"
	"time"

	"github.com/MarcoPoloResearchLab/social_threader/internal/transformation"
)

const (
	transformationPath     = "/v1/thread-transformations"
	healthPath             = "/healthz"
	subjectKeySecretLength = 32
)

var requestIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{8,128}$`)

// Subject is the minimum authenticated TAuth identity required for authorization and limits.
type Subject struct {
	UserID   string
	TenantID string
}

// Authorizer validates a request against the shared TAuth session.
type Authorizer interface {
	Authorize(httpRequest *http.Request) (Subject, error)
}

// Transformer performs one validated product transformation.
type Transformer interface {
	Transform(contextValue context.Context, request transformation.Request) (transformation.Response, error)
}

// Policy controls API edge limits and paid-compute admission.
type Policy struct {
	AllowedFrontendOrigin string
	MaxBodyBytes          int64
	MaxInputCharacters    int
	PerUserRequests       int
	RateWindow            time.Duration
	GlobalConcurrency     int
	IdempotencyRetention  time.Duration
	CapacityMaxRequests   int
	CapacityWindow        time.Duration
}

// Input supplies validated API dependencies.
type Input struct {
	Transformer Transformer
	Authorizer  Authorizer
	Policy      Policy
	Logger      *slog.Logger
	Clock       func() time.Time
}

// API owns the public HTTP routes and bounded in-memory admission state.
type API struct {
	transformer      Transformer
	authorizer       Authorizer
	policy           Policy
	logger           *slog.Logger
	clock            func() time.Time
	semaphore        chan struct{}
	subjectKeySecret []byte

	stateMutex       sync.Mutex
	rateWindows      map[string]requestWindow
	capacityWindow   requestWindow
	idempotencyCache map[string]*idempotencyEntry
}

type requestWindow struct {
	startedAt time.Time
	count     int
}

type idempotencyEntry struct {
	fingerprint string
	expiresAt   time.Time
	completed   bool
	done        chan struct{}
	response    transformation.Response
	failure     *apiFailure
}

type transformationRequestPayload struct {
	Operation string `json:"operation"`
	Text      string `json:"text"`
	RequestID string `json:"request_id"`
}

type apiFailure struct {
	statusCode int
	code       string
	message    string
}

type errorEnvelope struct {
	Error errorPayload `json:"error"`
}

type errorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}
