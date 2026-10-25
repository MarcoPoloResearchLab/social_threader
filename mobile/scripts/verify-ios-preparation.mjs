#!/usr/bin/env node
// @ts-check
import path from "node:path";
import { verifyIosPreparation } from "./lib/ios-preparation.mjs";

try {
  verifyIosPreparation(path.resolve(import.meta.dirname, ".."));
  process.stdout.write("iOS preparation matches the selected source inputs.\n");
} catch (error) {
  process.stderr.write(`iOS preparation verification failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}
