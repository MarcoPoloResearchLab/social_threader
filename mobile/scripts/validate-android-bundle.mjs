#!/usr/bin/env node
// @ts-check
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { verifyAndroidPreparation } from "./lib/android-preparation.mjs";
const mobileRoot = path.resolve(import.meta.dirname, "..");
let outputDirectory;
try {
  verifyAndroidPreparation(mobileRoot);
  const require = createRequire(import.meta.url);
  const cli = require.resolve("@react-native-community/cli/build/bin.js");
  outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "social-android-rn-bundle-"));
  const bundle = path.join(outputDirectory, "index.android.bundle");
  const environment = { ...process.env, CI: "1", EXPO_NO_TELEMETRY: "1" };
  delete environment.FORCE_COLOR;
  const result = spawnSync(process.execPath, [cli, "bundle", "--platform", "android", "--dev", "false",
    "--entry-file", "index.js", "--bundle-output", bundle, "--assets-dest", outputDirectory,
    "--config", path.join(mobileRoot, "metro.config.js")], {
    cwd: mobileRoot, env: environment, stdio: ["ignore", "inherit", "inherit"]
  });
  if (result.error || result.status !== 0) throw new Error("React Native Android bundle qualification failed");
  if (!fs.existsSync(bundle) || fs.readFileSync(bundle).length === 0) throw new Error("React Native Android bundle is absent or empty");
  process.stdout.write("React Native Android bundle qualification passed.\n");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Android bundle qualification failed"}\n`);
  process.exitCode = 2;
} finally {
  if (outputDirectory) fs.rmSync(outputDirectory, { recursive: true, force: true });
}
