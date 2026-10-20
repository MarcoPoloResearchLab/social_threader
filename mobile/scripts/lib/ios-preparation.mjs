// @ts-check
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const RECORD_FILE = "ios/preparation.json";
const INPUT_FILES = Object.freeze([
  "app.json", "app.config.js", "package.json", "package-lock.json", "babel.config.js",
  "metro.config.js", "index.js", "ios-release-identity.json", "assets/icon.png", "assets/favicon.png",
  "scripts/prepare-ios.mjs", "scripts/verify-ios-preparation.mjs", "scripts/lib/ios-preparation.mjs",
  "plugins/with-ios-release.js"
]);
const REQUIRED_NATIVE_FILES = Object.freeze([
  "ios/Podfile", "ios/Podfile.lock", "ios/Podfile.properties.json",
  "ios/SocialThreader.xcworkspace/contents.xcworkspacedata",
  "ios/SocialThreader.xcodeproj/project.pbxproj",
  "ios/SocialThreader.xcodeproj/xcshareddata/xcschemes/SocialThreader.xcscheme",
  "ios/SocialThreader/Info.plist"
]);
const RECORD_SCHEMA = "social-threader.ios-preparation.v1";

/** Record config and native output hashes after the preparation command succeeds.
 * @param {string} mobileRoot @param {{xcode:string, cocoapods:string}} toolchain
 */
export function recordIosPreparation(mobileRoot, toolchain) {
  for (const filename of REQUIRED_NATIVE_FILES) requireFile(mobileRoot, filename);
  const record = {
    schema: RECORD_SCHEMA,
    toolchain,
    inputs: fileHashes(mobileRoot, INPUT_FILES),
    outputs: fileHashes(mobileRoot, nativeFiles(mobileRoot))
  };
  fs.writeFileSync(path.join(mobileRoot, RECORD_FILE), `${JSON.stringify(record, null, 2)}\n`);
}

/** Reject stale prepared native inputs before a native build.
 * @param {string} mobileRoot
 */
export function verifyIosPreparation(mobileRoot) {
  const record = JSON.parse(fs.readFileSync(path.join(mobileRoot, RECORD_FILE), "utf8"));
  if (record.schema !== RECORD_SCHEMA) throw new Error("unsupported iOS preparation record");
  for (const filename of REQUIRED_NATIVE_FILES) requireFile(mobileRoot, filename);
  const inputs = fileHashes(mobileRoot, INPUT_FILES);
  const outputs = fileHashes(mobileRoot, nativeFiles(mobileRoot));
  for (const [label, actual, expected] of [["input", inputs, record.inputs], ["native output", outputs, record.outputs]]) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`stale iOS preparation ${label}; run npm run prepare:ios before release`);
    }
  }
  const app = JSON.parse(fs.readFileSync(path.join(mobileRoot, "app.json"), "utf8")).expo;
  const identity = JSON.parse(fs.readFileSync(path.join(mobileRoot, "ios-release-identity.json"), "utf8"));
  const project = fs.readFileSync(path.join(mobileRoot, "ios/SocialThreader.xcodeproj/project.pbxproj"), "utf8");
  if (app.ios.bundleIdentifier !== identity.bundleIdentifier || !project.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${identity.bundleIdentifier};`)) {
    throw new Error("prepared iOS bundle identifier differs from the selected Apple application");
  }
}

/** @param {string} mobileRoot @param {readonly string[]} filenames */
function fileHashes(mobileRoot, filenames) {
  return Object.fromEntries([...filenames].sort().map((filename) => [filename,
    crypto.createHash("sha256").update(fs.readFileSync(path.join(mobileRoot, filename))).digest("hex")
  ]));
}

/** @param {string} mobileRoot */
function nativeFiles(mobileRoot) {
  const filenames = [];
  const ignoredNames = new Set(["Pods", "build", "xcuserdata", "project.xcworkspace", ".xcode.env.local", ".DS_Store", "preparation.json"]);
  /** @param {string} directory */
  function visit(directory) {
    for (const entry of fs.readdirSync(path.join(mobileRoot, directory), { withFileTypes: true })) {
      if (ignoredNames.has(entry.name)) continue;
      const filename = `${directory}/${entry.name}`;
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile()) filenames.push(filename);
    }
  }
  visit("ios");
  return filenames.sort();
}

/** @param {string} mobileRoot @param {string} filename */
function requireFile(mobileRoot, filename) {
  if (!fs.existsSync(path.join(mobileRoot, filename))) throw new Error(`missing prepared iOS file: ${filename}`);
}
