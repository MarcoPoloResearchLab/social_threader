// @ts-check
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const RECEIPT = "android/preparation.json";
const SCHEMA = "social-threader.android-preparation.v1";
const INPUT_FILES = Object.freeze([
  "app.json", "app.config.js", "package.json", "package-lock.json", "babel.config.js",
  "metro.config.js", "index.js", "android-release-identity.json"
]);
const REQUIRED_OUTPUTS = Object.freeze([
  "android/gradlew", "android/gradlew.bat", "android/gradle/wrapper/gradle-wrapper.jar",
  "android/gradle/wrapper/gradle-wrapper.properties", "android/settings.gradle",
  "android/build.gradle", "android/gradle.properties", "android/app/build.gradle",
  "android/app/src/main/AndroidManifest.xml"
]);
const EXCLUDED = new Set([".gradle", ".kotlin", ".cxx", "build", "local.properties", "debug.keystore", "preparation.json", ".DS_Store"]);

/** @param {string} mobileRoot @param {string} directory @returns {string[]} */
function treeFiles(mobileRoot, directory) {
  const filenames = [];
  for (const entry of fs.readdirSync(path.join(mobileRoot, directory), { withFileTypes: true })) {
    if (EXCLUDED.has(entry.name)) continue;
    const filename = `${directory}/${entry.name}`;
    if (entry.isDirectory()) filenames.push(...treeFiles(mobileRoot, filename));
    else if (entry.isFile()) filenames.push(filename);
    else throw new Error(`Android preparation rejects a non-file entry: ${filename}`);
  }
  return filenames.sort();
}

/** @param {string} mobileRoot @param {readonly string[]} filenames */
function hashes(mobileRoot, filenames) {
  return Object.fromEntries([...filenames].sort().map(filename => [filename,
    crypto.createHash("sha256").update(fs.readFileSync(path.join(mobileRoot, filename))).digest("hex")
  ]));
}

/** @param {string} mobileRoot */
function sourceInputs(mobileRoot) {
  const canonicalRoot = fs.realpathSync(mobileRoot);
  const app = JSON.parse(fs.readFileSync(path.join(canonicalRoot, "app.json"), "utf8")).expo;
  const resolvePlugin = createRequire(path.join(canonicalRoot, "app.json"));
  const localPlugins = (app.plugins || []).map(plugin => Array.isArray(plugin) ? plugin[0] : plugin)
    .filter(plugin => typeof plugin === "string" && plugin.startsWith("."))
    .map(plugin => {
      const filename = path.relative(canonicalRoot, resolvePlugin.resolve(plugin));
      if (filename.startsWith("..") || path.isAbsolute(filename)) throw new Error("Android preparation local plugins must stay within the mobile root");
      return filename;
    });
  return hashes(mobileRoot, [...INPUT_FILES, ...localPlugins, ...treeFiles(mobileRoot, "assets"), ...treeFiles(mobileRoot, "scripts")]);
}

/** @param {string} mobileRoot */
function nativeOutputs(mobileRoot) {
  for (const filename of REQUIRED_OUTPUTS) {
    if (!fs.existsSync(path.join(mobileRoot, filename))) throw new Error(`Android preparation lacks ${filename}`);
  }
  return hashes(mobileRoot, treeFiles(mobileRoot, "android"));
}

/** Record the generated source after the preparation command completes.
 * @param {string} mobileRoot
 */
export function recordAndroidPreparation(mobileRoot) {
  const record = { schema: SCHEMA, inputs: sourceInputs(mobileRoot), outputs: nativeOutputs(mobileRoot) };
  fs.writeFileSync(path.join(mobileRoot, RECEIPT), `${JSON.stringify(record, null, 2)}\n`);
}

/** Reject stale native source before build effects.
 * @param {string} mobileRoot
 */
export function verifyAndroidPreparation(mobileRoot) {
  let record;
  try { record = JSON.parse(fs.readFileSync(path.join(mobileRoot, RECEIPT), "utf8")); }
  catch { throw new Error("Android preparation receipt is missing or invalid; run make prepare-android"); }
  if (!record || record.schema !== SCHEMA || Object.keys(record).sort().join(",") !== "inputs,outputs,schema") throw new Error("Android preparation receipt has an unsupported shape");
  for (const [label, expected, actual] of [
    ["input", record.inputs, sourceInputs(mobileRoot)], ["native output", record.outputs, nativeOutputs(mobileRoot)]
  ]) {
    if (!expected || typeof expected !== "object" || Array.isArray(expected) || Object.keys(expected).length === 0 ||
      Object.entries(expected).some(([filename,digest]) => !filename || typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)) ||
      JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error(`Android preparation ${label} differs; run make prepare-android`);
  }
}

/** Copy only the exact governed native files from a verified receipt.
 * @param {string} source @param {string} destination
 */
export function copyPreparedAndroid(source, destination) {
  verifyAndroidPreparation(source);
  const record = JSON.parse(fs.readFileSync(path.join(source, RECEIPT), "utf8"));
  for (const filename of [...Object.keys(record.outputs), RECEIPT]) {
    const target = path.join(destination, filename);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(source, filename), target);
  }
}
