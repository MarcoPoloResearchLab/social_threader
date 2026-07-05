#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPOSITORY_ROOT = path.resolve(MOBILE_ROOT, "..");
const SHARED_FILES = Object.freeze([
  "constants.js",
  "core/chunking.js",
  "core/richText.js",
  "types.d.js",
  "utils/templates.js"
]);

const packageJson = readJson("package.json");
const appJson = readJson("app.json");
const easJson = readJson("eas.json");

assertEqual(packageJson.main, "expo/AppEntry", "mobile package must use Expo AppEntry");
assertIncludes(packageJson.scripts?.check || "", "npm run test:coverage", "mobile check must run coverage");
assertIncludes(packageJson.scripts?.check || "", "expo install --check", "mobile check must validate Expo dependency alignment");
assertIncludes(packageJson.scripts?.android || "", "scripts/android-run.mjs", "Android local run must use the adb reverse launcher");
assertEqual(packageJson.dependencies?.expo, "~56.0.14", "mobile package must use the Kamu-aligned Expo SDK");
assertEqual(packageJson.dependencies?.react, "19.2.3", "mobile package must use the Expo SDK React version");
assertEqual(packageJson.dependencies?.["react-native"], "0.85.3", "mobile package must use the Expo SDK React Native version");
assertEqual(packageJson.dependencies?.playwright, undefined, "mobile package must not introduce Playwright");
assertEqual(packageJson.devDependencies?.playwright, undefined, "mobile dev package must not introduce Playwright");
assertExecutable("scripts/expo-run.expect", "Expo local-run prompt wrapper must be executable");
assertExecutable("scripts/android-run.mjs", "Android local-run launcher must be executable");
assertSharedWebCopies();
assertEqual(appJson.expo?.name, "Social Threader", "native app name must be stable");
assertEqual(appJson.expo?.scheme, "socialthreader", "native URL scheme must be stable");
assertNoPlugin(appJson.expo?.plugins, "expo-clipboard", "expo-clipboard must not be registered as a config plugin");
assertProjectFile(appJson.expo?.icon, "Expo icon must be stored inside mobile/");
assertProjectFile(appJson.expo?.splash?.image, "Expo splash image must be stored inside mobile/");
assertEqual(appJson.expo?.ios?.bundleIdentifier, "com.mprlab.socialthreader", "iOS bundle id must be explicit");
assertMatches(appJson.expo?.ios?.buildNumber, /^[1-9][0-9]*$/, "iOS build number must be a positive integer string");
assertEqual(appJson.expo?.android?.package, "com.mprlab.socialthreader", "Android package must be explicit");
assertNumber(appJson.expo?.android?.versionCode, "Android versionCode must be numeric");
assertProjectFile(appJson.expo?.android?.adaptiveIcon?.foregroundImage, "Android adaptive icon must be stored inside mobile/");
assertProjectFile(appJson.expo?.web?.favicon, "Web favicon must be stored inside mobile/");
assertEqual(easJson.build?.production?.distribution, "store", "EAS production profile must target stores");
assertEqual(easJson.build?.production?.android?.buildType, "app-bundle", "EAS Android production profile must emit AAB");

console.log("Social Threader mobile config validation passed.");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(MOBILE_ROOT, relativePath), "utf8"));
}

function assertIncludes(sourceValue, expectedValue, message) {
  if (!String(sourceValue).includes(expectedValue)) {
    throw new Error(`${message}: missing ${expectedValue}`);
  }
}

function assertEqual(actualValue, expectedValue, message) {
  if (actualValue !== expectedValue) {
    throw new Error(`${message}: got ${actualValue}, expected ${expectedValue}`);
  }
}

function assertMatches(actualValue, pattern, message) {
  if (!pattern.test(String(actualValue))) {
    throw new Error(`${message}: got ${actualValue}`);
  }
}

function assertNumber(actualValue, message) {
  if (typeof actualValue !== "number" || !Number.isInteger(actualValue) || actualValue < 1) {
    throw new Error(`${message}: got ${actualValue}`);
  }
}

function assertExecutable(relativePath, message) {
  const mode = fs.statSync(path.join(MOBILE_ROOT, relativePath)).mode;
  if ((mode & 0o111) === 0) {
    throw new Error(message);
  }
}

function assertSharedWebCopies() {
  for (const sharedFile of SHARED_FILES) {
    const sourcePath = path.join(REPOSITORY_ROOT, "js", sharedFile);
    const destinationPath = path.join(MOBILE_ROOT, "src", "shared-web", sharedFile);
    const sourceContent = fs.readFileSync(sourcePath, "utf8");
    const destinationContent = fs.readFileSync(destinationPath, "utf8");
    if (sourceContent !== destinationContent) {
      throw new Error(`Generated shared mobile module is stale: ${destinationPath}`);
    }
  }
}

function assertProjectFile(relativePath, message) {
  const candidatePath = path.resolve(MOBILE_ROOT, String(relativePath || ""));
  if (!candidatePath.startsWith(`${MOBILE_ROOT}${path.sep}`) || !fs.existsSync(candidatePath)) {
    throw new Error(`${message}: got ${relativePath}`);
  }
}

function assertNoPlugin(plugins, pluginName, message) {
  const pluginList = Array.isArray(plugins) ? plugins : [];
  const hasPlugin = pluginList.some((pluginDefinition) => {
    if (typeof pluginDefinition === "string") {
      return pluginDefinition === pluginName;
    }
    return Array.isArray(pluginDefinition) && pluginDefinition[0] === pluginName;
  });
  if (hasPlugin) {
    throw new Error(message);
  }
}
