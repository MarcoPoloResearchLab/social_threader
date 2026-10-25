#!/usr/bin/env node
// @ts-check
import path from "node:path";
import { spawnSync } from "node:child_process";
import { prepareAndroidNative } from "./lib/android-native.mjs";
import { recordAndroidPreparation, verifyAndroidPreparation } from "./lib/android-preparation.mjs";
const MOBILE_ROOT = path.resolve(import.meta.dirname, "..");
const environment = { ...process.env, CI: "1", EXPO_NO_TELEMETRY: "1" };
delete environment.NODE_ENV;
delete environment.FORCE_COLOR;
try {
  run("npm", ["ci", "--include=dev"]);
  run("npm", ["run", "sync-shared"]);
  run("npm", ["exec", "--no", "--", "expo", "prebuild", "--platform", "android", "--no-install", "--clean"]);
  prepareAndroidNative(MOBILE_ROOT);
  recordAndroidPreparation(MOBILE_ROOT);
  verifyAndroidPreparation(MOBILE_ROOT);
  process.stdout.write("Android native preparation completed.\n");
} catch (error) {
  process.stderr.write(`Android preparation failed: ${error instanceof Error ? error.message : "invalid input"}\n`);
  process.exit(2);
}
/** @param {string} command @param {string[]} argumentsList */
function run(command, argumentsList) {
  const result = spawnSync(command, argumentsList, { cwd: MOBILE_ROOT, env: environment, stdio: ["ignore", "inherit", "inherit"] });
  if (result.error || result.status !== 0) throw new Error(`Android preparation command ${command} failed`);
}
