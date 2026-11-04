// @ts-check
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync, cpSync, existsSync, readdirSync, realpathSync } from "node:fs";
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
  const gatewayExecutable = process.env.MPRLAB_GATEWAY_EXECUTABLE;
  assert.ok(gatewayExecutable, "MPRLAB_GATEWAY_EXECUTABLE must select the installed runtime executable");
  const fixture = realpathSync(mkdtempSync(join(tmpdir(), "social-ios-public-release-")));
  const source = join(fixture, "application");
  const origin = join(fixture, "origin.git");
  const programs = join(fixture, "programs");
  const boundaryLog = join(fixture, "build-boundary.log");
  const nativeLog = join(fixture, "native.log");
  const providerLog = join(fixture, "provider.log");
  const environment = { PATH: process.env.PATH, HOME: process.env.HOME, CI: "1", GIT_SSH_COMMAND: "/usr/bin/false" };
  const command = (program, arguments_, cwd = source) => {
    const result = spawnSync(program, arguments_, { cwd, env: environment, encoding: "utf8" });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout.trim();
  };
  const write = (name, content) => {
    const filename = join(source, name);
    mkdirSync(dirname(filename), { recursive: true });
    writeFileSync(filename, content);
  };
  const program = (name, content) => {
    const filename = join(programs, name);
    // Use the existing harness pattern to retain an executable's opaque attributes.
    copyFileSync(process.execPath, filename);
    writeFileSync(filename, `#!${process.execPath}\n${content}\n`);
  };
  try {
    mkdirSync(source);
    mkdirSync(programs);
    const mobileRoot = join(REPOSITORY_ROOT, "mobile");
    const identity = JSON.parse(readFileSync(join(mobileRoot, "ios-release-identity.json"), "utf8"));
    for (const filename of ["app.json", "ios-release-identity.json", "package.json", "package-lock.json",
      "scripts/build-ios.mjs", "scripts/release-build-number.mjs", "scripts/verify-ios-preparation.mjs",
      "ios/Podfile", "ios/Podfile.lock", identity.entryFile, `${identity.workspace}/contents.xcworkspacedata`]) {
      write(`mobile/${filename}`, readFileSync(join(mobileRoot, filename)));
    }
    write("mobile/scripts/invalid-intent-build.mjs", `import { writeFileSync } from "node:fs";
      writeFileSync(${JSON.stringify(boundaryLog)}, "release-owned adapter reached\\n");
      process.env.MPRLAB_MOBILE_BUILD_INTENT = "invalid-relative-intent";
      await import("./build-ios.mjs");\n`);
    const signingInputs = [...Object.values(identity.signing), ...Object.values(identity.provisioning)];
    Object.assign(environment, Object.fromEntries(signingInputs.map((name, index) => [name, `synthetic-decoder-input-${index}`])));
    write(".mprlab/deploy/resources.yml", JSON.stringify({ mprlab_resources: {
      owner: "anonymous", release: { scheme: "semver" },
      lifecycle: { ci: { enabled: false }, defaults: { timeouts: {
        startup: "30s", completion: "1m", readiness: "30s", request: "30s", shutdown: "30s"
      } }, operations: [{ name: "app_lifecycle.repository_read", polling: {
        initial: "1ms", maximum: "2ms", increment: "0s", multiplier: 2, attempt_limit: 3
      } }] },
      environment: { private_inputs: signingInputs.map(name => ({ id: name.toLowerCase().replaceAll("_", "-"), variable: name })) },
      artifacts: { mobile: [{ id: "mobile", source: "mobile", build_system: "local",
        build: { ios: "mobile/scripts/invalid-intent-build.mjs" },
        ios: { bundle_identifier: identity.bundleIdentifier, export_intent: identity.exportIntent }
      }] }, publications: {}, targets: {}
    } }));
    command("git", ["init", "--bare", "--initial-branch=fixture-default", origin], fixture);
    command("git", ["init", "--initial-branch=fixture-default"]);
    command("git", ["config", "user.name", "Anonymous fixture"]);
    command("git", ["config", "user.email", "fixture@example.invalid"]);
    command("git", ["config", "commit.gpgSign", "false"]);
    command("git", ["add", "."]);
    command("git", ["commit", "-m", "Declare anonymous mobile release"]);
    command("git", ["remote", "add", "origin", origin]);
    command("git", ["push", "-u", "origin", "fixture-default"]);
    const repository = "example/anonymous";
    const canonical = `git@github.com:${repository}.git`;
    command("git", ["remote", "set-url", "origin", canonical]);
    command("git", ["config", `url.file://${origin}.insteadOf`, canonical]);
    command("git", ["remote", "set-head", "origin", "--auto"]);
    writeFileSync(providerLog, "");
    program("gh", `const fs = require("node:fs"); const args = process.argv.slice(2);
      fs.appendFileSync(${JSON.stringify(providerLog)}, JSON.stringify(args) + "\\n");
      if (JSON.stringify(args) !== JSON.stringify(["api", "--method", "GET", "repos/${repository}", "--jq", ".full_name"])) {
        throw new Error("unexpected provider operation: " + args.join(" "));
      }
      process.stdout.write("${repository}\\n");`);
    for (const name of ["xcodebuild", "codesign", "security", "pod"]) {
      program(name, `require("node:fs").appendFileSync(${JSON.stringify(nativeLog)}, ${JSON.stringify(name + "\n")});
        throw new Error("native signing or build must not run");`);
    }
    const result = spawnSync(gatewayExecutable, ["app-release", "--app-root", source,
      "--operator-root", join(fixture, "operator")], {
      cwd: source, env: { ...environment, PATH: `${programs}:${environment.PATH}` },
      input: "", encoding: "utf8", timeout: 90_000
    });
    assert.ifError(result.error);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /requires an absolute MPRLAB_MOBILE_BUILD_INTENT/);
    assert.equal(readFileSync(boundaryLog, "utf8").trim(), "release-owned adapter reached");
    assert.equal(existsSync(nativeLog), false, "invalid intent must precede signing and native tools");
    assert.equal(readdirSync(source, { recursive: true }).some(name => /\.(ipa|aab|xcarchive)$/.test(String(name))), false, "invalid intent must not create native artifacts");
    const currentPath = command("git", ["rev-parse", "--git-path", "mprlab-lifecycle/current-release.json"]);
    assert.equal(existsSync(resolve(source, currentPath)), false, "invalid intent must not commit a release receipt");
    assert.doesNotMatch(result.stdout, /MPRLAB_APP_RELEASE_TRANSACTION/);
    assert.doesNotMatch(readFileSync(providerLog, "utf8"), /"(create|upload)"/, "release failure must not publish artifacts");
    assert.equal(command("git", ["status", "--porcelain"]), "", "release failure must preserve synchronized source");
  } finally {
    rmSync(fixture, { recursive: true, force: true });
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
