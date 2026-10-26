// @ts-check
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const RECEIPT = "android/preparation.json";
const SCHEMA = "social-threader.android-preparation.v2";
const REQUIRED_NATIVE_FILES = Object.freeze([
  "android/gradlew", "android/gradlew.bat", "android/gradle/wrapper/gradle-wrapper.jar",
  "android/gradle/wrapper/gradle-wrapper.properties", "android/settings.gradle",
  "android/build.gradle", "android/gradle.properties", "android/app/build.gradle",
  "android/app/src/main/AndroidManifest.xml"
]);
const EXCLUDED = new Set([".gradle", ".kotlin", ".cxx", "build", "local.properties", "debug.keystore", "preparation.json", ".DS_Store"]);

/** Select current public native files for copying, without a receipt inventory.
 * @param {string} mobileRoot @param {string} directory @returns {string[]}
 */
function treeFiles(mobileRoot, directory) {
  const filenames = [];
  for (const entry of fs.readdirSync(path.join(mobileRoot, directory), { withFileTypes: true })) {
    if (EXCLUDED.has(entry.name) || entry.name === ".env" || entry.name.startsWith(".env.") ||
        /\.(?:jks|keystore|p12|p8|mobileprovision)$/.test(entry.name) || entry.name.endsWith("keystore.properties")) continue;
    const filename = `${directory}/${entry.name}`;
    if (entry.isDirectory()) filenames.push(...treeFiles(mobileRoot, filename));
    else if (entry.isFile()) filenames.push(filename);
    else throw new Error(`Android preparation rejects a non-file entry: ${filename}`);
  }
  return filenames.sort();
}

/** Record semantic native configuration after the preparation commands succeed.
 * @param {string} mobileRoot
 */
export function recordAndroidPreparation(mobileRoot) {
  const record = { schema: SCHEMA, status: "prepared", ...nativeConfiguration(mobileRoot) };
  fs.writeFileSync(path.join(mobileRoot, RECEIPT), `${JSON.stringify(record, null, 2)}\n`);
}

/** Verify required native inputs and selected application configuration.
 * Asset and plugin freshness remains outside this configuration check.
 * @param {string} mobileRoot
 */
export function verifyAndroidPreparation(mobileRoot) {
  let record;
  try { record = readJson(mobileRoot, RECEIPT); }
  catch { throw new Error("Android preparation receipt is missing or invalid; run make prepare-android"); }
  if (!record || record.schema !== SCHEMA || record.status !== "prepared" ||
      Object.keys(record).sort().join(",") !== "application,configuration,dependencies,schema,status,toolchain") {
    throw new Error("Android preparation receipt has an unsupported shape");
  }
  const facts = nativeConfiguration(mobileRoot);
  for (const section of ["application", "configuration", "dependencies", "toolchain"]) {
    for (const [name, value] of Object.entries(facts[section])) {
      if (record[section]?.[name] !== value) {
        throw new Error(`Android preparation ${section} ${name} differs; run make prepare-android`);
      }
    }
  }
}

/** Copy the current public native files after semantic configuration validation.
 * @param {string} source @param {string} destination
 */
export function copyPreparedAndroid(source, destination) {
  verifyAndroidPreparation(source);
  for (const filename of [...treeFiles(source, "android"), RECEIPT]) {
    const target = path.join(destination, filename);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(source, filename), target);
  }
}

/** @param {string} mobileRoot */
function nativeConfiguration(mobileRoot) {
  for (const filename of REQUIRED_NATIVE_FILES) {
    if (!fs.existsSync(path.join(mobileRoot, filename)) || !fs.statSync(path.join(mobileRoot, filename)).isFile()) {
      throw new Error(`Android preparation lacks ${filename}`);
    }
  }
  const app = readJson(mobileRoot, "app.json").expo;
  const identity = readJson(mobileRoot, "android-release-identity.json");
  if (typeof app.version !== "string" || !/^\d+\.\d+\.\d+$/.test(app.version)) {
    throw new Error("Android preparation requires an application version");
  }
  const gradle = fs.readFileSync(path.join(mobileRoot, "android/app/build.gradle"), "utf8");
  const namespace = gradle.match(/\bnamespace\s+["']([^"']+)["']/)?.[1];
  const applicationId = gradle.match(/\bapplicationId\s+["']([^"']+)["']/)?.[1];
  if (!identity.packageName || app.android.package !== identity.packageName || namespace !== identity.packageName || applicationId !== identity.packageName) {
    throw new Error("Android preparation application identifier or native namespace differs from the selected application");
  }
  /** @type {readonly (readonly [string, RegExp])[]} */
  const versionBindings = [
    ["versionName", /^System\.getenv\(\s*["']SOCIAL_THREADER_ANDROID_ARTIFACT_VERSION_NAME["']\s*\)\s*\?:\s*["']["']$/],
    ["versionCode", /^Integer\.parseInt\(\s*System\.getenv\(\s*["']SOCIAL_THREADER_ANDROID_ARTIFACT_VERSION_CODE["']\s*\)\s*\?:\s*["']0["']\s*\)$/]
  ];
  for (const [name, expression] of versionBindings) {
    const assignments = [...gradle.matchAll(new RegExp(`^\\s*${name}\\s+(.+)$`, "gm"))];
    if (assignments.length !== 1 || !expression.test(assignments[0][1].trim())) {
      throw new Error(`Android preparation requires the ${name} lifecycle assignment`);
    }
  }
  const canonicalRoot = fs.realpathSync(mobileRoot);
  const resolvePlugin = createRequire(path.join(canonicalRoot, "app.json"));
  for (const plugin of app.plugins || []) {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    if (typeof name !== "string" || !name.startsWith(".")) continue;
    const filename = path.relative(canonicalRoot, resolvePlugin.resolve(name));
    if (filename.startsWith("..") || path.isAbsolute(filename)) throw new Error("Android preparation local plugins must stay within the mobile root");
  }
  const properties = readProperties(path.join(mobileRoot, "android/gradle.properties"));
  if ((properties.hermesEnabled === "true") !== ((app.jsEngine || "hermes") === "hermes") ||
      (properties.newArchEnabled === "true") !== (app.newArchEnabled !== false)) {
    throw new Error("Android preparation engine or architecture differs from the application configuration");
  }
  const wrapper = readProperties(path.join(mobileRoot, "android/gradle/wrapper/gradle-wrapper.properties"));
  const gradleVersion = wrapper.distributionUrl?.match(/gradle-([\d.]+)-(?:bin|all)\.zip$/)?.[1];
  if (!gradleVersion) throw new Error("Android preparation requires a declared Gradle wrapper version");
  if (properties["android.enableMinifyInReleaseBuilds"] !== "true") throw new Error("Android preparation requires release minification");
  return {
    application: { packageName: identity.packageName, version: app.version },
    configuration: { namespace, applicationId, hermesEnabled: properties.hermesEnabled === "true",
      newArchitectureEnabled: properties.newArchEnabled === "true", releaseMinification: true },
    dependencies: dependencyVersions(mobileRoot),
    toolchain: { gradle: gradleVersion }
  };
}

/** @param {string} mobileRoot */
function dependencyVersions(mobileRoot) {
  const packageJson = readJson(mobileRoot, "package.json");
  const lock = readJson(mobileRoot, "package-lock.json");
  return Object.fromEntries(["expo", "react", "react-native"].map(name => {
    const version = lock.packages?.[`node_modules/${name}`]?.version;
    if (typeof version !== "string" || packageJson.dependencies?.[name] !== version) {
      throw new Error(`Android preparation dependency version differs: ${name}`);
    }
    return [name, version];
  }));
}

/** @param {string} mobileRoot @param {string} filename */
function readJson(mobileRoot, filename) {
  return JSON.parse(fs.readFileSync(path.join(mobileRoot, filename), "utf8"));
}

/** @param {string} filename @returns {Record<string,string>} */
function readProperties(filename) {
  return Object.fromEntries(fs.readFileSync(filename, "utf8").split(/\r?\n/)
    .filter(line => line.includes("=") && !line.trim().startsWith("#"))
    .map(line => { const split = line.indexOf("="); return [line.slice(0, split).trim(), line.slice(split + 1).trim()]; }));
}
