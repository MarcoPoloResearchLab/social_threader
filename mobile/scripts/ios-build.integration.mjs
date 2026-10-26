// @ts-check
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync, cpSync, existsSync } from "node:fs";
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
  assert.ok(process.env.MPRLAB_GATEWAY_EXECUTABLE, "MPRLAB_GATEWAY_EXECUTABLE must select the installed runtime executable");
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
    const signingInputs = [...Object.values(identity.signing), ...Object.values(identity.provisioning)];
    const manifestDirectory = join(fixtureRoot, ".mprlab/deploy");
    mkdirSync(manifestDirectory, { recursive: true });
    writeFileSync(join(manifestDirectory, "resources.yml"), JSON.stringify({ mprlab_resources: {
      owner: identity.owner,
      release: { scheme: "semver" },
      ci: { enabled: false },
      defaults: { timeouts: {
        startup: "30s", completion: "1m", readiness: "30s", request: "30s", shutdown: "30s"
      } },
      inputs: Object.fromEntries(signingInputs.map((name, index) => [name, `synthetic-decoder-input-${index}`])),
      resources: { private: { kind: "private_values",
        bindings: Object.fromEntries(signingInputs.map((name, index) => [`decoder-input-${index}`, name]))
      } }
    } }));
    const result = spawnSync(process.env.MPRLAB_GATEWAY_EXECUTABLE, [
      "bootstrap-run", "--repo-root", fixtureRoot, "--operation", "app-release", "--",
      process.execPath, ADAPTER_PATH,
      "--mobile-dir", fixtureRoot, "--output", join(fixtureRoot, "output.ipa"),
      "--manifest", join(fixtureRoot, "output.json"), "--release-timestamp", TIMESTAMP
    ], { cwd: fixtureRoot, env: {
      PATH: process.env.PATH,
      MPRLAB_GATEWAY_EXECUTABLE: process.env.MPRLAB_GATEWAY_EXECUTABLE,
      MPRLAB_ARTIFACT_VERSION: "v1.2.0",
      MPRLAB_MOBILE_BUILD_INTENT: "invalid-relative-intent",
      MPRLAB_APPLICATION_LIFECYCLE_LOCK: "exclusive", MPRLAB_LIFECYCLE_OPERATION: "release"
    }, input: "", encoding: "utf8", timeout: 15_000 });
    assert.ifError(result.error);
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

/** @param {(root:string) => void} scenario */
async function withPreparedIosFixture(scenario) {
  const mobileRoot = join(REPOSITORY_ROOT, "mobile");
  const fixtureRoot = mkdtempSync(join(tmpdir(), "social-ios-preparation-"));
  try {
    for (const filename of ["app.json", "app.config.js", "package.json", "package-lock.json",
      "babel.config.js", "metro.config.js", "index.js", "ios-release-identity.json"]) {
      copyFileSync(join(mobileRoot, filename), join(fixtureRoot, filename));
    }
    for (const directory of ["assets", "scripts", "plugins"]) {
      cpSync(join(mobileRoot, directory), join(fixtureRoot, directory), { recursive: true });
    }
    for (const filename of ["Podfile", "Podfile.lock", "Podfile.properties.json",
      "SocialThreader.xcworkspace/contents.xcworkspacedata", "SocialThreader.xcodeproj/project.pbxproj",
      "SocialThreader.xcodeproj/xcshareddata/xcschemes/SocialThreader.xcscheme", "SocialThreader/Info.plist"]) {
      mkdirSync(dirname(join(fixtureRoot, "ios", filename)), { recursive: true });
      copyFileSync(join(mobileRoot, "ios", filename), join(fixtureRoot, "ios", filename));
    }
    const { recordIosPreparation } = await import("./lib/ios-preparation.mjs");
    recordIosPreparation(fixtureRoot, { xcode: "Xcode 27.1\nBuild version 27A9275", cocoapods: "1.17.0" });
    scenario(fixtureRoot);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

/** @param {string} root */
function verifyIosFixture(root) {
  return spawnSync(process.execPath, [join(root, "scripts/verify-ios-preparation.mjs")], {
    cwd: root, input: "", encoding: "utf8"
  });
}

test("iOS preparation records semantic facts without file fingerprints", async () => {
  await withPreparedIosFixture(root => {
    const record = JSON.parse(readFileSync(join(root, "ios/preparation.json"), "utf8"));
    assert.equal(Object.hasOwn(record, "inputs"), false);
    assert.equal(Object.hasOwn(record, "outputs"), false);
    assert.equal(verifyIosFixture(root).status, 0);
  });
});

test("iOS verification accepts regenerated native metadata with the selected application configuration", async () => {
  await withPreparedIosFixture(root => {
    writeFileSync(join(root, "ios/Podfile.lock"), `${readFileSync(join(root, "ios/Podfile.lock"), "utf8")}\n# CocoaPods regenerated local metadata\n`);
    writeFileSync(join(root, "ios/SocialThreader/Info.plist"), `${readFileSync(join(root, "ios/SocialThreader/Info.plist"), "utf8")}\n`);
    const result = verifyIosFixture(root);
    assert.equal(result.status, 0, result.stderr);
  });
});

for (const scenario of [
  { name: "missing workspace", change: root => rmSync(join(root, "ios/SocialThreader.xcworkspace/contents.xcworkspacedata")), diagnostic: /missing prepared iOS file/ },
  { name: "missing native scheme", change: root => rmSync(join(root, "ios/SocialThreader.xcodeproj/xcshareddata/xcschemes/SocialThreader.xcscheme")), diagnostic: /missing prepared iOS file/ },
  { name: "selected workspace mismatch", change: root => {
    const filename = join(root, "ios-release-identity.json");
    const identity = JSON.parse(readFileSync(filename, "utf8"));
    identity.workspace = "ios/Other.xcworkspace";
    writeFileSync(filename, JSON.stringify(identity));
  }, diagnostic: /workspace/ },
  { name: "selected scheme mismatch", change: root => {
    const filename = join(root, "ios-release-identity.json");
    const identity = JSON.parse(readFileSync(filename, "utf8"));
    identity.scheme = "Other";
    writeFileSync(filename, JSON.stringify(identity));
  }, diagnostic: /scheme/ },
  { name: "bundle identifier mismatch", change: root => {
    const app = JSON.parse(readFileSync(join(root, "app.json"), "utf8"));
    app.expo.ios.bundleIdentifier = "com.mprlab.wrong";
    writeFileSync(join(root, "app.json"), JSON.stringify(app));
  }, diagnostic: /bundle identifier/ },
  { name: "application version mismatch", change: root => {
    const app = JSON.parse(readFileSync(join(root, "app.json"), "utf8"));
    app.expo.version = "1.0.1";
    writeFileSync(join(root, "app.json"), JSON.stringify(app));
  }, diagnostic: /version/ },
  { name: "native bundle configuration mismatch", change: root => {
    const project = join(root, "ios/SocialThreader.xcodeproj/project.pbxproj");
    writeFileSync(project, readFileSync(project, "utf8").replaceAll("PRODUCT_BUNDLE_IDENTIFIER = com.mprlab.threader;", "PRODUCT_BUNDLE_IDENTIFIER = com.mprlab.wrong;"));
  }, diagnostic: /bundle identifier/ }
]) {
  test(`iOS preparation rejects ${scenario.name} through the public verifier`, async () => {
    await withPreparedIosFixture(root => {
      scenario.change(root);
      const result = verifyIosFixture(root);
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, scenario.diagnostic);
    });
  });
}

test("public iOS preparation does not record success after CocoaPods fails", async () => {
  await withPreparedIosFixture(root => {
    rmSync(join(root, "ios/preparation.json"));
    const programs = join(root, "programs");
    mkdirSync(programs);
    for (const [name, source] of [
      ["npm", "process.exit(0);"],
      ["xcodebuild", 'process.stdout.write("Xcode 27.1\\nBuild version 27A9275\\n");'],
      ["pod", 'if(process.argv.includes("--version"))process.stdout.write("1.17.0\\n");else{process.stderr.write("controlled CocoaPods failure");process.exit(23);}']
    ]) {
      const filename = join(programs, name);
      copyFileSync(process.execPath, filename);
      writeFileSync(filename, `#!${process.execPath}\n${source}\n`);
    }
    const result = spawnSync(process.execPath, [join(root, "scripts/prepare-ios.mjs")], {
      cwd: root, env: { ...process.env, PATH: `${programs}:${dirname(process.execPath)}`, NODE_ENV: "production" },
      input: "", encoding: "utf8"
    });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /controlled CocoaPods failure/);
    assert.match(result.stderr, /pod failed with exit status 23/);
    assert.equal(existsSync(join(root, "ios/preparation.json")), false);
  });
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
