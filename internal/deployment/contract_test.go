package deployment_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

type manifestDocument struct {
	Resources manifestEnvelope `yaml:"mprlab_resources"`
}

type manifestEnvelope struct {
	Owner     string             `yaml:"owner"`
	Release   manifestRelease    `yaml:"release"`
	Resources []manifestResource `yaml:"resources"`
}

type manifestRelease struct {
	Scheme string `yaml:"scheme"`
}

type manifestResource struct {
	Kind        string            `yaml:"kind"`
	ID          string            `yaml:"id"`
	BuildSystem string            `yaml:"build_system"`
	Build       map[string]string `yaml:"build"`
}

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
			TAuthURL       string `yaml:"tauthUrl"`
			GoogleClientID string `yaml:"googleClientId"`
			TenantID       string `yaml:"tenantId"`
			LoginPath      string `yaml:"loginPath"`
			LogoutPath     string `yaml:"logoutPath"`
			NoncePath      string `yaml:"noncePath"`
			SessionPath    string `yaml:"sessionPath"`
		} `yaml:"auth"`
	} `yaml:"environments"`
}

func TestProductionLifecycleContract(t *testing.T) {
	repositoryRoot := findRepositoryRoot(t)
	manifestBytes := readRepositoryFile(t, repositoryRoot, ".mprlab/deploy/resources.yml")
	var document manifestDocument
	if unmarshalError := yaml.Unmarshal(manifestBytes, &document); unmarshalError != nil {
		t.Fatalf("deployment manifest must be valid YAML: %v", unmarshalError)
	}
	var manifestShape map[string]any
	if unmarshalError := yaml.Unmarshal(manifestBytes, &manifestShape); unmarshalError != nil {
		t.Fatalf("deployment manifest shape must be valid YAML: %v", unmarshalError)
	}
	resourceEnvelopeShape, shapeOK := manifestShape["mprlab_resources"].(map[string]any)
	if !shapeOK {
		t.Fatal("deployment manifest must contain the mprlab_resources mapping")
	}
	if len(resourceEnvelopeShape) != 3 {
		t.Fatalf("manifest envelope keys = %#v, want owner, release, and resources", resourceEnvelopeShape)
	}
	for _, requiredKey := range []string{"owner", "release", "resources"} {
		if _, present := resourceEnvelopeShape[requiredKey]; !present {
			t.Fatalf("manifest envelope lacks %q", requiredKey)
		}
	}
	if _, present := resourceEnvelopeShape["schema_version"]; present {
		t.Fatal("selected manifest must not declare schema_version")
	}
	if document.Resources.Owner != "social-threader" {
		t.Fatalf("manifest owner = %q, want social-threader", document.Resources.Owner)
	}
	if document.Resources.Release.Scheme != "semver" {
		t.Fatalf("release scheme = %q, want semver", document.Resources.Release.Scheme)
	}

	expectedResources := map[string]string{
		"private":        "private_values",
		"runtime":        "compose_project",
		"http":           "runtime_capability",
		"public-api":     "caddy_route",
		"public-health":  "health_check",
		"website":        "github_pages",
		"mobile":         "mobile_application",
		"authentication": "tauth_tenant",
	}
	actualResources := make(map[string]string, len(document.Resources.Resources))
	for _, resource := range document.Resources.Resources {
		actualResources[resource.ID] = resource.Kind
	}
	for resourceID, expectedKind := range expectedResources {
		if actualResources[resourceID] != expectedKind {
			t.Errorf("resource %q kind = %q, want %q", resourceID, actualResources[resourceID], expectedKind)
		}
	}
	if len(actualResources) != len(expectedResources) {
		t.Fatalf("manifest has %d resources, want %d", len(actualResources), len(expectedResources))
	}
	for _, resource := range document.Resources.Resources {
		if resource.ID != "mobile" {
			continue
		}
		if resource.BuildSystem != "local" {
			t.Errorf("mobile build system = %q, want local", resource.BuildSystem)
		}
		if resource.Build["android"] != "mobile/scripts/build-android-bundle.mjs" {
			t.Errorf("mobile Android build script = %q", resource.Build["android"])
		}
	}

	makefile := string(readRepositoryFile(t, repositoryRoot, "Makefile"))
	if !strings.Contains(makefile, "release publish deploy:") {
		t.Error("Makefile does not define the three production lifecycle targets together")
	}
	if !strings.Contains(makefile, `"app-$@"`) || !strings.Contains(makefile, `MPRLAB_APP_ROOT="$${application_root}"`) {
		t.Error("Makefile does not delegate the selected lifecycle target to the sibling gateway")
	}
	if !strings.Contains(makefile, "required sibling gateway is missing:") {
		t.Error("Makefile does not explain the exact required sibling gateway location")
	}
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

	dockerfile := string(readRepositoryFile(t, repositoryRoot, "Dockerfile"))
	for _, target := range []string{"AS api", "AS fake-llm-proxy", "AS local-web", "AS pages"} {
		if !strings.Contains(dockerfile, target) {
			t.Errorf("Dockerfile target marker %q is missing", target)
		}
	}
	for _, reservedPagePath := range []string{".nojekyll", "CNAME"} {
		if strings.Contains(dockerfile, reservedPagePath) {
			t.Errorf("Pages image claims gateway-owned path %q", reservedPagePath)
		}
		if _, statError := os.Stat(filepath.Join(repositoryRoot, reservedPagePath)); !os.IsNotExist(statError) {
			t.Errorf("gateway-owned Pages path %q must be absent", reservedPagePath)
		}
	}

	tauthConfig := string(readRepositoryFile(t, repositoryRoot, "configs/tauth.local.yml"))
	for _, requiredValue := range []string{
		`id: "social-threader"`,
		`http://localhost:4173`,
		`session_cookie_name: "social_threader_development_session"`,
		`refresh_cookie_name: "social_threader_development_refresh"`,
		`allow_insecure_http: true`,
	} {
		if !strings.Contains(tauthConfig, requiredValue) {
			t.Errorf("local TAuth configuration does not contain %q", requiredValue)
		}
	}

	dockerIgnore := string(readRepositoryFile(t, repositoryRoot, ".dockerignore"))
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
		if environment.Auth.GoogleClientID == "" ||
			environment.Auth.TenantID != "social-threader" ||
			environment.Auth.LoginPath != "/auth/google" ||
			environment.Auth.LogoutPath != "/auth/logout" ||
			environment.Auth.NoncePath != "/auth/nonce" ||
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
