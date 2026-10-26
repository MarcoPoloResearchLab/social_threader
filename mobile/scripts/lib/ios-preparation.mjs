// @ts-check
import fs from "node:fs";
import path from "node:path";

const RECORD_FILE = "ios/preparation.json";
const RECORD_SCHEMA = "social-threader.ios-preparation.v2";
const NATIVE_WORKSPACE = "ios/SocialThreader.xcworkspace";
const NATIVE_SCHEME = "SocialThreader";
const REQUIRED_NATIVE_FILES = Object.freeze([
  "ios/Podfile", "ios/Podfile.lock", "ios/Podfile.properties.json",
  `${NATIVE_WORKSPACE}/contents.xcworkspacedata`,
  "ios/SocialThreader.xcodeproj/project.pbxproj",
  "ios/SocialThreader.xcodeproj/xcshareddata/xcschemes/SocialThreader.xcscheme",
  "ios/SocialThreader/Info.plist"
]);

/** Record semantic native configuration after the preparation commands succeed.
 * @param {string} mobileRoot @param {{xcode:string, cocoapods:string}} toolchain
 */
export function recordIosPreparation(mobileRoot, toolchain) {
  const facts = nativeConfiguration(mobileRoot);
  validateToolchain(mobileRoot, toolchain);
  const record = { schema: RECORD_SCHEMA, status: "prepared", ...facts, toolchain };
  fs.writeFileSync(path.join(mobileRoot, RECORD_FILE), `${JSON.stringify(record, null, 2)}\n`);
}

/** Verify required native inputs and their selected application configuration.
 * Asset and plugin freshness remains outside this configuration check.
 * @param {string} mobileRoot
 */
export function verifyIosPreparation(mobileRoot) {
  const record = readJson(mobileRoot, RECORD_FILE);
  if (record.schema !== RECORD_SCHEMA || record.status !== "prepared" ||
      Object.keys(record).sort().join(",") !== "application,configuration,dependencies,schema,status,toolchain") {
    throw new Error("unsupported iOS preparation record");
  }
  const facts = nativeConfiguration(mobileRoot);
  for (const section of ["application", "configuration", "dependencies"]) {
    for (const [name, value] of Object.entries(facts[section])) {
      if (record[section]?.[name] !== value) {
        throw new Error(`iOS preparation ${section} ${name} differs; run make prepare-ios`);
      }
    }
  }
  validateToolchain(mobileRoot, record.toolchain);
}

/** @param {string} mobileRoot */
function nativeConfiguration(mobileRoot) {
  for (const filename of REQUIRED_NATIVE_FILES) {
    if (!fs.existsSync(path.join(mobileRoot, filename)) || !fs.statSync(path.join(mobileRoot, filename)).isFile()) {
      throw new Error(`missing prepared iOS file: ${filename}`);
    }
  }
  const app = readJson(mobileRoot, "app.json").expo;
  const identity = readJson(mobileRoot, "ios-release-identity.json");
  if (identity.workspace !== NATIVE_WORKSPACE || identity.scheme !== NATIVE_SCHEME) {
    throw new Error("prepared iOS workspace or scheme differs from the selected native target");
  }
  if (typeof app.version !== "string" || !/^\d+\.\d+\.\d+$/.test(app.version)) {
    throw new Error("iOS preparation requires an application version");
  }
  const project = fs.readFileSync(path.join(mobileRoot, "ios/SocialThreader.xcodeproj/project.pbxproj"), "utf8");
  const bundleIdentifiers = [...project.matchAll(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+);/g)]
    .map(match => match[1].trim().replace(/^"|"$/g, ""));
  if (!identity.bundleIdentifier || app.ios.bundleIdentifier !== identity.bundleIdentifier ||
      !bundleIdentifiers.length || bundleIdentifiers.some(value => value !== identity.bundleIdentifier)) {
    throw new Error("prepared iOS bundle identifier differs from the selected Apple application");
  }
  const info = fs.readFileSync(path.join(mobileRoot, "ios/SocialThreader/Info.plist"), "utf8");
  for (const [name, setting] of [["CFBundleIdentifier", "PRODUCT_BUNDLE_IDENTIFIER"],
    ["CFBundleShortVersionString", "MARKETING_VERSION"], ["CFBundleVersion", "CURRENT_PROJECT_VERSION"]]) {
    const value = info.match(new RegExp(`<key>${name}</key>\\s*<string>([^<]+)</string>`))?.[1];
    if (value !== `$(${setting})`) {
      throw new Error(`prepared iOS configuration requires the ${name} build setting`);
    }
  }
  const properties = readJson(mobileRoot, "ios/Podfile.properties.json");
  const javascriptEngine = properties["expo.jsEngine"] || "hermes";
  if (javascriptEngine !== (app.jsEngine || "hermes")) {
    throw new Error("prepared iOS JavaScript engine differs from the application configuration");
  }
  return {
    application: { bundleIdentifier: identity.bundleIdentifier, version: app.version,
      workspace: identity.workspace, scheme: identity.scheme },
    configuration: { deploymentTarget: properties["ios.deploymentTarget"] || "16.4",
      javascriptEngine },
    dependencies: dependencyVersions(mobileRoot)
  };
}

/** @param {string} mobileRoot @param {{xcode:string,cocoapods:string}} toolchain */
function validateToolchain(mobileRoot, toolchain) {
  if (!toolchain || typeof toolchain.xcode !== "string" || !toolchain.xcode.startsWith("Xcode 27.1\n") ||
      typeof toolchain.cocoapods !== "string" || !/^\d+\.\d+\.\d+$/.test(toolchain.cocoapods)) {
    throw new Error("iOS preparation requires Xcode 27.1 and a CocoaPods version");
  }
  const lock = fs.readFileSync(path.join(mobileRoot, "ios/Podfile.lock"), "utf8");
  if (lock.match(/^COCOAPODS:\s*(\S+)/m)?.[1] !== toolchain.cocoapods) {
    throw new Error("iOS preparation CocoaPods version differs from the native dependency record");
  }
}

/** @param {string} mobileRoot */
function dependencyVersions(mobileRoot) {
  const packageJson = readJson(mobileRoot, "package.json");
  const lock = readJson(mobileRoot, "package-lock.json");
  return Object.fromEntries(["expo", "react", "react-native"].map(name => {
    const version = lock.packages?.[`node_modules/${name}`]?.version;
    if (typeof version !== "string" || packageJson.dependencies?.[name] !== version) {
      throw new Error(`iOS preparation dependency version differs: ${name}`);
    }
    return [name, version];
  }));
}

/** @param {string} mobileRoot @param {string} filename */
function readJson(mobileRoot, filename) {
  return JSON.parse(fs.readFileSync(path.join(mobileRoot, filename), "utf8"));
}
