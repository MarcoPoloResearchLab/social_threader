#!/usr/bin/env node
// @ts-check
import path from "node:path";
import { verifyAndroidPreparation } from "./lib/android-preparation.mjs";
try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--mobile-dir")) throw new Error("Android preparation verifier accepts only --mobile-dir PATH");
  verifyAndroidPreparation(path.resolve(args[1] || path.join(import.meta.dirname, "..")));
  process.stdout.write("Android preparation satisfies the native configuration contract.\n");
} catch (error) {
  process.stderr.write(`Android preparation verification failed: ${error instanceof Error ? error.message : "invalid input"}\n`);
  process.exit(2);
}
