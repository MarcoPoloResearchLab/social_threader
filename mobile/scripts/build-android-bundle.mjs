#!/usr/bin/env node
// @ts-check
/// <reference types="node" />

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildEnvironment } from "./lib/build-environment.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const DEFAULT_MOBILE_DIR = path.join(REPO_ROOT, "mobile");
const DEFAULT_BUILD_DIR = path.join(os.tmpdir(), "social-threader-mobile-android-aab");
const DEFAULT_CREDENTIAL_DIR = path.join(os.homedir(), ".local", "share", "social_threader", "android-upload");
const DEFAULT_KEYSTORE_PROPERTIES = path.join(DEFAULT_CREDENTIAL_DIR, "keystore.properties");
const DEFAULT_KEYSTORE = path.join(DEFAULT_CREDENTIAL_DIR, "socialthreader-upload-key.jks");
const DEFAULT_ANDROID_SDK_ROOT = path.join(os.homedir(), "Library", "Android", "sdk");
const BUNDLE_SCHEMA = "social-threader.mobile-android-bundle.v1";
const ANDROID_PUBLISHER_API_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";
const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const SIGNING_ENV_PREFIX = "SOCIAL_THREADER_ANDROID_UPLOAD";

class BuildError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = "BuildError";
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const metadata = buildAndroidBundle(args);
  process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
} catch (error) {
  if (error instanceof BuildError) {
    process.stderr.write(`mobile android bundle failed: ${error.message}\n`);
    process.exit(2);
  }
  throw error;
}

/**
 * @typedef {{
 *   mobileDir: string;
 *   buildDir: string;
 *   output: string;
 *   versionCode: string;
 *   keystoreProperties: string;
 *   keystore: string;
 *   javaHome: string;
 *   androidSdkRoot: string;
 *   quotaProject: string;
 *   versioning: { artifactVersion: string; releaseTimestamp: string } | null;
 *   keepBuildDir: boolean;
 * }} BundleArgs
 */

/**
 * @param {string[]} argv
 * @returns {BundleArgs}
 */
function parseArgs(argv) {
  const options = new Map();
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--keep-build-dir") {
      flags.add("keep-build-dir");
      continue;
    }
    if (!token.startsWith("--")) {
      throw new BuildError(`unexpected positional argument: ${token}`);
    }
    const equalsIndex = token.indexOf("=");
    if (equalsIndex > 0) {
      options.set(token.slice(2, equalsIndex), token.slice(equalsIndex + 1));
      continue;
    }
    const optionName = token.slice(2);
    const optionValue = argv[index + 1];
    if (!optionValue || optionValue.startsWith("--")) {
      throw new BuildError(`missing value for --${optionName}`);
    }
    options.set(optionName, optionValue);
    index += 1;
  }

  const mobileDir = resolvePath(options.get("mobile-dir") || DEFAULT_MOBILE_DIR);
  const releaseIdentity = readAndroidReleaseIdentity(mobileDir);
  const versioning = parseLifecycleVersioning(
    String(process.env.MPRLAB_ARTIFACT_VERSION || ""),
    String(options.get("release-timestamp") || "")
  );

  return {
    mobileDir,
    buildDir: resolvePath(options.get("build-dir") || DEFAULT_BUILD_DIR),
    output: options.has("output") ? resolvePath(options.get("output") || "") : "",
    versionCode: String(options.get("version-code") || process.env.SOCIAL_THREADER_ANDROID_VERSION_CODE || "local"),
    keystoreProperties: resolvePath(
      options.get("keystore-properties") ||
        process.env.SOCIAL_THREADER_ANDROID_KEYSTORE_PROPERTIES ||
        DEFAULT_KEYSTORE_PROPERTIES
    ),
    keystore: resolvePath(options.get("keystore") || process.env.SOCIAL_THREADER_ANDROID_UPLOAD_STORE_FILE || DEFAULT_KEYSTORE),
    javaHome: resolveJavaHome(options.get("java-home") || process.env.JAVA_HOME || ""),
    androidSdkRoot: resolvePath(options.get("android-sdk-root") || process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || DEFAULT_ANDROID_SDK_ROOT),
    quotaProject: String(
      options.get("quota-project") ||
        process.env.GOOGLE_CLOUD_QUOTA_PROJECT ||
        process.env.GCLOUD_QUOTA_PROJECT ||
        releaseIdentity.googleCloudProjectId ||
        ""
    ),
    versioning,
    keepBuildDir: flags.has("keep-build-dir")
  };
}

/**
 * @param {string} artifactVersion
 * @param {string} releaseTimestamp
 * @returns {{ artifactVersion: string; releaseTimestamp: string } | null}
 */
function parseLifecycleVersioning(artifactVersion, releaseTimestamp) {
  if (!artifactVersion && !releaseTimestamp) {
    return null;
  }
  if (!artifactVersion || !releaseTimestamp) {
    throw new BuildError("MPRLAB_ARTIFACT_VERSION and --release-timestamp must be provided together");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(artifactVersion)) {
    throw new BuildError("MPRLAB_ARTIFACT_VERSION is not canonical");
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(releaseTimestamp)) {
    throw new BuildError("--release-timestamp must be an RFC 3339 UTC timestamp");
  }
  return { artifactVersion, releaseTimestamp };
}

/**
 * @param {BundleArgs} args
 * @returns {Record<string, unknown>}
 */
function buildAndroidBundle(args) {
  const appConfig = readAppConfig(args.mobileDir);
  const versionCodeResolution = resolveVersionCode(args.versionCode, appConfig, args.quotaProject);
  const signing = readSigningProperties(args.keystoreProperties, args.keystore);
  const expectedUploadKeySha256 = readExpectedUploadKeySha256(args.mobileDir);
  const uploadKeySha256 = verifyUploadKeyFingerprint(signing, args.javaHome, expectedUploadKeySha256);

  requireFile(path.join(args.mobileDir, "package.json"), "mobile package.json");
  requireFile(path.join(args.mobileDir, "package-lock.json"), "mobile package-lock.json");
  requireDirectory(args.androidSdkRoot, "Android SDK root");
  requireExecutable(path.join(args.javaHome, "bin", "java"), "java");
  requireExecutable(path.join(args.javaHome, "bin", "jarsigner"), "jarsigner");
  requireExecutable(path.join(args.javaHome, "bin", "keytool"), "keytool");
  requireExecutable(which("npm"), "npm");
  requireExecutable(which("bundletool"), "bundletool");
  requireExecutable(which("unzip"), "unzip");

  if (args.buildDir === "/" || args.buildDir === os.tmpdir()) {
    throw new BuildError(`unsafe build directory: ${args.buildDir}`);
  }

  fs.rmSync(args.buildDir, { recursive: true, force: true });
  const buildMobileDir = path.join(args.buildDir, "mobile");
  copyMobileProject(args.mobileDir, buildMobileDir);
  patchAndroidVersionCodeInAppJson(buildMobileDir, versionCodeResolution.versionCode);

  const env = buildEnvironment(args.javaHome, args.androidSdkRoot);
  run(["npm", "ci"], { cwd: buildMobileDir, env });
  patchGeneratedAndroidDependencySources(buildMobileDir);
  run(["npx", "--no-install", "expo", "prebuild", "--platform", "android", "--no-install"], { cwd: buildMobileDir, env });
  writeLocalProperties(path.join(buildMobileDir, "android", "local.properties"), args.androidSdkRoot);
  enableReleaseMinification(path.join(buildMobileDir, "android", "gradle.properties"));
  patchReleaseSigning(path.join(buildMobileDir, "android", "app", "build.gradle"));
  patchGeneratedAndroidGradleFiles(buildMobileDir);

  /** @type {NodeJS.ProcessEnv} */
  const gradleEnv = { ...env };
  gradleEnv.NODE_ENV = "production";
  gradleEnv[`${SIGNING_ENV_PREFIX}_STORE_FILE`] = signing.storeFile;
  gradleEnv[`${SIGNING_ENV_PREFIX}_STORE_PASSWORD`] = signing.storePassword;
  gradleEnv[`${SIGNING_ENV_PREFIX}_KEY_ALIAS`] = signing.keyAlias;
  gradleEnv[`${SIGNING_ENV_PREFIX}_KEY_PASSWORD`] = signing.keyPassword;
  run(["./gradlew", "--no-daemon", "--warning-mode", "none", "bundleRelease"], {
    cwd: path.join(buildMobileDir, "android"),
    env: gradleEnv
  });

  const generatedBundle = path.join(buildMobileDir, "android", "app", "build", "outputs", "bundle", "release", "app-release.aab");
  requireFile(generatedBundle, "generated release app bundle");
  const outputPath = args.output || defaultOutputPath(args.mobileDir, appConfig.version);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.copyFileSync(generatedBundle, outputPath);
  const mappingOutputPath = copyDeobfuscationFile(buildMobileDir, outputPath);
  const validation = validateBundle(outputPath, args.javaHome, uploadKeySha256);

  if (validation.packageName !== appConfig.packageName) {
    throw new BuildError(`generated bundle package ${validation.packageName} does not match app.json ${appConfig.packageName}`);
  }
  if (validation.versionName !== appConfig.version) {
    throw new BuildError(`generated bundle versionName ${validation.versionName} does not match app.json ${appConfig.version}`);
  }
  if (validation.versionCode !== versionCodeResolution.versionCode) {
    throw new BuildError(`generated bundle versionCode ${validation.versionCode} does not match resolved versionCode ${versionCodeResolution.versionCode}`);
  }

  if (!args.keepBuildDir) {
    fs.rmSync(args.buildDir, { recursive: true, force: true });
  }

  /** @type {Record<string, unknown>} */
  const metadata = {
    schema: BUNDLE_SCHEMA,
    status: "passed",
    androidPackage: appConfig.packageName,
    versionName: validation.versionName,
    versionCode: validation.versionCode,
    sourceVersionCode: appConfig.versionCode,
    versionCodeSource: versionCodeResolution.source,
    versionCodePolicy: versionCodeResolution.policy,
    googlePlayMaxVersionCode: versionCodeResolution.googlePlayMaxVersionCode,
    output: outputPath,
    sha256: sha256File(outputPath),
    sizeBytes: fs.statSync(outputPath).size,
    deobfuscationFile: mappingOutputPath,
    deobfuscationSha256: sha256File(mappingOutputPath),
    keystore: signing.storeFile,
    uploadKeySha256,
    signerOwner: validation.signerOwner,
    signerSha256: validation.signerSha256,
    zipIntegrity: "passed",
    jarSignature: "passed",
    releaseSigner: "passed",
    bundletoolValidated: validation.bundletoolValidated,
    r8Minification: "enabled",
    resourceShrinking: "disabled"
  };
  if (args.versioning) {
    metadata.versioning = args.versioning;
  }
  metadata.buildManifest = writeBuildManifest(outputPath, metadata);
  return metadata;
}

/**
 * @param {string} mobileDir
 * @returns {{ version: string; versionCode: number; packageName: string }}
 */
function readAppConfig(mobileDir) {
  const appJsonPath = path.join(mobileDir, "app.json");
  requireFile(appJsonPath, "Expo app.json");
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
  const expoConfig = appJson.expo || {};
  const androidConfig = expoConfig.android || {};
  return {
    version: requireString(expoConfig.version, `expo.version in ${appJsonPath}`),
    versionCode: requirePositiveInteger(androidConfig.versionCode, `expo.android.versionCode in ${appJsonPath}`),
    packageName: requireString(androidConfig.package, `expo.android.package in ${appJsonPath}`)
  };
}

/**
 * @param {string} requested
 * @param {{ versionCode: number; packageName: string }} appConfig
 * @param {string} quotaProject
 * @returns {{ versionCode: number; source: string; policy: string; googlePlayMaxVersionCode: number | null }}
 */
function resolveVersionCode(requested, appConfig, quotaProject) {
  const normalizedValue = requested.trim().toLowerCase();
  if (normalizedValue === "local") {
    return {
      versionCode: appConfig.versionCode,
      source: "local_app_json",
      policy: "expo.android.versionCode",
      googlePlayMaxVersionCode: null
    };
  }
  if (normalizedValue === "auto") {
    if (!quotaProject) {
      throw new BuildError("--version-code auto requires --quota-project, GOOGLE_CLOUD_QUOTA_PROJECT, or GCLOUD_QUOTA_PROJECT");
    }
    const googlePlayMaxVersionCode = fetchGooglePlayMaxVersionCode(appConfig.packageName, quotaProject);
    return {
      versionCode: Math.max(appConfig.versionCode, googlePlayMaxVersionCode + 1),
      source: "google_play",
      policy: "max(expo.android.versionCode, google_play_max_version_code + 1)",
      googlePlayMaxVersionCode
    };
  }
  if (!/^[1-9][0-9]*$/.test(normalizedValue)) {
    throw new BuildError("--version-code must be local, auto, or a positive integer");
  }
  const versionCode = Number(normalizedValue);
  if (versionCode < appConfig.versionCode) {
    throw new BuildError(`explicit Android versionCode ${versionCode} must be at least mobile/app.json ${appConfig.versionCode}`);
  }
  return {
    versionCode,
    source: "operator_override",
    policy: "explicit --version-code",
    googlePlayMaxVersionCode: null
  };
}

/**
 * @param {string} packageName
 * @param {string} quotaProject
 * @returns {number}
 */
function fetchGooglePlayMaxVersionCode(packageName, quotaProject) {
  const token = accessTokenFromApplicationDefaultCredentials();
  const headers = googleAuthHeaders(token, quotaProject);
  const edit = requestJsonSync({
    method: "POST",
    url: publisherUrl(packageName, "edits"),
    headers,
    label: "create Android Publisher edit"
  });
  const editId = requireString(edit.id, "edit id");
  const versionCodes = [];
  try {
    for (const resource of ["bundles", "apks"]) {
      const payload = requestJsonSync({
        method: "GET",
        url: publisherUrl(packageName, `edits/${encodeURIComponent(editId)}/${resource}`),
        headers,
        label: `list Android Publisher ${resource}`
      });
      versionCodes.push(...extractVersionCodes(payload));
    }
    const tracks = requestJsonSync({
      method: "GET",
      url: publisherUrl(packageName, `edits/${encodeURIComponent(editId)}/tracks`),
      headers,
      label: "list Android Publisher tracks"
    });
    versionCodes.push(...extractVersionCodes(tracks));
  } finally {
    requestJsonSync({
      method: "DELETE",
      url: publisherUrl(packageName, `edits/${encodeURIComponent(editId)}`),
      headers,
      label: "delete Android Publisher edit",
      allowFailure: true
    });
  }
  return versionCodes.length ? Math.max(...versionCodes) : 0;
}

/**
 * @param {string} propertiesPath
 * @param {string} keystorePath
 * @returns {{ storeFile: string; storePassword: string; keyAlias: string; keyPassword: string }}
 */
function readSigningProperties(propertiesPath, keystorePath) {
  requireFile(propertiesPath, "Android upload signing properties");
  const properties = readProperties(propertiesPath);
  const storeFile = resolveKeystorePath(properties.storeFile || keystorePath, propertiesPath);
  const keyAlias = requireProperty(properties, "keyAlias", propertiesPath);
  const storePassword = requireProperty(properties, "storePassword", propertiesPath);
  const keyPassword = requireProperty(properties, "keyPassword", propertiesPath);
  requireFile(storeFile, "Android upload keystore");
  return { storeFile, storePassword, keyAlias, keyPassword };
}

/**
 * @param {string} mobileDir
 * @returns {string}
 */
function readExpectedUploadKeySha256(mobileDir) {
  const identity = readAndroidReleaseIdentity(mobileDir);
  return normalizeSha256Fingerprint(String(identity.uploadKey?.sha256 || ""));
}

/**
 * @param {string} mobileDir
 * @returns {{ googleCloudProjectId: string; uploadKey?: { sha256?: string } }}
 */
function readAndroidReleaseIdentity(mobileDir) {
  const identityPath = path.join(mobileDir, "android-release-identity.json");
  if (!fs.existsSync(identityPath)) {
    return { googleCloudProjectId: "" };
  }
  const identity = JSON.parse(fs.readFileSync(identityPath, "utf8"));
  return {
    googleCloudProjectId: typeof identity.googleCloudProjectId === "string" ? identity.googleCloudProjectId : "",
    uploadKey: typeof identity.uploadKey === "object" && identity.uploadKey !== null ? identity.uploadKey : undefined
  };
}

/**
 * @param {{ storeFile: string; storePassword: string; keyAlias: string }} signing
 * @param {string} javaHome
 * @param {string} expectedSha256
 * @returns {string}
 */
function verifyUploadKeyFingerprint(signing, javaHome, expectedSha256) {
  const certificateOutput = runAndRead(
    [
      path.join(javaHome, "bin", "keytool"),
      "-list",
      "-v",
      "-keystore",
      signing.storeFile,
      "-storepass",
      signing.storePassword,
      "-alias",
      signing.keyAlias
    ],
    {
      label: `${path.join(javaHome, "bin", "keytool")} -list -v -keystore ${signing.storeFile} -alias ${signing.keyAlias}`
    }
  );
  const actualSha256 = certificateSha256FromOutput(certificateOutput, "Android upload keystore certificate");
  if (expectedSha256 && actualSha256 !== expectedSha256) {
    throw new BuildError(`Android upload key SHA-256 ${actualSha256} does not match release identity ${expectedSha256}`);
  }
  return actualSha256;
}

/**
 * @param {string} source
 * @param {string} destination
 */
function copyMobileProject(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  const ignoredNames = new Set(["node_modules", ".expo", "dist", "android", "ios"]);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (ignoredNames.has(entry.name)) {
      continue;
    }
    fs.cpSync(path.join(source, entry.name), path.join(destination, entry.name), { recursive: true, verbatimSymlinks: true });
  }
}

/**
 * @param {string} buildMobileDir
 */
function patchGeneratedAndroidDependencySources(buildMobileDir) {
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo-modules-core/expo-module-gradle-plugin/src/main/kotlin/expo/modules/plugin/android/AndroidLibraryExtension.kt",
    `  defaultConfig {
    this@defaultConfig.minSdk = minSdk
    this@defaultConfig.targetSdk = targetSdk
  }`,
    `  defaultConfig {
    this@defaultConfig.minSdk = minSdk
  }
  testOptions.targetSdk = targetSdk
  lint.targetSdk = targetSdk`
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo-modules-core/android/src/main/cpp/fabric/ExpoComponentDescriptorFactory.cpp",
    "react::RawPropsParser(/*useRawPropsJsiValue=*/true)",
    "react::RawPropsParser()"
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/AppContext.kt",
    "import com.facebook.react.uimanager.UIManagerModule\n",
    ""
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/AppContext.kt",
    "import expo.modules.kotlin.defaultmodules.ErrorManagerModule\n",
    ""
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/AppContext.kt",
    `  @Deprecated("Use AppContext.runtimeContext instead", ReplaceWith("runtime"))
  val hostingRuntimeContext = MainRuntime(this, reactContextHolder)

  val runtime: MainRuntime
    get() = hostingRuntimeContext`,
    `  val runtime = MainRuntime(this, reactContextHolder)

  @Deprecated("Use AppContext.runtimeContext instead", ReplaceWith("runtime"))
  val hostingRuntimeContext: MainRuntime
    get() = runtime`
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/AppContext.kt",
    "  val errorManager: ErrorManagerModule? by lazy {",
    "  val errorManager: JSLoggerModule? by lazy {"
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/AppContext.kt",
    "  internal fun dispatchOnMainUsingUIManager(block: () -> Unit) {",
    `  @Suppress("DEPRECATION")
  internal fun dispatchOnMainUsingUIManager(block: () -> Unit) {`
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/AppContext.kt",
    "UIManagerType.DEFAULT",
    "UIManagerType.LEGACY"
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/AppContext.kt",
    ") as UIManagerModule",
    ") as com.facebook.react.uimanager.UIManagerModule"
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/events/KModuleEventEmitterWrapper.kt",
    "UIManagerHelper.getEventDispatcherForReactTag(context, viewId)",
    "UIManagerHelper.getEventDispatcher(context)"
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/events/KModuleEventEmitterWrapper.kt",
    "UIManagerHelper.getEventDispatcherForReactTag(context, view.id)",
    "UIManagerHelper.getEventDispatcher(context)"
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/views/ViewDefinitionBuilder.kt",
    "import expo.modules.kotlin.exception.CodedException\n",
    ""
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/views/ViewDefinitionBuilder.kt",
    "import expo.modules.kotlin.exception.UnexpectedException\n",
    ""
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/views/ViewDefinitionBuilder.kt",
    `    appContext.errorManager?.reportExceptionToLogBox(
      error as? CodedException ?: UnexpectedException(error)
    )`,
    `    appContext.jsLogger?.error(
      error.message ?: error.toString(),
      error
    )`
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/views/ViewManagerDefinition.kt",
    "    appContext.errorManager?.reportExceptionToLogBox(exception)",
    "    appContext.jsLogger?.error(exception.message ?: exception.toString(), exception)"
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo-constants/android/src/main/java/expo/modules/constants/ConstantsModule.kt",
    "package expo.modules.constants",
    `@file:Suppress("DEPRECATION")

package expo.modules.constants`
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/defaultmodules/NativeModulesProxyModule.kt",
    "package expo.modules.kotlin.defaultmodules",
    `@file:Suppress("DEPRECATION")

package expo.modules.kotlin.defaultmodules`
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo-modules-core/android/src/main/java/expo/modules/adapters/react/ModuleRegistryAdapter.java",
    `  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {`,
    `  @Override
  @SuppressWarnings("deprecation")
  public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {`
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo-modules-core/android/src/main/java/expo/modules/adapters/react/ModuleRegistryAdapter.java",
    `  protected List<NativeModule> getNativeModulesFromModuleRegistry(
    ReactApplicationContext reactContext,
    ModuleRegistry moduleRegistry,
    @Nullable Consumer<AppContext> appContextConsumer
  ) {`,
    `  @SuppressWarnings("deprecation")
  protected List<NativeModule> getNativeModulesFromModuleRegistry(
    ReactApplicationContext reactContext,
    ModuleRegistry moduleRegistry,
    @Nullable Consumer<AppContext> appContextConsumer
  ) {`
  );
  replaceAllInGeneratedFile(
    buildMobileDir,
    "node_modules/expo-modules-core/android/src/main/java/expo/modules/adapters/react/services/EventEmitterModule.java",
    "UIManagerHelper.getEventDispatcherForReactTag(mReactContext, viewId)",
    "UIManagerHelper.getEventDispatcher(mReactContext)"
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo-modules-core/android/build.gradle",
    `if (shouldTurnWarningsIntoErrors) {
  tasks.withType(JavaCompile) configureEach {
    options.compilerArgs << "-Werror" << "-Xlint:all" << '-Xlint:-serial' << '-Xlint:-rawtypes'
  }
  tasks.withType(KotlinCompile) configureEach {
    compilerOptions.allWarningsAsErrors = true
  }
}`,
    `if (shouldTurnWarningsIntoErrors) {
  tasks.withType(JavaCompile) configureEach {
    options.compilerArgs << "-Werror" << "-Xlint:all" << '-Xlint:-serial' << '-Xlint:-rawtypes'
  }
  tasks.withType(KotlinCompile) configureEach {
    compilerOptions.allWarningsAsErrors = true
  }
}

tasks.withType(JavaCompile).configureEach {
  options.compilerArgs += ["-Xlint:none"]
}`
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo/android/src/main/java/expo/modules/ExpoModulesPackage.kt",
    "package expo.modules",
    `@file:Suppress("OVERRIDE_DEPRECATION")

package expo.modules`
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo/android/src/main/java/expo/modules/ReactActivityDelegateWrapper.kt",
    "package expo.modules",
    `@file:Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")

package expo.modules`
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo/android/src/main/java/expo/modules/fetch/ExpoFetchModule.kt",
    "ForwardingCookieHandler(reactContext)",
    "ForwardingCookieHandler()"
  );
  replaceInGeneratedFile(
    buildMobileDir,
    "node_modules/expo/android/src/main/java/expo/modules/fetch/NativeResponse.kt",
    `  override fun deallocate() {
    this.sink.finalize(directBuffer = false)
    super.deallocate()
  }`,
    `  override fun sharedObjectDidRelease() {
    this.sink.finalize(directBuffer = false)
    super.sharedObjectDidRelease()
  }`
  );
}

/**
 * @param {string} buildMobileDir
 */
function patchGeneratedAndroidGradleFiles(buildMobileDir) {
  const generatedGradleFiles = [
    "android/build.gradle",
    "android/app/build.gradle",
    "node_modules/@expo/dom-webview/android/build.gradle",
    "node_modules/@expo/log-box/android/build.gradle",
    "node_modules/expo/android/build.gradle",
    "node_modules/expo-asset/android/build.gradle",
    "node_modules/expo-clipboard/android/build.gradle",
    "node_modules/expo-constants/android/build.gradle",
    "node_modules/expo-file-system/android/build.gradle",
    "node_modules/expo-font/android/build.gradle",
    "node_modules/expo-image-loader/android/build.gradle",
    "node_modules/expo-image-picker/android/build.gradle",
    "node_modules/expo-keep-awake/android/build.gradle",
    "node_modules/expo-modules-core/android/build.gradle",
    "node_modules/expo-status-bar/android/build.gradle"
  ];
  for (const relativePath of generatedGradleFiles) {
    patchGeneratedGradleFile(buildMobileDir, relativePath);
  }
}

/**
 * @param {string} buildMobileDir
 * @param {string} relativePath
 */
function patchGeneratedGradleFile(buildMobileDir, relativePath) {
  const targetPath = path.join(buildMobileDir, relativePath);
  requireFile(targetPath, `generated Android Gradle file ${relativePath}`);
  let source = fs.readFileSync(targetPath, "utf8");
  source = source.replace(/maven \{ url '([^']+)' \}/g, "maven { url = uri('$1') }");
  source = source.replace(
    /^(\s*)(canBePublished|crunchPngs|ignoreAssetsPattern|ndkVersion|namespace|prefab|shrinkResources|signingConfig|useLegacyPackaging|buildConfig|compose)\s+(.+)$/gm,
    "$1$2 = $3"
  );
  source = source.replace(/^(\s*)implementation jscFlavor$/gm, "$1implementation(jscFlavor)");
  fs.writeFileSync(targetPath, source, "utf8");
}

/**
 * @param {string} buildMobileDir
 * @param {string} relativePath
 * @param {string} searchValue
 * @param {string} replacementValue
 */
function replaceInGeneratedFile(buildMobileDir, relativePath, searchValue, replacementValue) {
  const targetPath = path.join(buildMobileDir, relativePath);
  requireFile(targetPath, `generated Android dependency source ${relativePath}`);
  const source = fs.readFileSync(targetPath, "utf8");
  if (!source.includes(searchValue)) {
    throw new BuildError(`could not apply generated Android dependency patch to ${relativePath}`);
  }
  fs.writeFileSync(targetPath, source.replace(searchValue, replacementValue), "utf8");
}

/**
 * @param {string} buildMobileDir
 * @param {string} relativePath
 * @param {string} searchValue
 * @param {string} replacementValue
 */
function replaceAllInGeneratedFile(buildMobileDir, relativePath, searchValue, replacementValue) {
  const targetPath = path.join(buildMobileDir, relativePath);
  requireFile(targetPath, `generated Android dependency source ${relativePath}`);
  const source = fs.readFileSync(targetPath, "utf8");
  if (!source.includes(searchValue)) {
    throw new BuildError(`could not apply generated Android dependency patch to ${relativePath}`);
  }
  fs.writeFileSync(targetPath, source.split(searchValue).join(replacementValue), "utf8");
}

/**
 * @param {string} mobileDir
 * @param {number} versionCode
 */
function patchAndroidVersionCodeInAppJson(mobileDir, versionCode) {
  const appJsonPath = path.join(mobileDir, "app.json");
  const payload = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
  payload.expo = payload.expo || {};
  payload.expo.android = payload.expo.android || {};
  payload.expo.android.versionCode = versionCode;
  fs.writeFileSync(appJsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/**
 * @param {string} localPropertiesPath
 * @param {string} androidSdkRoot
 */
function writeLocalProperties(localPropertiesPath, androidSdkRoot) {
  fs.mkdirSync(path.dirname(localPropertiesPath), { recursive: true });
  fs.writeFileSync(localPropertiesPath, `sdk.dir=${androidSdkRoot}\n`, "utf8");
}

/**
 * @param {string} gradlePropertiesPath
 */
function enableReleaseMinification(gradlePropertiesPath) {
  const properties = readProperties(gradlePropertiesPath);
  properties["android.enableMinifyInReleaseBuilds"] = "true";
  properties["android.enableShrinkResourcesInReleaseBuilds"] = "false";
  properties["org.gradle.java.installations.auto-download"] = "false";
  writeProperties(gradlePropertiesPath, properties);
}

/**
 * @param {string} buildGradlePath
 */
function patchReleaseSigning(buildGradlePath) {
  let text = fs.readFileSync(buildGradlePath, "utf8");
  const projectRootLine = "def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()";
  const signingDefinitions = `
def uploadStoreFile = System.getenv("${SIGNING_ENV_PREFIX}_STORE_FILE") ?: ""
def uploadStorePassword = System.getenv("${SIGNING_ENV_PREFIX}_STORE_PASSWORD") ?: ""
def uploadKeyAlias = System.getenv("${SIGNING_ENV_PREFIX}_KEY_ALIAS") ?: ""
def uploadKeyPassword = System.getenv("${SIGNING_ENV_PREFIX}_KEY_PASSWORD") ?: ""
if (!uploadStoreFile || !uploadStorePassword || !uploadKeyAlias || !uploadKeyPassword) {
    throw new GradleException("Social Threader release signing requires ${SIGNING_ENV_PREFIX}_* environment variables")
}
`.trimEnd();
  if (!text.includes(signingDefinitions)) {
    text = text.replace(projectRootLine, `${projectRootLine}\n${signingDefinitions}`);
  }

  const debugSigningBlock = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;
  const releaseSigningBlock = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            storeFile file(uploadStoreFile)
            storePassword uploadStorePassword
            keyAlias uploadKeyAlias
            keyPassword uploadKeyPassword
        }
    }`;
  if (!text.includes(releaseSigningBlock)) {
    if (!text.includes(debugSigningBlock)) {
      throw new BuildError(`could not find generated signingConfigs block in ${buildGradlePath}`);
    }
    text = text.replace(debugSigningBlock, releaseSigningBlock);
  }

  const debugReleaseLine = "            signingConfig signingConfigs.debug";
  const uploadReleaseLine = "            signingConfig signingConfigs.release";
  const buildTypesIndex = text.indexOf("    buildTypes {");
  if (buildTypesIndex === -1) {
    throw new BuildError(`could not find buildTypes block in ${buildGradlePath}`);
  }
  const releaseIndex = text.indexOf("        release {", buildTypesIndex);
  if (releaseIndex === -1) {
    throw new BuildError(`could not find release buildType in ${buildGradlePath}`);
  }
  const releaseEnd = findGradleBlockEnd(text, releaseIndex);
  let releaseBlock = text.slice(releaseIndex, releaseEnd);
  if (!releaseBlock.includes(uploadReleaseLine)) {
    if (!releaseBlock.includes(debugReleaseLine)) {
      throw new BuildError(`could not find release signingConfig line in ${buildGradlePath}`);
    }
    releaseBlock = releaseBlock.replace(debugReleaseLine, uploadReleaseLine);
    text = `${text.slice(0, releaseIndex)}${releaseBlock}${text.slice(releaseEnd)}`;
  }
  fs.writeFileSync(buildGradlePath, text, "utf8");
}

/**
 * @param {string} text
 * @param {number} blockStart
 * @returns {number}
 */
function findGradleBlockEnd(text, blockStart) {
  const braceStart = text.indexOf("{", blockStart);
  if (braceStart === -1) {
    throw new BuildError("could not find Gradle block opening brace");
  }
  let depth = 0;
  for (let index = braceStart; index < text.length; index += 1) {
    if (text[index] === "{") {
      depth += 1;
    } else if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }
  throw new BuildError("could not find Gradle block closing brace");
}

/**
 * @param {string} buildMobileDir
 * @param {string} outputPath
 * @returns {string}
 */
function copyDeobfuscationFile(buildMobileDir, outputPath) {
  const generatedMapping = path.join(buildMobileDir, "android", "app", "build", "outputs", "mapping", "release", "mapping.txt");
  requireFile(generatedMapping, "R8 deobfuscation mapping file");
  const mappingOutputPath = matchingOutputPath(outputPath, "-mapping.txt");
  fs.copyFileSync(generatedMapping, mappingOutputPath);
  return mappingOutputPath;
}

/**
 * @param {string} bundlePath
 * @param {string} javaHome
 * @param {string} uploadKeySha256
 * @returns {{ packageName: string; versionName: string; versionCode: number; signerOwner: string; signerSha256: string; bundletoolValidated: boolean }}
 */
function validateBundle(bundlePath, javaHome, uploadKeySha256) {
  run(["unzip", "-tq", bundlePath], { quiet: true });
  run([path.join(javaHome, "bin", "jarsigner"), "-verify", bundlePath], { quiet: true });
  const certificateOutput = runAndRead([path.join(javaHome, "bin", "keytool"), "-printcert", "-jarfile", bundlePath], {
    label: `${path.join(javaHome, "bin", "keytool")} -printcert -jarfile ${bundlePath}`
  });
  const signerOwner = ownerFromCertificateOutput(certificateOutput);
  const signerSha256 = certificateSha256FromOutput(certificateOutput, "Android App Bundle signer");
  if (signerSha256 !== uploadKeySha256) {
    throw new BuildError(`Android App Bundle signer SHA-256 ${signerSha256} does not match upload key ${uploadKeySha256}`);
  }
  const bundletool = which("bundletool");
  requireExecutable(bundletool, "bundletool");
  run([bundletool, "validate", `--bundle=${bundlePath}`], { quiet: true });
  return {
    ...readBundleManifest(bundlePath, bundletool),
    signerOwner,
    signerSha256,
    bundletoolValidated: true
  };
}

/**
 * @param {string} bundlePath
 * @param {string} bundletool
 * @returns {{ packageName: string; versionName: string; versionCode: number }}
 */
function readBundleManifest(bundlePath, bundletool) {
  const packageName = runAndRead([bundletool, "dump", "manifest", `--bundle=${bundlePath}`, "--xpath=/manifest/@package"], {
    label: "read generated bundle package"
  }).trim();
  const versionCodeRaw = runAndRead([bundletool, "dump", "manifest", `--bundle=${bundlePath}`, "--xpath=/manifest/@android:versionCode"], {
    label: "read generated bundle versionCode"
  }).trim();
  const versionName = runAndRead([bundletool, "dump", "manifest", `--bundle=${bundlePath}`, "--xpath=/manifest/@android:versionName"], {
    label: "read generated bundle versionName"
  }).trim();
  return {
    packageName: requireString(packageName, "bundle package"),
    versionName: requireString(versionName, "bundle versionName"),
    versionCode: requirePositiveInteger(versionCodeRaw, "bundle versionCode")
  };
}

/**
 * @param {string} outputPath
 * @param {Record<string, unknown>} metadata
 * @returns {string}
 */
function writeBuildManifest(outputPath, metadata) {
  const manifestPath = outputPath.replace(/\.aab$/, ".json");
  const manifest = { ...metadata, buildManifest: manifestPath };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifestPath;
}

/**
 * @param {{ method: string; url: string; headers: Record<string, string>; label: string; allowFailure?: boolean }} request
 * @returns {Record<string, unknown>}
 */
function requestJsonSync(request) {
  const curlArgs = ["-sS", "-X", request.method];
  for (const [key, value] of Object.entries(request.headers)) {
    curlArgs.push("-H", `${key}: ${value}`);
  }
  curlArgs.push(request.url);
  const result = spawnSync("curl", curlArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error || result.status !== 0) {
    if (request.allowFailure) {
      return {};
    }
    const detail = `${result.stdout || ""}${result.stderr || ""}`.trim();
    throw new BuildError(`${request.label} failed${detail ? `: ${detail}` : ""}`);
  }
  const output = result.stdout.trim();
  if (!output) {
    return {};
  }
  const payload = JSON.parse(output);
  if (payload && typeof payload === "object" && "error" in payload && !request.allowFailure) {
    throw new BuildError(`${request.label} failed: ${JSON.stringify(payload.error)}`);
  }
  return payload && typeof payload === "object" ? payload : {};
}

/**
 * @returns {string}
 */
function accessTokenFromApplicationDefaultCredentials() {
  const result = spawnSync("gcloud", ["auth", "application-default", "print-access-token"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.error) {
    throw new BuildError(`could not run gcloud for ADC token: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = `${result.stdout || ""}${result.stderr || ""}`.trim();
    throw new BuildError(
      `could not read Google Application Default Credentials token with ${ANDROID_PUBLISHER_SCOPE}; ` +
        `run gcloud auth application-default login --scopes=${ANDROID_PUBLISHER_SCOPE},https://www.googleapis.com/auth/cloud-platform` +
        (detail ? `: ${detail}` : "")
    );
  }
  return result.stdout.trim();
}

/**
 * @param {string} token
 * @param {string} quotaProject
 * @returns {Record<string, string>}
 */
function googleAuthHeaders(token, quotaProject) {
  const headers = { Authorization: `Bearer ${token}` };
  if (quotaProject) {
    headers["X-Goog-User-Project"] = quotaProject;
  }
  return headers;
}

/**
 * @param {string} packageName
 * @param {string} pathSuffix
 * @returns {string}
 */
function publisherUrl(packageName, pathSuffix) {
  return `${ANDROID_PUBLISHER_API_BASE}/${encodeURIComponent(packageName)}/${pathSuffix}`;
}

/**
 * @param {unknown} payload
 * @returns {number[]}
 */
function extractVersionCodes(payload) {
  const codes = [];
  const stack = [payload];
  while (stack.length) {
    const value = stack.pop();
    if (Array.isArray(value)) {
      stack.push(...value);
      continue;
    }
    if (!value || typeof value !== "object") {
      continue;
    }
    for (const [key, entry] of Object.entries(value)) {
      if (key === "versionCode" || key === "versionCodes") {
        const entries = Array.isArray(entry) ? entry : [entry];
        for (const rawCode of entries) {
          const numberValue = Number(rawCode);
          if (Number.isInteger(numberValue) && numberValue > 0) {
            codes.push(numberValue);
          }
        }
      } else {
        stack.push(entry);
      }
    }
  }
  return codes;
}

/**
 * @param {string} rawPath
 * @param {string} propertiesPath
 * @returns {string}
 */
function resolveKeystorePath(rawPath, propertiesPath) {
  const expandedPath = resolvePath(rawPath);
  if (path.isAbsolute(expandedPath)) {
    return expandedPath;
  }
  return path.resolve(path.dirname(propertiesPath), expandedPath);
}

/**
 * @param {string} value
 * @returns {string}
 */
function resolvePath(value) {
  if (!value) {
    return "";
  }
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return path.resolve(value);
}

/**
 * @param {string} explicitJavaHome
 * @returns {string}
 */
function resolveJavaHome(explicitJavaHome) {
  const candidates = [
    explicitJavaHome,
    process.env.ANDROID_STUDIO_JAVA_HOME || "",
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
    "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
    "/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home"
  ]
    .filter(Boolean)
    .map(resolvePath);
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "bin", "java")) && fs.existsSync(path.join(candidate, "bin", "jarsigner"))) {
      return candidate;
    }
  }
  const javaPath = which("java");
  const jarsignerPath = which("jarsigner");
  if (javaPath && jarsignerPath) {
    return path.dirname(path.dirname(javaPath));
  }
  throw new BuildError(`could not find a JDK with java and jarsigner; searched ${candidates.join(", ")}`);
}

/**
 * @param {string} command
 * @returns {string}
 */
function which(command) {
  const result = spawnSync("which", [command], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return result.status === 0 ? result.stdout.trim() : "";
}

/**
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
function readProperties(filePath) {
  /** @type {Record<string, string>} */
  const properties = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }
    const equalsIndex = line.indexOf("=");
    properties[line.slice(0, equalsIndex).trim()] = line.slice(equalsIndex + 1).trim();
  }
  return properties;
}

/**
 * @param {string} filePath
 * @param {Record<string, string>} properties
 */
function writeProperties(filePath, properties) {
  const lines = Object.entries(properties)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`);
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

/**
 * @param {Record<string, string>} properties
 * @param {string} key
 * @param {string} propertiesPath
 * @returns {string}
 */
function requireProperty(properties, key, propertiesPath) {
  const value = properties[key] || "";
  if (!value) {
    throw new BuildError(`missing signing property ${key} in ${propertiesPath}`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
function requireString(value, label) {
  if (!value || typeof value !== "string") {
    throw new BuildError(`missing ${label}`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function requirePositiveInteger(value, label) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new BuildError(`${label} must be a positive integer`);
  }
  return numberValue;
}

/**
 * @param {string} filePath
 * @param {string} label
 */
function requireFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new BuildError(`missing ${label}: ${filePath}`);
  }
  if (fs.statSync(filePath).size <= 0) {
    throw new BuildError(`empty ${label}: ${filePath}`);
  }
}

/**
 * @param {string} directoryPath
 * @param {string} label
 */
function requireDirectory(directoryPath, label) {
  if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
    throw new BuildError(`missing ${label}: ${directoryPath}`);
  }
}

/**
 * @param {string} executablePath
 * @param {string} label
 */
function requireExecutable(executablePath, label) {
  if (!executablePath || !fs.existsSync(executablePath)) {
    throw new BuildError(`missing executable for ${label}: ${executablePath || label}`);
  }
}

/**
 * @param {string[]} command
 * @param {{ cwd?: string; env?: NodeJS.ProcessEnv; quiet?: boolean }} options
 */
function run(command, options = {}) {
  process.stdout.write(`+ ${command.join(" ")}${options.cwd ? ` in ${options.cwd}` : ""}\n`);
  const result = spawnSync(command[0], command.slice(1), {
    cwd: options.cwd,
    env: options.env,
    stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8"
  });
  if (result.error) {
    throw new BuildError(`command failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    if (options.quiet) {
      process.stderr.write(`${result.stdout || ""}${result.stderr || ""}`);
    }
    throw new BuildError(`command failed with exit ${result.status}: ${command.join(" ")}`);
  }
}

/**
 * @param {string[]} command
 * @param {{ label: string }} options
 * @returns {string}
 */
function runAndRead(command, options) {
  const result = spawnSync(command[0], command.slice(1), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error) {
    throw new BuildError(`${options.label} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = `${result.stdout || ""}${result.stderr || ""}`.trim();
    throw new BuildError(`${options.label} failed with exit ${result.status}${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout;
}

/**
 * @param {string} output
 * @returns {string}
 */
function ownerFromCertificateOutput(output) {
  const ownerLine = output.split(/\r?\n/).find((line) => line.startsWith("Owner: "));
  return ownerLine ? ownerLine.slice("Owner: ".length).trim() : "";
}

/**
 * @param {string} output
 * @param {string} label
 * @returns {string}
 */
function certificateSha256FromOutput(output, label) {
  const match = output.match(/SHA256:\s*([0-9A-Fa-f:]+)/);
  if (!match) {
    throw new BuildError(`could not read SHA-256 fingerprint from ${label}`);
  }
  return normalizeSha256Fingerprint(match[1]);
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeSha256Fingerprint(value) {
  const normalizedValue = value.trim().toUpperCase();
  if (!normalizedValue) {
    return "";
  }
  const compactValue = normalizedValue.replace(/:/g, "");
  if (!/^[0-9A-F]{64}$/.test(compactValue)) {
    throw new BuildError(`invalid SHA-256 fingerprint: ${value}`);
  }
  return compactValue.match(/.{2}/g)?.join(":") || "";
}

/**
 * @param {string} outputPath
 * @param {string} suffix
 * @returns {string}
 */
function matchingOutputPath(outputPath, suffix) {
  const parsed = path.parse(outputPath);
  return path.join(parsed.dir, `${parsed.name}${suffix}`);
}

/**
 * @param {string} mobileDir
 * @param {string} version
 * @returns {string}
 */
function defaultOutputPath(mobileDir, version) {
  const safeVersion = version.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "release";
  return path.join(mobileDir, "dist", `social-threader-${safeVersion}-android-release.aab`);
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}
