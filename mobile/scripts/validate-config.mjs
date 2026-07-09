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
const packageLock = readJson("package-lock.json");
const androidReleaseIdentity = readJson("android-release-identity.json");
const makefileSource = fs.readFileSync(path.join(REPOSITORY_ROOT, "Makefile"), "utf8");
const appSource = fs.readFileSync(path.join(MOBILE_ROOT, "App.js"), "utf8");
const androidBuildSource = fs.readFileSync(path.join(MOBILE_ROOT, "scripts", "build-android-bundle.mjs"), "utf8");
const jestConfigSource = fs.readFileSync(path.join(MOBILE_ROOT, "jest.config.js"), "utf8");

assertEqual(packageJson.main, "expo/AppEntry", "mobile package must use Expo AppEntry");
assertIncludes(packageJson.scripts?.check || "", "npm run test:coverage", "mobile check must run coverage");
assertIncludes(packageJson.scripts?.check || "", "expo install --check", "mobile check must validate Expo dependency alignment");
assertIncludes(packageJson.scripts?.ios || "", "scripts/ios-run.mjs", "iOS local run must use the prompt-safe Expo launcher");
assertIncludes(packageJson.scripts?.android || "", "scripts/android-run.mjs", "Android local run must use the adb reverse launcher");
assertEqual(packageJson.dependencies?.expo, "57.0.4", "mobile package must use the Expo SDK 57 runtime");
assertEqual(packageJson.dependencies?.react, "19.2.3", "mobile package must use the Expo SDK React version");
assertEqual(packageJson.dependencies?.["react-native"], "0.86.0", "mobile package must use the Expo SDK React Native version");
assertEqual(packageJson.dependencies?.["expo-clipboard"], "57.0.0", "mobile package must use Expo SDK clipboard for native image copies");
assertEqual(packageJson.dependencies?.["expo-image-picker"], "57.0.2", "mobile package must use Expo SDK image picker for native image attachments");
assertEqual(packageJson.dependencies?.["expo-sharing"], undefined, "mobile package must not keep the old native image sharing dependency");
assertEqual(
  packageJson.dependencies?.["react-native-safe-area-context"],
  undefined,
  "mobile package must avoid the safe-area native dependency with deprecated Android call sites"
);
assertEqual(packageJson.dependencies?.playwright, undefined, "mobile package must not introduce Playwright");
assertEqual(packageJson.devDependencies?.playwright, undefined, "mobile dev package must not introduce Playwright");
assertNotIncludes(appSource, "react-native-safe-area-context", "mobile app must not import the removed safe-area native dependency");
assertEqual(packageJson.devDependencies?.["jest-expo"], undefined, "mobile package must not use the deprecated-transitive jest-expo preset path");
assertEqual(packageJson.devDependencies?.jest, "30.4.1", "mobile tests must use the upgraded Jest runtime");
assertEqual(packageJson.devDependencies?.["babel-jest"], "30.4.1", "mobile tests must use the upgraded Babel Jest transformer");
assertEqual(packageJson.devDependencies?.["babel-preset-expo"], "57.0.2", "mobile Babel preset must match Expo SDK 57");
assertDeepEqual(
  packageJson.expo?.install?.exclude,
  ["jest"],
  "Expo dependency validation exclusions must stay limited to deliberate deprecation-remediation upgrades"
);
assertEqual(packageJson.overrides?.xcode?.uuid, "11.1.0", "xcode must use a supported uuid release");
assertEqual(packageJson.overrides?.["babel-plugin-istanbul"], "8.0.0", "coverage instrumentation must use the maintained Istanbul plugin");
assertEqual(packageJson.overrides?.["test-exclude"], "8.0.0", "coverage exclusion must use the maintained test-exclude package");
assertEqual(packageJson.overrides?.["@jest/reporters"]?.glob, "13.0.6", "Jest reporters must use supported glob");
assertEqual(packageJson.overrides?.["jest-config"]?.glob, "13.0.6", "Jest config must use supported glob");
assertEqual(packageJson.overrides?.["jest-runtime"]?.glob, "13.0.6", "Jest runtime must use supported glob");
assertNotIncludes(jestConfigSource, "jest-expo", "mobile Jest config must not use jest-expo");
assertNotIncludes(jestConfigSource, "reactNativeSafeAreaContext", "mobile Jest config must not keep the removed safe-area mock");
assertIncludes(jestConfigSource, "tests/mocks/reactNative.js", "mobile Jest config must use the local React Native mock");
assertNoDeprecatedLockPackages(packageLock);
assertExecutable("scripts/ios-run.mjs", "iOS local-run launcher must be executable");
assertExecutable("scripts/expo-run.expect", "Expo local-run prompt wrapper must be executable");
assertExecutable("scripts/android-run.mjs", "Android local-run launcher must be executable");
assertExecutable("scripts/build-android-bundle.mjs", "Android release bundle builder must be executable");
assertExecutable("scripts/publish-android-play.mjs", "Android Play publisher must be executable");
assertSharedWebCopies();
assertEqual(appJson.expo?.name, "Social Threader", "native app name must be stable");
assertEqual(appJson.expo?.scheme, "socialthreader", "native URL scheme must be stable");
assertNoPlugin(appJson.expo?.plugins, "expo-clipboard", "expo-clipboard must not be registered as a config plugin");
assertNoPlugin(appJson.expo?.plugins, "expo-sharing", "expo-sharing must not be registered for clipboard-based image copies");
assertPluginOption(
  appJson.expo?.plugins,
  "expo-image-picker",
  "microphonePermission",
  false,
  "expo-image-picker must not request microphone access for library-only image picking"
);
assertProjectFile(appJson.expo?.icon, "Expo icon must be stored inside mobile/");
assertProjectFile(appJson.expo?.splash?.image, "Expo splash image must be stored inside mobile/");
assertEqual(appJson.expo?.ios?.bundleIdentifier, "com.mprlab.socialthreader", "iOS bundle id must be explicit");
assertMatches(appJson.expo?.ios?.buildNumber, /^[1-9][0-9]*$/, "iOS build number must be a positive integer string");
assertEqual(appJson.expo?.android?.package, "com.mprlab.socialthreader", "Android package must be explicit");
assertNumber(appJson.expo?.android?.versionCode, "Android versionCode must be numeric");
assertProjectFile(appJson.expo?.android?.adaptiveIcon?.foregroundImage, "Android adaptive icon must be stored inside mobile/");
assertProjectFile(appJson.expo?.web?.favicon, "Web favicon must be stored inside mobile/");
assertEqual(easJson.build?.production?.distribution, "store", "EAS production profile must target stores");
assertEqual(easJson.build?.production?.android, undefined, "Android store publishing must not use EAS");
assertEqual(androidReleaseIdentity.schema, "social-threader.mobile-android-release-identity.v1", "Android release identity schema must be stable");
assertEqual(androidReleaseIdentity.googleCloudProjectId, "kamu-tales", "Android release identity must supply the Google Cloud quota project");
assertEqual(androidReleaseIdentity.packageName, "com.mprlab.socialthreader", "Android release identity package must match the app package");
assertIncludes(makefileSource, "MOBILE_ANDROID_VERSION_CODE ?= auto", "Android release version code must default to Play-safe auto resolution");
assertIncludes(makefileSource, "release: ci", "root Makefile must expose make release as the checked store release entrypoint");
assertIncludes(makefileSource, "$(MAKE) --no-print-directory submit-android", "make release must publish Android through the lower-level submit target");
assertIncludes(makefileSource, "publish:", "root Makefile must expose make publish");
assertIncludes(makefileSource, "deploy:", "root Makefile must expose make deploy");
assertIncludes(androidBuildSource, "releaseIdentity.googleCloudProjectId", "Android bundle builder must use the release identity quota project");
assertIncludes(
  androidBuildSource,
  "patchGeneratedAndroidDependencySources(buildMobileDir)",
  "Android bundle builder must patch generated third-party native deprecation sources"
);
assertIncludes(androidBuildSource, "react::RawPropsParser()", "Android bundle builder must replace the deprecated RawPropsParser call");
assertIncludes(androidBuildSource, "ForwardingCookieHandler()", "Android bundle builder must replace the deprecated cookie handler constructor");
assertIncludes(androidBuildSource, "sharedObjectDidRelease()", "Android bundle builder must replace the deprecated shared-object release hook");
assertIncludes(androidBuildSource, "patchGeneratedAndroidGradleFiles(buildMobileDir)", "Android bundle builder must patch generated Gradle syntax");
assertIncludes(androidBuildSource, "org.gradle.java.installations.auto-download", "Android bundle builder must avoid Gradle toolchain auto-provisioning warnings");
assertIncludes(androidBuildSource, `"none"`, "Android bundle builder must suppress remaining upstream Gradle warning-mode noise");
assertIncludes(androidBuildSource, "NativeModulesProxyModule.kt", "Android bundle builder must patch the Expo native modules proxy DSL warning");
assertIncludes(androidBuildSource, "ModuleRegistryAdapter.java", "Android bundle builder must patch Expo ReactPackage Java deprecations");
assertIncludes(androidBuildSource, "EventEmitterModule.java", "Android bundle builder must patch Expo event dispatcher Java deprecations");
assertIncludes(androidBuildSource, "-Xlint:none", "Android bundle builder must suppress upstream Expo Java deprecation notes");
assertIncludes(androidBuildSource, "delete environment.FORCE_COLOR", "Android bundle builder must avoid Metro color environment warnings");

console.log("Social Threader mobile config validation passed.");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(MOBILE_ROOT, relativePath), "utf8"));
}

function assertIncludes(sourceValue, expectedValue, message) {
  if (!String(sourceValue).includes(expectedValue)) {
    throw new Error(`${message}: missing ${expectedValue}`);
  }
}

function assertNotIncludes(sourceValue, rejectedValue, message) {
  if (String(sourceValue).includes(rejectedValue)) {
    throw new Error(`${message}: found ${rejectedValue}`);
  }
}

function assertEqual(actualValue, expectedValue, message) {
  if (actualValue !== expectedValue) {
    throw new Error(`${message}: got ${actualValue}, expected ${expectedValue}`);
  }
}

function assertDeepEqual(actualValue, expectedValue, message) {
  if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
    throw new Error(`${message}: got ${JSON.stringify(actualValue)}, expected ${JSON.stringify(expectedValue)}`);
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

function assertHasPlugin(plugins, pluginName, message) {
  const pluginDefinition = findPluginDefinition(plugins, pluginName);
  if (!pluginDefinition) {
    throw new Error(message);
  }
}

function assertPluginOption(plugins, pluginName, optionName, expectedValue, message) {
  const pluginDefinition = findPluginDefinition(plugins, pluginName);
  const options = Array.isArray(pluginDefinition) ? pluginDefinition[1] : null;
  if (!options || options[optionName] !== expectedValue) {
    throw new Error(`${message}: got ${options ? options[optionName] : undefined}`);
  }
}

function findPluginDefinition(plugins, pluginName) {
  const pluginList = Array.isArray(plugins) ? plugins : [];
  return pluginList.find((pluginDefinition) => {
    if (typeof pluginDefinition === "string") {
      return pluginDefinition === pluginName;
    }
    return Array.isArray(pluginDefinition) && pluginDefinition[0] === pluginName;
  });
}

function assertNoDeprecatedLockPackages(lockFile) {
  const packages = lockFile.packages || {};
  for (const [packagePath, packageMetadata] of Object.entries(packages)) {
    if (packageMetadata?.deprecated) {
      throw new Error(`mobile package-lock contains deprecated package ${packagePath}: ${packageMetadata.deprecated}`);
    }
  }
}
