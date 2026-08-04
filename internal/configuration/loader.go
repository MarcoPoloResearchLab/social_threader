package configuration

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

var environmentReferencePattern = regexp.MustCompile(`^\$\{([A-Z][A-Z0-9_]*)\}$`)

// Load reads one canonical YAML document, expands required environment references, and validates every field.
func Load(path string) (Config, error) {
	trimmedPath := strings.TrimSpace(path)
	if trimmedPath == "" {
		return Config{}, errors.New("configuration.load: path is required")
	}
	documentBytes, readError := os.ReadFile(trimmedPath)
	if readError != nil {
		return Config{}, fmt.Errorf("configuration.load: read config: %w", readError)
	}
	decoder := yaml.NewDecoder(bytes.NewReader(documentBytes))
	decoder.KnownFields(true)
	var decodedConfig rawConfig
	if decodeError := decoder.Decode(&decodedConfig); decodeError != nil {
		return Config{}, fmt.Errorf("configuration.load: decode config: %w", decodeError)
	}
	var trailingValue any
	if trailingError := decoder.Decode(&trailingValue); trailingError != io.EOF {
		if trailingError != nil {
			return Config{}, fmt.Errorf("configuration.load: decode trailing value: %w", trailingError)
		}
		return Config{}, errors.New("configuration.load: config must contain one YAML document")
	}

	expandedConfig, expansionError := expandEnvironmentBackedFields(decodedConfig)
	if expansionError != nil {
		return Config{}, fmt.Errorf("configuration.load: %w", expansionError)
	}
	validatedConfig, validationError := validateRawConfig(expandedConfig)
	if validationError != nil {
		return Config{}, fmt.Errorf("configuration.load: %w", validationError)
	}
	return validatedConfig, nil
}

func expandEnvironmentBackedFields(raw rawConfig) (rawConfig, error) {
	expanded := raw
	fields := []struct {
		name             string
		value            **string
		requireReference bool
	}{
		{name: "llm_proxy.base_url", value: &expanded.LLMProxy.BaseURL},
		{name: "llm_proxy.secret", value: &expanded.LLMProxy.Secret, requireReference: true},
		{name: "auth.signing_key", value: &expanded.Auth.SigningKey, requireReference: true},
		{name: "profiles.selected", value: &expanded.Profiles.Selected},
	}
	for _, field := range fields {
		expandedValue, expansionError := expandEnvironmentValue(
			field.name,
			*field.value,
			field.requireReference,
		)
		if expansionError != nil {
			return rawConfig{}, expansionError
		}
		*field.value = expandedValue
	}
	return expanded, nil
}

func expandEnvironmentValue(fieldName string, fieldValue *string, requireReference bool) (*string, error) {
	if fieldValue == nil {
		return nil, nil
	}
	referenceParts := environmentReferencePattern.FindStringSubmatch(*fieldValue)
	if len(referenceParts) != 2 {
		if requireReference {
			return nil, fmt.Errorf("configuration.invalid: %s must use an environment reference", fieldName)
		}
		if strings.Contains(*fieldValue, "${") {
			return nil, fmt.Errorf("configuration.invalid: %s has a malformed environment reference", fieldName)
		}
		copiedValue := *fieldValue
		return &copiedValue, nil
	}
	variableName := referenceParts[1]
	variableValue, exists := os.LookupEnv(variableName)
	if !exists || strings.TrimSpace(variableValue) == "" {
		return nil, fmt.Errorf("environment variable %s is required", variableName)
	}
	expandedValue := variableValue
	return &expandedValue, nil
}
