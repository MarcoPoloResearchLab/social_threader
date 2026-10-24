// @ts-check
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "../..");
const ADAPTER_PATH = join(REPOSITORY_ROOT, "mobile/scripts/build-ios.mjs");
const TIMESTAMP = "2026-10-20T06:00:00Z";
const plist = createRequire(import.meta.url)("@expo/plist").default;

test("iOS adapter sends the selected application contract through a closed JSON input", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "social-ios-adapter-"));
  try {
    writeFileSync(join(fixtureRoot, "app.json"), JSON.stringify({ expo: {
      version: "1.0.0", ios: { bundleIdentifier: "com.mprlab.threader", buildNumber: "1" }
    } }));
    writeFileSync(join(fixtureRoot, "ios-release-identity.json"), readFileSync(join(REPOSITORY_ROOT, "mobile/ios-release-identity.json")));
    writeFileSync(join(fixtureRoot, "mobile-build-operation"), `
      const fs = require("node:fs");
      const request = JSON.parse(fs.readFileSync(0, "utf8"));
      process.stdout.write(JSON.stringify({ request, ci: process.env.CI, telemetry: process.env.EXPO_NO_TELEMETRY }));
      process.stderr.write("provider diagnostic");
      process.exit(31);
    `);
    const result = spawnSync(process.execPath, [ADAPTER_PATH,
      "--mobile-dir", fixtureRoot, "--output", join(fixtureRoot, "output.ipa"),
      "--manifest", join(fixtureRoot, "output.json"), "--release-timestamp", TIMESTAMP
    ], { cwd: fixtureRoot, env: { PATH: "", MPRLAB_GATEWAY_EXECUTABLE: process.execPath,
      EXPO_NO_TELEMETRY: "0", MPRLAB_ARTIFACT_VERSION: "v1.2.0", MPRLAB_MOBILE_BUILD_INTENT: join(fixtureRoot, "intent.json") },
      input: "", encoding: "utf8" });
    assert.equal(result.status, 31, result.stderr);
    const response = JSON.parse(result.stdout);
    assert.equal(response.ci, "1");
    assert.equal(response.telemetry, "1");
    assert.equal(response.request.schema_version, 3);
    assert.equal(response.request.source_root, fixtureRoot);
    assert.equal(response.request.platform, "ios");
    assert.equal(response.request.application_identifier, "com.mprlab.threader");
    assert.equal(response.request.version, "1.0.0");
    assert.equal(response.request.release_timestamp, TIMESTAMP);
    assert.match(response.request.build_number, /^[1-9][0-9]*$/);
    assert.equal(response.request.ios.export_intent, "app-store");
    assert.equal(response.request.ios.owner, "social-threader");
    assert.equal(Object.hasOwn(response.request.ios, "environment"), false);
    assert.equal(response.request.verify_script, "scripts/verify-ios-preparation.mjs");
    assert.equal(response.request.android, undefined);
    assert.equal(result.stderr, "provider diagnostic");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("iOS adapter request passes the Gateway decoder before build execution", () => {
  assert.ok(process.env.MPRLAB_GATEWAY_EXECUTABLE, "MPRLAB_GATEWAY_EXECUTABLE must select the installed physical runtime binary");
  const fixtureRoot = mkdtempSync(join(tmpdir(), "social-ios-gateway-"));
  try {
    const mobileRoot = join(REPOSITORY_ROOT, "mobile");
    const identity = JSON.parse(readFileSync(join(mobileRoot, "ios-release-identity.json"), "utf8"));
    for (const filename of ["app.json", "ios-release-identity.json", "package.json", "package-lock.json",
      "scripts/verify-ios-preparation.mjs", "ios/Podfile", "ios/Podfile.lock", identity.entryFile,
      `${identity.workspace}/contents.xcworkspacedata`]) {
      mkdirSync(dirname(join(fixtureRoot, filename)), { recursive: true });
      writeFileSync(join(fixtureRoot, filename), readFileSync(join(mobileRoot, filename)));
    }
    const result = spawnSync(process.env.MPRLAB_GATEWAY_EXECUTABLE, [
      "bootstrap-run", "--repo-root", REPOSITORY_ROOT, "--operation", "app-release", "--",
      process.execPath, ADAPTER_PATH,
      "--mobile-dir", fixtureRoot, "--output", join(fixtureRoot, "output.ipa"),
      "--manifest", join(fixtureRoot, "output.json"), "--release-timestamp", TIMESTAMP
    ], { cwd: fixtureRoot, env: {
      MPRLAB_GATEWAY_EXECUTABLE: process.env.MPRLAB_GATEWAY_EXECUTABLE,
      MPRLAB_ARTIFACT_VERSION: "v1.2.0",
      MPRLAB_MOBILE_BUILD_INTENT: "invalid-relative-intent",
      MPRLAB_APPLICATION_LIFECYCLE_LOCK: "exclusive", MPRLAB_LIFECYCLE_OPERATION: "release"
    }, input: "", encoding: "utf8", timeout: 15_000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 2, result.stderr);
    // Gateway checks the intent path only after decoding and validating the complete request.
    assert.match(result.stderr, /requires an absolute MPRLAB_MOBILE_BUILD_INTENT/);
    assert.equal(result.stdout, "");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("iOS adapter rejects identifier drift and absent lifecycle identity before invoking Gateway", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "social-ios-invalid-"));
  try {
    writeFileSync(join(fixtureRoot, "app.json"), JSON.stringify({ expo: {
      version: "1.0.0", ios: { bundleIdentifier: "com.mprlab.wrong", buildNumber: "1" }
    } }));
    writeFileSync(join(fixtureRoot, "ios-release-identity.json"), readFileSync(join(REPOSITORY_ROOT, "mobile/ios-release-identity.json")));
    for (const scenario of [
      { environment: { MPRLAB_GATEWAY_EXECUTABLE: process.execPath }, error: /bundle identifier mismatch/ },
      { environment: {}, error: /MPRLAB_GATEWAY_EXECUTABLE/ }
    ]) {
      const result = spawnSync(process.execPath, [ADAPTER_PATH,
        "--mobile-dir", fixtureRoot, "--output", join(fixtureRoot, "output.ipa"),
        "--manifest", join(fixtureRoot, "output.json"), "--release-timestamp", TIMESTAMP
      ], { cwd: fixtureRoot, env: scenario.environment, input: "", encoding: "utf8" });
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, scenario.error);
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("prepared native verification rejects changed application config and native output", () => {
  const mobileRoot = join(REPOSITORY_ROOT, "mobile");
  const fixtureRoot = mkdtempSync(join(tmpdir(), "social-ios-preparation-"));
  try {
    const record = JSON.parse(readFileSync(join(mobileRoot, "ios/preparation.json"), "utf8"));
    for (const filename of [...Object.keys(record.inputs), ...Object.keys(record.outputs), "ios/preparation.json"]) {
      mkdirSync(dirname(join(fixtureRoot, filename)), { recursive: true });
      writeFileSync(join(fixtureRoot, filename), readFileSync(join(mobileRoot, filename)));
    }
    const verifier = join(fixtureRoot, "scripts/verify-ios-preparation.mjs");
    const runVerifier = () => spawnSync(process.execPath, [verifier], { cwd: fixtureRoot, input: "", encoding: "utf8" });
    assert.equal(runVerifier().status, 0);
    const configPath = join(fixtureRoot, "app.json");
    const originalConfig = readFileSync(configPath, "utf8");
    writeFileSync(configPath, originalConfig.replace("1.0.0", "1.0.1"));
    const changedConfig = runVerifier();
    assert.equal(changedConfig.status, 2);
    assert.match(changedConfig.stderr, /stale iOS preparation input/);
    writeFileSync(configPath, originalConfig);
    const nativePath = join(fixtureRoot, "ios/SocialThreader/Info.plist");
    writeFileSync(nativePath, `${readFileSync(nativePath, "utf8")}\n`);
    const changedNative = runVerifier();
    assert.equal(changedNative.status, 2);
    assert.match(changedNative.stderr, /stale iOS preparation native output/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("generated iOS project adopts Expo scenes and resolves release version build settings", () => {
  const nativeRoot = join(REPOSITORY_ROOT, "mobile/ios/SocialThreader");
  const info = plist.parse(readFileSync(join(nativeRoot, "Info.plist"), "utf8"));
  assert.equal(info.CFBundleVersion, "$(CURRENT_PROJECT_VERSION)");
  assert.equal(info.CFBundleShortVersionString, "$(MARKETING_VERSION)");
  const scene = info.UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication[0];
  assert.equal(scene.UISceneDelegateClassName, "EXExpoAppSceneDelegate");
  assert.equal(info.UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes, false);
  const delegate = readFileSync(join(nativeRoot, "AppDelegate.swift"), "utf8");
  assert.match(delegate, /class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider/);
  assert.match(delegate, /reactNativeFactory = factory/);
  assert.doesNotMatch(delegate, /factory\.startReactNative|UIWindow\(frame:/);
});
