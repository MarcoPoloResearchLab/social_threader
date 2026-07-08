#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPOSITORY_ROOT = path.resolve(MOBILE_ROOT, "..");
const SHARED_DESTINATION_ROOT = path.join(MOBILE_ROOT, "src", "shared-web");
const SHARED_FILES = Object.freeze([
  "constants.js",
  "core/chunking.js",
  "core/richText.js",
  "types.d.js",
  "utils/templates.js"
]);

for (const sharedFile of SHARED_FILES) {
  const sourcePath = path.join(REPOSITORY_ROOT, "js", sharedFile);
  const destinationPath = path.join(SHARED_DESTINATION_ROOT, sharedFile);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}
