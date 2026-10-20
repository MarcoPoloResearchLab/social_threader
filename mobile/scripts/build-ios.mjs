#!/usr/bin/env node
// @ts-check
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { releaseBuildNumber } from "./release-build-number.mjs";

const DEFAULT_MOBILE_ROOT = path.resolve(import.meta.dirname, "..");
const IDENTITY_SCHEMA = "social-threader.mobile-ios-release-identity.v1";
const VERIFY_SCRIPT = "scripts/verify-ios-preparation.mjs";

try {
  const executable = process.env.MPRLAB_GATEWAY_EXECUTABLE || "";
  if (!path.isAbsolute(executable)) {
    throw new Error("MPRLAB_GATEWAY_EXECUTABLE must identify the authoritative Gateway executable");
  }
  const options = parseArguments(process.argv.slice(2));
  const mobileRoot = path.resolve(options.get("mobile-dir") || DEFAULT_MOBILE_ROOT);
  const appConfig = readJson(path.join(mobileRoot, "app.json")).expo;
  const identity = readJson(path.join(mobileRoot, "ios-release-identity.json"));
  if (identity.schema !== IDENTITY_SCHEMA) throw new Error("unsupported iOS release identity schema");
  if (appConfig.ios?.bundleIdentifier !== identity.bundleIdentifier) throw new Error("iOS bundle identifier mismatch between app.json and release identity");
  if (!/^\d+\.\d+\.\d+$/.test(appConfig.version)) throw new Error("iOS application version must have three numeric components");
  const releaseTimestamp = requireOption(options, "release-timestamp");
  const output = path.resolve(requireOption(options, "output"));
  const manifest = path.resolve(requireOption(options, "manifest"));
  if (!output.endsWith(".ipa") || !manifest.endsWith(".json")) throw new Error("iOS output must be an IPA with a JSON manifest");
  if (manifest !== output.replace(/\.ipa$/, ".json")) throw new Error("iOS manifest must be beside the IPA with the same basename");
  if (!process.env.MPRLAB_ARTIFACT_VERSION || !process.env.MPRLAB_MOBILE_BUILD_INTENT) {
    throw new Error("MPRLAB_ARTIFACT_VERSION and MPRLAB_MOBILE_BUILD_INTENT are required lifecycle inputs");
  }
  const request = {
    schema_version: 3,
    source_root: mobileRoot,
    platform: "ios",
    output,
    application_identifier: identity.bundleIdentifier,
    version: appConfig.version,
    build_number: String(releaseBuildNumber(releaseTimestamp)),
    release_timestamp: releaseTimestamp,
    verify_script: VERIFY_SCRIPT,
    ios: {
      owner: identity.owner,
      workspace: identity.workspace,
      scheme: identity.scheme,
      app_name: identity.appName,
      entry_file: identity.entryFile,
      ...identity.signing,
      export_intent: identity.exportIntent,
      environment: { EXPO_NO_TELEMETRY: "1" },
      provisioning: identity.provisioning
    }
  };
  const result = spawnSync(executable, ["mobile-build-operation"], {
    cwd: mobileRoot,
    env: { ...process.env, CI: "1" },
    input: JSON.stringify(request),
    stdio: ["pipe", "inherit", "inherit"]
  });
  if (result.error) throw new Error(`invoke iOS native builder: ${result.error.message}`);
  process.exit(result.status ?? 1);
} catch (error) {
  process.stderr.write(`iOS build failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}

/** @param {string[]} argumentsList @returns {Map<string, string>} */
function parseArguments(argumentsList) {
  const allowed = new Set(["mobile-dir", "output", "manifest", "release-timestamp"]);
  const options = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const optionName = argumentsList[index].replace(/^--/, "");
    const optionValue = argumentsList[index + 1];
    if (!argumentsList[index].startsWith("--") || !allowed.has(optionName) || !optionValue || optionValue.startsWith("--") || options.has(optionName)) {
      throw new Error(`invalid iOS build argument: ${argumentsList[index]}`);
    }
    options.set(optionName, optionValue);
  }
  return options;
}

/** @param {Map<string, string>} options @param {string} name @returns {string} */
function requireOption(options, name) {
  const value = options.get(name);
  if (!value) throw new Error(`missing --${name}`);
  return value;
}

/** @param {string} filename @returns {any} */
function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}
