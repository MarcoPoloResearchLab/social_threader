package configuration_test

import (
	"strings"
	"testing"

	"github.com/MarcoPoloResearchLab/social_threader/internal/configuration"
	"gopkg.in/yaml.v3"
)

func TestLoadRejectsEveryMissingRequiredField(testingInstance *testing.T) {
	setConfigurationEnvironment(testingInstance)
	requiredFieldPaths := []string{
		"server.address",
		"server.read_header_timeout_seconds",
		"server.idle_timeout_seconds",
		"server.shutdown_timeout_seconds",
		"llm_proxy.base_url",
		"llm_proxy.secret",
		"llm_proxy.provider",
		"llm_proxy.model",
		"llm_proxy.reasoning_effort",
		"llm_proxy.request_timeout_seconds",
		"auth.signing_key",
		"auth.issuer",
		"auth.tenant_id",
		"profiles.selected",
		"profiles.local.frontend_origin",
		"profiles.local.api_origin",
		"profiles.local.tauth_browser_origin",
		"profiles.local.oauth_callback",
		"profiles.local.tenant_id",
		"profiles.local.session_cookie_name",
		"profiles.local.refresh_cookie_name",
		"profiles.local.cookie_domain",
		"profiles.local.cookie_secure",
		"profiles.local.cookie_same_site",
		"profiles.local.cors_credentials",
		"profiles.local.dns_owner",
		"profiles.local.reverse_proxy_owner",
		"profiles.local.upstream_service",
		"profiles.local.container_port",
		"profiles.hosted.frontend_origin",
		"profiles.hosted.api_origin",
		"profiles.hosted.tauth_browser_origin",
		"profiles.hosted.oauth_callback",
		"profiles.hosted.tenant_id",
		"profiles.hosted.session_cookie_name",
		"profiles.hosted.refresh_cookie_name",
		"profiles.hosted.cookie_domain",
		"profiles.hosted.cookie_secure",
		"profiles.hosted.cookie_same_site",
		"profiles.hosted.cors_credentials",
		"profiles.hosted.dns_owner",
		"profiles.hosted.reverse_proxy_owner",
		"profiles.hosted.upstream_service",
		"profiles.hosted.container_port",
		"limits.max_body_bytes",
		"limits.max_input_characters",
		"limits.max_response_characters",
		"limits.max_output_tokens",
		"limits.per_user_requests",
		"limits.rate_window_seconds",
		"limits.global_concurrency",
		"limits.idempotency_retention_seconds",
		"limits.capacity.enabled",
		"limits.capacity.max_requests",
		"limits.capacity.window_seconds",
		"application_policy.persist_text",
		"application_policy.log_content",
		"application_policy.automatic_retry",
	}

	for _, fieldPath := range requiredFieldPaths {
		testingInstance.Run(fieldPath, func(subTest *testing.T) {
			configurationWithoutField := removeYAMLField(subTest, validConfiguration, fieldPath)
			if _, loadError := configuration.Load(writeConfiguration(subTest, configurationWithoutField)); loadError == nil {
				subTest.Fatalf("expected missing %s to be rejected", fieldPath)
			}
		})
	}
}

func removeYAMLField(testingInstance *testing.T, source string, fieldPath string) string {
	testingInstance.Helper()
	var document yaml.Node
	if decodeError := yaml.Unmarshal([]byte(source), &document); decodeError != nil {
		testingInstance.Fatalf("decode configuration fixture: %v", decodeError)
	}
	pathParts := strings.Split(fieldPath, ".")
	currentNode := document.Content[0]
	for pathIndex, pathPart := range pathParts {
		if currentNode.Kind != yaml.MappingNode {
			testingInstance.Fatalf("%s does not resolve through a mapping", fieldPath)
		}
		mappingIndex := findMappingKey(currentNode, pathPart)
		if mappingIndex < 0 {
			testingInstance.Fatalf("%s is absent from the valid fixture", fieldPath)
		}
		if pathIndex == len(pathParts)-1 {
			currentNode.Content = append(currentNode.Content[:mappingIndex], currentNode.Content[mappingIndex+2:]...)
			encodedDocument, encodeError := yaml.Marshal(&document)
			if encodeError != nil {
				testingInstance.Fatalf("encode configuration fixture: %v", encodeError)
			}
			return string(encodedDocument)
		}
		currentNode = currentNode.Content[mappingIndex+1]
	}
	testingInstance.Fatalf("cannot remove %s", fieldPath)
	return ""
}

func findMappingKey(mappingNode *yaml.Node, fieldName string) int {
	for mappingIndex := 0; mappingIndex < len(mappingNode.Content); mappingIndex += 2 {
		if mappingNode.Content[mappingIndex].Value == fieldName {
			return mappingIndex
		}
	}
	return -1
}
