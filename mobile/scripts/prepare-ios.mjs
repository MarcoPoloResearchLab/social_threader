#!/usr/bin/env node
// @ts-check
import path from "node:path";
import { spawnSync } from "node:child_process";
import { recordIosPreparation, verifyIosPreparation } from "./lib/ios-preparation.mjs";

const MOBILE_ROOT = path.resolve(import.meta.dirname, "..");
const environment = { ...process.env, CI: "1", EXPO_NO_TELEMETRY: "1" };
delete environment.NODE_ENV;
delete environment.FORCE_COLOR;

try {
  const xcode = run("xcodebuild", ["-version"], MOBILE_ROOT, true).trim();
  const cocoapods = run("pod", ["--version"], MOBILE_ROOT, true).trim();
  if (!xcode.startsWith("Xcode 27.1\n")) throw new Error("iOS preparation requires Xcode 27.1");
  run("npm", ["exec", "--no", "--", "expo", "prebuild", "--platform", "ios", "--no-install", "--clean"], MOBILE_ROOT);
  run("pod", ["install"], path.join(MOBILE_ROOT, "ios"));
  recordIosPreparation(MOBILE_ROOT, { xcode, cocoapods });
  verifyIosPreparation(MOBILE_ROOT);
  process.stdout.write("iOS native preparation completed.\n");
} catch (error) {
  process.stderr.write(`iOS preparation failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}

/** @param {string} command @param {string[]} argumentsList @param {string} workingDirectory @param {boolean} capture */
function run(command, argumentsList, workingDirectory, capture = false) {
  const result = spawnSync(command, argumentsList, {
    cwd: workingDirectory, env: environment, encoding: "utf8",
    stdio: ["ignore", capture ? "pipe" : "inherit", "inherit"]
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit status ${result.status}`);
  return result.stdout || "";
}
