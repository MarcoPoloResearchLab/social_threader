#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(SCRIPT_DIR, "..");
const BUNDLE_PLATFORMS = Object.freeze(["ios", "android"]);
const childEnvironment = {
  ...process.env,
  CI: "1",
  EXPO_NO_TELEMETRY: "1"
};
delete childEnvironment.FORCE_COLOR;
delete childEnvironment.NO_COLOR;

for (const platform of BUNDLE_PLATFORMS) {
  validatePlatformBundle(platform);
}

function validatePlatformBundle(platform) {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `social-threader-mobile-${platform}-export-`));

  try {
    const result = spawnSync(
      "npx",
      [
        "--no-install",
        "expo",
        "export",
        "--platform",
        platform,
        "--output-dir",
        outputDirectory,
        "--clear"
      ],
      {
        cwd: MOBILE_ROOT,
        env: childEnvironment,
        stdio: "inherit"
      }
    );
    if (result.status !== 0) {
      process.exit(result.status || 1);
    }
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
}
