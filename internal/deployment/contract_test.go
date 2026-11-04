package deployment_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"slices"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

type localComposeDocument struct {
	Services map[string]any `yaml:"services"`
}

type browserApplicationConfig struct {
	SchemaVersion int `json:"schema_version"`
	Environments  []struct {
		Name      string   `json:"name"`
		Origins   []string `json:"origins"`
		APIOrigin string   `json:"api_origin"`
	} `json:"environments"`
}

type browserUIConfig struct {
	Environments []struct {
		Description string   `yaml:"description"`
		Origins     []string `yaml:"origins"`
		Auth        struct {
			TAuthURL    string `yaml:"tauthUrl"`
			TenantID    string `yaml:"tenantId"`
			LogoutPath  string `yaml:"logoutPath"`
			SessionPath string `yaml:"sessionPath"`
			Providers   struct {
				Google struct {
					Enabled   bool   `yaml:"enabled"`
					ClientID  string `yaml:"clientId"`
					LoginPath string `yaml:"loginPath"`
					NoncePath string `yaml:"noncePath"`
				} `yaml:"google"`
				Apple struct {
					Enabled bool `yaml:"enabled"`
				} `yaml:"apple"`
				Password struct {
					Enabled bool `yaml:"enabled"`
				} `yaml:"password"`
			} `yaml:"providers"`
		} `yaml:"auth"`
	} `yaml:"environments"`
}

func TestProductionLifecycleContract(t *testing.T) {
	repositoryRoot := findRepositoryRoot(t)
	manifestBytes := readRepositoryFile(t, repositoryRoot, ".mprlab/deploy/resources.yml")
	resourceEnvelopeShape := currentManifestContract(t, manifestBytes)
	environment := currentContractMap(t, resourceEnvelopeShape["environment"])
	if environment["source"] != ".mprlab/deploy/.env" {
		t.Fatal("manifest must explicitly select its environment source")
	}
	lifecycle := currentContractMap(t, resourceEnvelopeShape["lifecycle"])
	targets := currentContractMap(t, resourceEnvelopeShape["targets"])
	expectedInputs := map[string]any{}
	for _, name := range []string{
		"SOCIAL_THREADER_ANDROID_KEYSTORE_PROPERTIES",
		"APP_STORE_CONNECT_API_ISSUER_ID", "APP_STORE_CONNECT_API_KEY_ID", "APP_STORE_CONNECT_API_KEY_PATH",
		"GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH", "SOCIAL_THREADER_APPLE_TEAM_ID",
		"SOCIAL_THREADER_GOOGLE_WEB_CLIENT_ID", "SOCIAL_THREADER_IOS_CERTIFICATE_BASE64",
		"SOCIAL_THREADER_IOS_CERTIFICATE_PASSWORD", "SOCIAL_THREADER_IOS_PROVISIONING_PROFILE",
		"SOCIAL_THREADER_IOS_SIGNING_IDENTITY", "SOCIAL_THREADER_LLM_PROXY_SECRET",
		"SOCIAL_THREADER_TAUTH_JWT_SIGNING_KEY", "DEPLOY_SUDO_PASSWORD_TUTOSH",
		"MPRLAB_TAUTH_MANAGEMENT_URL", "MPRLAB_TAUTH_PROVISIONING_CREDENTIALS",
	} {
		expectedInputs[name] = true
	}
	actualInputs := map[string]any{}
	for variable := range currentContractIndex(t, environment["private_inputs"], "variable") {
		actualInputs[variable] = true
	}
	if !reflect.DeepEqual(actualInputs, expectedInputs) {
		t.Fatal("manifest must declare every private lifecycle input")
	}
	requireCurrentContractYAML(t, "targets.access", targets["access"], `hosts: [{host: tutosh, elevation_password: {input: deploy-sudo-password-tutosh}}]`)
	if !reflect.DeepEqual(lifecycle["ci"], map[string]any{
		"enabled": true, "command": []any{"make", "ci"},
	}) {
		t.Fatal("manifest must enable repository CI")
	}
	if !reflect.DeepEqual(lifecycle["defaults"], map[string]any{"timeouts": map[string]any{
		"startup": "2m", "completion": "30m", "readiness": "5m", "request": "30s", "shutdown": "30s",
	}}) {
		t.Fatal("manifest must declare lifecycle timeout defaults")
	}
	operations := currentContractIndex(t, lifecycle["operations"], "name")
	if len(operations) != 8 {
		t.Fatal("manifest must declare all selected lifecycle operation policies")
	}
	for name, completion := range map[string]string{
		"ci": "2h", "app-release": "2h", "app-publish": "4h", "app-deploy": "20m",
		"app-plan-release": "2m", "app-plan-publish": "2m", "app-plan-deploy": "2m",
		"app_lifecycle.repository_read": "",
	} {
		expected := map[string]any{"name": name, "polling": map[string]any{
			"initial": "2s", "maximum": "15s", "increment": "2s", "multiplier": 2, "attempt_limit": 60,
		}}
		if completion != "" {
			expected["timeouts"] = map[string]any{"completion": completion}
		}
		if !reflect.DeepEqual(operations[name], expected) {
			t.Errorf("operation %s must declare the selected execution policy", name)
		}
	}
	if _, present := resourceEnvelopeShape["schema_version"]; present {
		t.Fatal("selected manifest must not declare schema_version")
	}
	if resourceEnvelopeShape["owner"] != "social-threader" {
		t.Fatalf("manifest owner = %q, want social-threader", resourceEnvelopeShape["owner"])
	}
	if currentContractMap(t, resourceEnvelopeShape["release"])["scheme"] != "semver" {
		t.Fatalf("release scheme = %q, want semver", currentContractMap(t, resourceEnvelopeShape["release"])["scheme"])
	}

	artifacts := currentContractMap(t, resourceEnvelopeShape["artifacts"])
	mobile := currentContractIndex(t, artifacts["mobile"], "id")
	if len(mobile) != 1 || mobile["mobile"] == nil {
		t.Fatalf("unexpected native mobile artifacts: %#v", mobile)
	}
	if mobile["mobile"]["build_system"] != "local" {
		t.Fatal("mobile build system must remain local")
	}
	if currentContractMap(t, mobile["mobile"]["build"])["android"] != "mobile/scripts/build-android-bundle.mjs" {
		t.Fatal("mobile Android build script changed")
	}
	projects := currentContractIndex(t, currentContractMap(t, targets["docker_compose"])["projects"], "id")
	if len(projects) != 1 || projects["runtime"] == nil {
		t.Fatal("native runtime project missing")
	}
	services := currentContractIndex(t, projects["runtime"]["services"], "id")
	if len(services) != 1 || services["social-threader-api"] == nil {
		t.Fatal("unexpected runtime services")
	}
	service := currentContractDeclaration(t, projects["runtime"]["services"], "social-threader-api")
	endpoints := currentContractIndex(t, service["endpoints"], "id")
	if len(endpoints) != 2 || endpoints["http"] == nil || endpoints["readiness"] == nil {
		t.Fatal("unexpected runtime endpoints")
	}
	requireCurrentContractYAML(t, "readiness-reference", service["readiness"], `endpoint: readiness`)
	currentContractDeclaration(t, service["endpoints"], "http")
	caddy := currentContractMap(t, currentContractMap(t, targets["ingress"])["caddy"])
	if len(currentContractIndex(t, caddy["routes"], "id")) != 1 {
		t.Fatal("unexpected API route count")
	}
	currentContractDeclaration(t, caddy["routes"], "public-api")
	if len(currentContractIndex(t, currentContractMap(t, targets["github_pages"])["sites"], "id")) != 1 {
		t.Fatal("unexpected Pages target count")
	}
	currentContractDeclaration(t, currentContractMap(t, targets["github_pages"])["sites"], "website")
	observations := currentContractIndex(t, currentContractMap(t, lifecycle["observations"])["http"], "id")
	if len(observations) != 2 || observations["public-health"] == nil || observations["website-health"] == nil {
		t.Fatal("native public health observations missing")
	}
	env := currentContractIndex(t, service["environment"], "name")
	requireCurrentContractYAML(t, "TAUTH_JWT_SIGNING_KEY", env["TAUTH_JWT_SIGNING_KEY"], `{name: TAUTH_JWT_SIGNING_KEY, input: social-threader-tauth-jwt-signing-key}`)
	makefile := string(readRepositoryFile(t, repositoryRoot, "Makefile"))
	if strings.Contains(makefile, "scripts/release") {
		t.Error("Makefile retains the obsolete application-owned release path")
	}
	if !strings.Contains(makefile, `cd "$(MOBILE_DIR)" && $(MOBILE_NPM) ci`) {
		t.Error("mobile-install does not install the exact mobile dependency lock")
	}
	if strings.Contains(makefile, `if [ ! -d "$(MOBILE_DIR)/node_modules" ]`) {
		t.Error("mobile-install skips dependency installation when node_modules exists")
	}
	for _, obsoleteScript := range []string{
		"deploy_pages_artifact.sh",
		"prepare_pages_artifact.sh",
		"prepare_release.sh",
		"publish_release.sh",
		"release_helper.py",
	} {
		if _, statError := os.Stat(filepath.Join(repositoryRoot, "scripts", "release", obsoleteScript)); !os.IsNotExist(statError) {
			t.Errorf("obsolete release script %q must be absent", obsoleteScript)
		}
	}
	if _, statError := os.Stat(filepath.Join(repositoryRoot, ".mprlab", "release.yml")); !os.IsNotExist(statError) {
		t.Error("obsolete .mprlab/release.yml must be absent")
	}
}

func TestLocalBlackBoxStackContract(t *testing.T) {
	repositoryRoot := findRepositoryRoot(t)
	composeBytes := readRepositoryFile(t, repositoryRoot, "docker-compose.yml")
	var composeDocument localComposeDocument
	if unmarshalError := yaml.Unmarshal(composeBytes, &composeDocument); unmarshalError != nil {
		t.Fatalf("local Compose file must be valid YAML: %v", unmarshalError)
	}
	for _, serviceName := range []string{"frontend", "social-threader-api", "tauth", "fake-llm-proxy"} {
		if _, serviceExists := composeDocument.Services[serviceName]; !serviceExists {
			t.Errorf("local Compose service %q is missing", serviceName)
		}
	}
	tauthService, serviceOK := composeDocument.Services["tauth"].(map[string]any)
	if !serviceOK {
		t.Fatal("local TAuth service must be a mapping")
	}
	if tauthService["image"] != "ghcr.io/tyemirov/tauth:2.2.24" {
		t.Fatalf("local TAuth image=%v", tauthService["image"])
	}
	if !reflect.DeepEqual(tauthService["command"], []any{"--config", "/tauth-fixture/service.yaml"}) {
		t.Fatalf("local TAuth must use the fixture-generated service config: %v", tauthService["command"])
	}
	if !reflect.DeepEqual(tauthService["volumes"], []any{"${SOCIAL_THREADER_TAUTH_FIXTURE_DIR:?run make local-tauth-prepare}:/tauth-fixture"}) {
		t.Fatalf("local TAuth must use the separate retained fixture store: %v", tauthService["volumes"])
	}

	dockerfile := string(readRepositoryFile(t, repositoryRoot, "Dockerfile"))
	for _, target := range []string{"AS api", "AS fake-llm-proxy", "AS local-web", "AS pages"} {
		if !strings.Contains(dockerfile, target) {
			t.Errorf("Dockerfile target marker %q is missing", target)
		}
	}
	if !strings.Contains(dockerfile, "COPY privacy /privacy") {
		t.Error("Pages image does not contain the Social Threader privacy policy")
	}
	for _, reservedPagePath := range []string{".nojekyll", "CNAME"} {
		if strings.Contains(dockerfile, reservedPagePath) {
			t.Errorf("Pages image claims gateway-owned path %q", reservedPagePath)
		}
		if _, statError := os.Stat(filepath.Join(repositoryRoot, reservedPagePath)); !os.IsNotExist(statError) {
			t.Errorf("gateway-owned Pages path %q must be absent", reservedPagePath)
		}
	}

	fixtureBytes := readRepositoryFile(t, repositoryRoot, "configs/tauth.local.json")
	var fixture map[string]any
	if decodeError := json.Unmarshal(fixtureBytes, &fixture); decodeError != nil {
		t.Fatalf("decode local TAuth fixture declaration: %v", decodeError)
	}
	if fixture["schema"] != "tauth.test-fixture.v1" || fixture["test_only"] != true || fixture["app_id"] != "social-threader-local" {
		t.Fatalf("local TAuth fixture identity=%v", fixture)
	}
	tenant := fixture["tenant"].(map[string]any)
	for field, expected := range map[string]any{
		"id": "social-threader", "origin": "http://localhost:4173",
		"session_cookie_name": "social_threader_development_session",
		"refresh_cookie_name": "social_threader_development_refresh",
	} {
		if tenant[field] != expected {
			t.Errorf("local TAuth fixture %s=%v, want %v", field, tenant[field], expected)
		}
	}
	if _, statError := os.Stat(filepath.Join(repositoryRoot, "configs/tauth.local.yml")); !os.IsNotExist(statError) {
		t.Error("obsolete inline-tenant service configuration must be absent")
	}

	dockerIgnore := string(readRepositoryFile(t, repositoryRoot, ".dockerignore"))
	for _, line := range strings.Split(dockerIgnore, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "!") {
			t.Errorf(".dockerignore contains a private-input negation %q", line)
		}
	}
	for _, ignoredValue := range []string{
		".env",
		".mprlab/deploy/.env",
		"configs/AuthKey_*.p8",
		"configs/*service-account*.json",
		"configs/google-play*.json",
		"configs/*keystore*.properties",
		"configs/*upload-key*.jks",
	} {
		if !strings.Contains(dockerIgnore, ignoredValue) {
			t.Errorf(".dockerignore does not protect %q", ignoredValue)
		}
	}
}

func TestBrowserProfileAndMprUIContract(t *testing.T) {
	repositoryRoot := findRepositoryRoot(t)
	indexHTML := string(readRepositoryFile(t, repositoryRoot, "index.html"))
	for _, requiredFragment := range []string{
		"https://cdn.jsdelivr.net/gh/MarcoPoloResearchLab/mpr-ui@latest/mpr-ui.css",
		"https://cdn.jsdelivr.net/gh/MarcoPoloResearchLab/mpr-ui@latest/mpr-ui-config.js",
		`data-mpr-ui-bundle-src="https://cdn.jsdelivr.net/gh/MarcoPoloResearchLab/mpr-ui@latest/mpr-ui.js"`,
		`data-config-url="/config-ui.yaml"`,
		"<mpr-user",
		"<mpr-footer",
	} {
		if !strings.Contains(indexHTML, requiredFragment) {
			t.Errorf("browser shell does not contain %q", requiredFragment)
		}
	}
	for _, forbiddenFragment := range []string{
		"tauth.js",
		"tauth-login-path=",
		"tauth-logout-path=",
		"tauth-nonce-path=",
	} {
		if strings.Contains(indexHTML, forbiddenFragment) {
			t.Errorf("browser shell contains forbidden auth integration %q", forbiddenFragment)
		}
	}

	var applicationConfig browserApplicationConfig
	if decodeError := json.Unmarshal(
		readRepositoryFile(t, repositoryRoot, "config-app.json"),
		&applicationConfig,
	); decodeError != nil {
		t.Fatalf("decode browser application config: %v", decodeError)
	}
	if applicationConfig.SchemaVersion != 1 || len(applicationConfig.Environments) != 2 {
		t.Fatalf("browser application profile envelope=%+v", applicationConfig)
	}
	applicationProfiles := make(map[string]struct {
		Origins   []string
		APIOrigin string
	})
	for _, environment := range applicationConfig.Environments {
		applicationProfiles[environment.Name] = struct {
			Origins   []string
			APIOrigin string
		}{Origins: environment.Origins, APIOrigin: environment.APIOrigin}
	}
	if strings.Join(applicationProfiles["local"].Origins, ",") != "http://localhost:4173" || applicationProfiles["local"].APIOrigin != "" {
		t.Fatalf("local browser application profile=%+v", applicationProfiles["local"])
	}
	if strings.Join(applicationProfiles["hosted"].Origins, ",") != "https://threader.mprlab.com" || applicationProfiles["hosted"].APIOrigin != "https://threader-api.mprlab.com" {
		t.Fatalf("hosted browser application profile=%+v", applicationProfiles["hosted"])
	}

	var uiConfig browserUIConfig
	if decodeError := yaml.Unmarshal(
		readRepositoryFile(t, repositoryRoot, "config-ui.yaml"),
		&uiConfig,
	); decodeError != nil {
		t.Fatalf("decode mpr-ui config: %v", decodeError)
	}
	if len(uiConfig.Environments) != 2 {
		t.Fatalf("mpr-ui environment count=%d", len(uiConfig.Environments))
	}
	localUIProfile := uiConfig.Environments[0]
	hostedUIProfile := uiConfig.Environments[1]
	if strings.Join(localUIProfile.Origins, ",") != "http://localhost:4173" || localUIProfile.Auth.TAuthURL != "" {
		t.Fatalf("local mpr-ui profile=%+v", localUIProfile)
	}
	if strings.Join(hostedUIProfile.Origins, ",") != "https://threader.mprlab.com" || hostedUIProfile.Auth.TAuthURL != "https://tauth-api.mprlab.com" {
		t.Fatalf("hosted mpr-ui profile=%+v", hostedUIProfile)
	}
	for _, environment := range uiConfig.Environments {
		if !environment.Auth.Providers.Google.Enabled ||
			environment.Auth.Providers.Apple.Enabled ||
			environment.Auth.Providers.Password.Enabled ||
			environment.Auth.Providers.Google.ClientID == "" ||
			environment.Auth.TenantID != "social-threader" ||
			environment.Auth.Providers.Google.LoginPath != "/auth/google" ||
			environment.Auth.LogoutPath != "/auth/logout" ||
			environment.Auth.Providers.Google.NoncePath != "/auth/nonce" ||
			environment.Auth.SessionPath != "/auth/session" {
			t.Errorf("mpr-ui auth profile is incomplete: %+v", environment.Auth)
		}
	}
}

func findRepositoryRoot(t *testing.T) string {
	t.Helper()
	_, currentFile, _, callerOK := runtime.Caller(0)
	if !callerOK {
		t.Fatal("cannot resolve deployment contract test path")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(currentFile), "..", ".."))
}

func readRepositoryFile(t *testing.T, repositoryRoot string, relativePath string) []byte {
	t.Helper()
	contents, readError := os.ReadFile(filepath.Join(repositoryRoot, relativePath))
	if readError != nil {
		t.Fatalf("cannot read %s: %v", relativePath, readError)
	}
	return contents
}

func currentContractMap(t *testing.T, value any) map[string]any {
	t.Helper()
	result, ok := value.(map[string]any)
	if !ok {
		t.Fatalf("expected native declaration mapping, got %#v", value)
	}
	return result
}

func currentManifestContract(t *testing.T, content []byte) map[string]any {
	t.Helper()
	var envelope map[string]any
	if err := yaml.Unmarshal(content, &envelope); err != nil {
		t.Fatalf("parse selected manifest: %v", err)
	}
	if len(envelope) != 1 {
		t.Fatalf("unexpected manifest envelope: %#v", envelope)
	}
	actual := currentContractMap(t, envelope["mprlab_resources"])
	keys := make([]string, 0, len(actual))
	for key := range actual {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	expected := []string{"artifacts", "environment", "lifecycle", "owner", "publications", "release", "targets"}
	if !reflect.DeepEqual(keys, expected) {
		t.Fatalf("selected manifest root keys=%v want=%v", keys, expected)
	}
	return actual
}

func currentContractDeclaration(t *testing.T, value any, identity string) map[string]any {
	t.Helper()
	items, ok := value.([]any)
	if !ok {
		t.Fatalf("expected explicit declaration list, got %#v", value)
	}
	var found map[string]any
	for _, item := range items {
		declaration := currentContractMap(t, item)
		if declaration["id"] == identity {
			if found != nil {
				t.Fatalf("duplicate declaration %s", identity)
			}
			found = declaration
		}
	}
	if found == nil {
		t.Fatalf("missing native declaration %s", identity)
	}
	return found
}

func currentContractIndex(t *testing.T, value any, identityKey string) map[string]map[string]any {
	t.Helper()
	items, ok := value.([]any)
	if !ok {
		t.Fatalf("expected native declaration list, got %#v", value)
	}
	result := make(map[string]map[string]any, len(items))
	for _, item := range items {
		declaration := currentContractMap(t, item)
		identity, ok := declaration[identityKey].(string)
		if !ok || identity == "" || result[identity] != nil {
			t.Fatalf("invalid or duplicate %s in %#v", identityKey, value)
		}
		result[identity] = declaration
	}
	return result
}

func requireCurrentContractYAML(t *testing.T, path string, actual any, expectedText string) {
	t.Helper()
	var expected any
	if err := yaml.Unmarshal([]byte(expectedText), &expected); err != nil {
		t.Fatalf("parse expected %s: %v", path, err)
	}
	requireCurrentContractValue(t, path, actual, expected)
}

func requireCurrentContractValue(t *testing.T, path string, actual, expected any) {
	t.Helper()
	switch wanted := expected.(type) {
	case map[string]any:
		mapping, ok := actual.(map[string]any)
		if !ok {
			t.Fatalf("%s requires a mapping, got %#v", path, actual)
		}
		if !strings.HasSuffix(path, ".assets[]") && len(mapping) != len(wanted) {
			t.Fatalf("%s has unexpected fields: %#v", path, actual)
		}
		for key, value := range wanted {
			observed, exists := mapping[key]
			if !exists {
				t.Fatalf("%s lacks %s", path, key)
			}
			requireCurrentContractValue(t, path+"."+key, observed, value)
		}
	case []any:
		items, ok := actual.([]any)
		if !ok || len(items) != len(wanted) {
			t.Fatalf("%s list=%#v want=%#v", path, actual, wanted)
		}
		for index, value := range wanted {
			observed := items[index]
			if declaration, isMapping := value.(map[string]any); isMapping {
				identityKey := "id"
				if _, exists := declaration[identityKey]; !exists {
					identityKey = "name"
				}
				if identity, exists := declaration[identityKey]; exists {
					matches := 0
					for _, candidate := range items {
						if entry, valid := candidate.(map[string]any); valid && entry[identityKey] == identity {
							observed = candidate
							matches++
						}
					}
					if matches != 1 {
						t.Fatalf("%s requires one %s=%v, got %d", path, identityKey, identity, matches)
					}
				}
			}
			requireCurrentContractValue(t, path+"[]", observed, value)
		}
	default:
		if !reflect.DeepEqual(actual, expected) {
			t.Fatalf("%s=%#v want=%#v", path, actual, expected)
		}
	}
}
