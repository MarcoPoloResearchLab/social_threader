// Command social-threader-api runs the authenticated Social Threader transformation API.
package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/MarcoPoloResearchLab/social_threader/internal/application"
	"github.com/MarcoPoloResearchLab/social_threader/internal/configuration"
)

const defaultConfigurationPath = "configs/config.yml"

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	processContext, stopSignals := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stopSignals()
	if runError := run(processContext, os.Args[1:], logger); runError != nil {
		logger.Error("social threader API stopped", "outcome", "startup_or_runtime_failure")
		os.Exit(1)
	}
}

func run(processContext context.Context, arguments []string, logger *slog.Logger) error {
	flagSet := flag.NewFlagSet("social-threader-api", flag.ContinueOnError)
	configurationPath := flagSet.String("config", defaultConfigurationPath, "Path to the canonical API configuration")
	if parseError := flagSet.Parse(arguments); parseError != nil {
		return parseError
	}
	applicationConfig, loadError := configuration.Load(*configurationPath)
	if loadError != nil {
		return loadError
	}
	httpHandler, compositionError := application.New(application.Input{
		Config:     applicationConfig,
		HTTPClient: &http.Client{},
		Logger:     logger,
		Clock:      time.Now,
	})
	if compositionError != nil {
		return compositionError
	}
	httpServer := &http.Server{
		Addr:              applicationConfig.Server.Address,
		Handler:           httpHandler,
		ReadHeaderTimeout: time.Duration(applicationConfig.Server.ReadHeaderTimeoutSeconds) * time.Second,
		IdleTimeout:       time.Duration(applicationConfig.Server.IdleTimeoutSeconds) * time.Second,
	}
	serverResult := make(chan error, 1)
	go func() {
		serverResult <- httpServer.ListenAndServe()
	}()
	logger.Info(
		"social threader API started",
		"address", applicationConfig.Server.Address,
		"profile", applicationConfig.SelectedProfile.Name,
	)

	select {
	case serverError := <-serverResult:
		if errors.Is(serverError, http.ErrServerClosed) {
			return nil
		}
		return serverError
	case <-processContext.Done():
		shutdownContext, cancelShutdown := context.WithTimeout(
			context.Background(),
			time.Duration(applicationConfig.Server.ShutdownTimeoutSeconds)*time.Second,
		)
		defer cancelShutdown()
		if shutdownError := httpServer.Shutdown(shutdownContext); shutdownError != nil {
			return shutdownError
		}
		serverError := <-serverResult
		if serverError != nil && !errors.Is(serverError, http.ErrServerClosed) {
			return serverError
		}
		return nil
	}
}
