package deployment_test

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestAndroidPublisherLifecycleModes(t *testing.T) {
	repositoryRoot := findRepositoryRoot(t)
	fixture := createAndroidPublisherFixture(t, repositoryRoot)

	testCases := []struct {
		name             string
		providerState    string
		modeArguments    []string
		expectedStatus   string
		expectedEffects  []string
		forbiddenEffects []string
	}{
		{
			name:             "preflight verifies access without publication",
			providerState:    "absent",
			modeArguments:    []string{"--dry-run"},
			expectedStatus:   "planned",
			forbiddenEffects: []string{"UPLOAD_BUNDLE", "UPDATE_TRACK", "COMMIT_EDIT"},
		},
		{
			name:             "reconcile reports absent exact publication",
			providerState:    "absent",
			modeArguments:    []string{"--reconcile"},
			expectedStatus:   "absent",
			forbiddenEffects: []string{"UPLOAD_BUNDLE", "UPDATE_TRACK", "COMMIT_EDIT"},
		},
		{
			name:             "reconcile reports submitted exact publication",
			providerState:    "submitted",
			modeArguments:    []string{"--reconcile"},
			expectedStatus:   "submitted",
			forbiddenEffects: []string{"UPLOAD_BUNDLE", "UPDATE_TRACK", "COMMIT_EDIT"},
		},
		{
			name:             "reconcile rejects draft release",
			providerState:    "draft",
			modeArguments:    []string{"--reconcile"},
			expectedStatus:   "absent",
			forbiddenEffects: []string{"UPLOAD_BUNDLE", "UPDATE_TRACK", "COMMIT_EDIT"},
		},
		{
			name:             "reconcile rejects halted release",
			providerState:    "halted",
			modeArguments:    []string{"--reconcile"},
			expectedStatus:   "absent",
			forbiddenEffects: []string{"UPLOAD_BUNDLE", "UPDATE_TRACK", "COMMIT_EDIT"},
		},
		{
			name:             "reconcile rejects partial release",
			providerState:    "inProgress",
			modeArguments:    []string{"--reconcile"},
			expectedStatus:   "absent",
			forbiddenEffects: []string{"UPLOAD_BUNDLE", "UPDATE_TRACK", "COMMIT_EDIT"},
		},
		{
			name:             "reconcile rejects release with wrong name",
			providerState:    "wrong-name",
			modeArguments:    []string{"--reconcile"},
			expectedStatus:   "absent",
			forbiddenEffects: []string{"UPLOAD_BUNDLE", "UPDATE_TRACK", "COMMIT_EDIT"},
		},
		{
			name:            "submit publishes and verifies absent artifact",
			providerState:   "absent",
			expectedStatus:  "submitted",
			expectedEffects: []string{"UPLOAD_BUNDLE", "UPDATE_TRACK", "COMMIT_EDIT"},
		},
		{
			name:             "submit repairs mismatched release metadata",
			providerState:    "draft",
			expectedStatus:   "submitted",
			expectedEffects:  []string{"UPLOAD_MAPPING", "UPDATE_TRACK", "COMMIT_EDIT"},
			forbiddenEffects: []string{"UPLOAD_BUNDLE"},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			effectsPath := filepath.Join(t.TempDir(), "effects.log")
			output, runError := runAndroidPublisherFixture(t, fixture, testCase.providerState, effectsPath, testCase.modeArguments)
			if runError != nil {
				t.Fatalf("publisher failed: %v\n%s", runError, output)
			}
			var result struct {
				Status          string `json:"status"`
				Track           string `json:"track"`
				PublisherAccess string `json:"publisherAccess"`
			}
			if decodeError := json.Unmarshal(output, &result); decodeError != nil {
				t.Fatalf("decode publisher result: %v\n%s", decodeError, output)
			}
			if result.Status != testCase.expectedStatus || result.Track != "production" || result.PublisherAccess != "verified" {
				t.Fatalf("publisher result=%+v", result)
			}
			effects := readOptionalFile(t, effectsPath)
			for _, expectedEffect := range testCase.expectedEffects {
				if !strings.Contains(effects, expectedEffect+"\n") {
					t.Errorf("provider effects omit %q:\n%s", expectedEffect, effects)
				}
			}
			for _, forbiddenEffect := range testCase.forbiddenEffects {
				if strings.Contains(effects, forbiddenEffect+"\n") {
					t.Errorf("provider effects contain %q:\n%s", forbiddenEffect, effects)
				}
			}
		})
	}
}

func TestAndroidPublisherRejectsConflictingPublishedBundle(t *testing.T) {
	repositoryRoot := findRepositoryRoot(t)
	fixture := createAndroidPublisherFixture(t, repositoryRoot)
	effectsPath := filepath.Join(t.TempDir(), "effects.log")
	output, runError := runAndroidPublisherFixture(t, fixture, "conflict", effectsPath, []string{"--reconcile"})
	if runError == nil {
		t.Fatalf("conflicting provider artifact succeeded:\n%s", output)
	}
	if !strings.Contains(string(output), "has a different Android App Bundle digest") {
		t.Fatalf("conflicting provider diagnostic is incomplete:\n%s", output)
	}
	if effects := readOptionalFile(t, effectsPath); strings.Contains(effects, "UPLOAD_BUNDLE\n") || strings.Contains(effects, "UPDATE_TRACK\n") {
		t.Fatalf("conflict caused a publication effect:\n%s", effects)
	}
}

type androidPublisherFixture struct {
	scriptPath      string
	mobileDirectory string
	aabPath         string
	mappingPath     string
	manifestPath    string
	preloadPath     string
	executablePath  string
	aabDigest       string
}

func createAndroidPublisherFixture(t *testing.T, repositoryRoot string) androidPublisherFixture {
	t.Helper()
	fixtureRoot := t.TempDir()
	mobileDirectory := filepath.Join(fixtureRoot, "mobile")
	executablePath := filepath.Join(fixtureRoot, "bin")
	if makeError := os.MkdirAll(mobileDirectory, 0o700); makeError != nil {
		t.Fatal(makeError)
	}
	if makeError := os.MkdirAll(executablePath, 0o700); makeError != nil {
		t.Fatal(makeError)
	}

	writeTestFile(t, filepath.Join(mobileDirectory, "app.json"), `{"expo":{"version":"0.1.0","android":{"versionCode":7,"package":"com.mprlab.socialthreader"}}}`+"\n", 0o600)
	writeTestFile(t, filepath.Join(mobileDirectory, "android-release-identity.json"), `{"packageName":"com.mprlab.socialthreader","googleCloudProjectId":"fixture-project"}`+"\n", 0o600)
	aabPath := filepath.Join(fixtureRoot, "android.aab")
	mappingPath := filepath.Join(fixtureRoot, "android-mapping.txt")
	manifestPath := filepath.Join(fixtureRoot, "android.json")
	writeTestFile(t, aabPath, "sealed-aab\n", 0o600)
	writeTestFile(t, mappingPath, "mapping\n", 0o600)
	aabDigest := fileSHA256(t, aabPath)
	manifest := map[string]any{
		"schema":                   "social-threader.mobile-android-bundle.v1",
		"status":                   "passed",
		"androidPackage":           "com.mprlab.socialthreader",
		"versionName":              "0.1.0",
		"versionCode":              7,
		"sourceVersionCode":        7,
		"versionCodeSource":        "local_app_json",
		"versionCodePolicy":        "expo.android.versionCode",
		"googlePlayMaxVersionCode": nil,
		"output":                   aabPath,
		"sha256":                   aabDigest,
		"deobfuscationFile":        mappingPath,
		"deobfuscationSha256":      fileSHA256(t, mappingPath),
		"versioning": map[string]string{
			"artifactVersion":  "1.2.3",
			"releaseTimestamp": "2026-08-19T19:00:00Z",
		},
	}
	manifestBytes, encodeError := json.Marshal(manifest)
	if encodeError != nil {
		t.Fatal(encodeError)
	}
	writeTestFile(t, manifestPath, string(manifestBytes)+"\n", 0o600)

	preloadPath := filepath.Join(fixtureRoot, "provider-preload.mjs")
	writeTestFile(t, preloadPath, androidPublisherPreload, 0o600)
	writeTestFile(t, filepath.Join(executablePath, "gcloud"), "#!/bin/sh\nprintf '%s\\n' fixture-access-token\n", 0o700)

	return androidPublisherFixture{
		scriptPath:      filepath.Join(repositoryRoot, "mobile", "scripts", "publish-android-play.mjs"),
		mobileDirectory: mobileDirectory,
		aabPath:         aabPath,
		mappingPath:     mappingPath,
		manifestPath:    manifestPath,
		preloadPath:     preloadPath,
		executablePath:  executablePath,
		aabDigest:       aabDigest,
	}
}

func runAndroidPublisherFixture(t *testing.T, fixture androidPublisherFixture, providerState string, effectsPath string, modeArguments []string) ([]byte, error) {
	t.Helper()
	arguments := []string{
		fixture.scriptPath,
		"--mobile-dir", fixture.mobileDirectory,
		"--release-timestamp", "2026-08-19T19:00:00Z",
		"--aab", fixture.aabPath,
		"--mapping", fixture.mappingPath,
		"--build-manifest", fixture.manifestPath,
	}
	arguments = append(arguments, modeArguments...)
	command := exec.Command("node", arguments...)
	command.Env = append(os.Environ(),
		"MPRLAB_ARTIFACT_VERSION=1.2.3",
		"NODE_OPTIONS=--import="+fixture.preloadPath,
		"PATH="+fixture.executablePath+string(os.PathListSeparator)+os.Getenv("PATH"),
		"SOCIAL_THREADER_PROVIDER_STATE="+providerState,
		"SOCIAL_THREADER_PROVIDER_AAB_SHA256="+fixture.aabDigest,
		"SOCIAL_THREADER_PROVIDER_EFFECTS="+effectsPath,
	)
	return command.CombinedOutput()
}

func writeTestFile(t *testing.T, filePath string, contents string, mode os.FileMode) {
	t.Helper()
	if writeError := os.WriteFile(filePath, []byte(contents), mode); writeError != nil {
		t.Fatal(writeError)
	}
}

func fileSHA256(t *testing.T, filePath string) string {
	t.Helper()
	contents, readError := os.ReadFile(filePath)
	if readError != nil {
		t.Fatal(readError)
	}
	digest := sha256.Sum256(contents)
	return hex.EncodeToString(digest[:])
}

func readOptionalFile(t *testing.T, filePath string) string {
	t.Helper()
	contents, readError := os.ReadFile(filePath)
	if os.IsNotExist(readError) {
		return ""
	}
	if readError != nil {
		t.Fatal(readError)
	}
	return string(contents)
}

const androidPublisherPreload = `
import fs from "node:fs";

const PROVIDER_STATES = Object.freeze({
  ABSENT: "absent",
  CONFLICT: "conflict",
  DRAFT: "draft",
  HALTED: "halted",
  IN_PROGRESS: "inProgress",
  SUBMITTED: "submitted",
  WRONG_NAME: "wrong-name"
});
const providerState = String(process.env.SOCIAL_THREADER_PROVIDER_STATE || "");
let submitted = providerState === PROVIDER_STATES.SUBMITTED;
const conflicting = providerState === PROVIDER_STATES.CONFLICT;
const releaseMetadataStates = new Set([
  PROVIDER_STATES.DRAFT,
  PROVIDER_STATES.HALTED,
  PROVIDER_STATES.IN_PROGRESS,
  PROVIDER_STATES.SUBMITTED,
  PROVIDER_STATES.WRONG_NAME
]);
const expectedDigest = String(process.env.SOCIAL_THREADER_PROVIDER_AAB_SHA256 || "");
const effectsPath = String(process.env.SOCIAL_THREADER_PROVIDER_EFFECTS || "");
const recordEffect = (effect) => fs.appendFileSync(effectsPath, effect + "\n", { mode: 0o600 });
const response = (payload = {}) => ({
  ok: true,
  status: 200,
  text: async () => Object.keys(payload).length ? JSON.stringify(payload) : ""
});
const currentRelease = () => {
  if (submitted) {
    return { name: "0.1.0", versionCodes: ["7"], status: "completed" };
  }
  if (providerState === PROVIDER_STATES.WRONG_NAME) {
    return { name: "other-release", versionCodes: ["7"], status: "completed" };
  }
  return { name: "0.1.0", versionCodes: ["7"], status: providerState };
};

globalThis.fetch = async (urlValue, options = {}) => {
  const url = String(urlValue);
  const method = String(options.method || "GET");
  if (method === "POST" && url.endsWith("/edits")) {
    return response({ id: "fixture-edit" });
  }
  if (method === "DELETE" && url.endsWith("/edits/fixture-edit")) {
    return response();
  }
  if (method === "GET" && url.endsWith("/edits/fixture-edit/bundles")) {
    if (!releaseMetadataStates.has(providerState) && !submitted && !conflicting) {
      return response({ bundles: [] });
    }
    return response({ bundles: [{ versionCode: 7, sha256: conflicting ? "different" : expectedDigest }] });
  }
  if (method === "GET" && url.endsWith("/edits/fixture-edit/tracks")) {
    return response({
      tracks: submitted || releaseMetadataStates.has(providerState)
        ? [{ track: "production", releases: [currentRelease()] }]
        : []
    });
  }
  if (method === "POST" && url.includes("/bundles?uploadType=media")) {
    recordEffect("UPLOAD_BUNDLE");
    return response({ versionCode: 7 });
  }
  if (method === "POST" && url.includes("/deobfuscationFiles/proguard?uploadType=media")) {
    recordEffect("UPLOAD_MAPPING");
    return response();
  }
  if (method === "PUT" && url.endsWith("/tracks/production")) {
    recordEffect("UPDATE_TRACK");
    return response();
  }
  if (method === "POST" && url.endsWith("/edits/fixture-edit:commit")) {
    recordEffect("COMMIT_EDIT");
    submitted = true;
    return response({ id: "fixture-edit" });
  }
  return {
    ok: false,
    status: 500,
    text: async () => "unexpected provider request: " + method + " " + url
  };
};
`
