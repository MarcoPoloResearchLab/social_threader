// @ts-check
import fs from "node:fs";
import path from "node:path";

/** Apply source-owned changes after Expo generates Android source.
 * @param {string} mobileRoot
 */
const SIGNING_ENV_PREFIX = "SOCIAL_THREADER_ANDROID_UPLOAD";

export function prepareAndroidNative(mobileRoot) {
 const gradlePath=path.join(mobileRoot,"android/app/build.gradle");
 enableReleaseMinification(path.join(mobileRoot,"android/gradle.properties"));
 patchReleaseSigning(gradlePath);
 let source=fs.readFileSync(gradlePath,"utf8");
 const replacements=[
  [/entryFile = file\(.*\)/, 'entryFile = file("../../index.js")'],
  [/\/\/ Use Expo CLI to bundle the app, this ensures the Metro config\n    \/\/ works correctly with Expo projects\./, '// Use React Native CLI to create the Android bundle.'],
  [/cliFile = new File\(.*\)/, 'cliFile = new File(["node", "--print", "require.resolve(\'@react-native-community/cli/build/bin.js\')"].execute(null, rootDir).text.trim())'],
  [/bundleCommand = "export:embed"/, 'bundleCommand = "bundle"'],
  [/versionCode \d+/, 'versionCode Integer.parseInt(System.getenv("SOCIAL_THREADER_ANDROID_ARTIFACT_VERSION_CODE") ?: "0")'],
  [/versionName "[^"]+"/, 'versionName System.getenv("SOCIAL_THREADER_ANDROID_ARTIFACT_VERSION_NAME") ?: ""']
 ];
 for (const [pattern,replacement] of replacements) {
  if (!pattern.test(source)) throw new Error(`Android preparation cannot locate ${pattern}`);
  source=source.replace(pattern,replacement);
 }
 fs.writeFileSync(gradlePath,source);
 normalizeGeneratedText(mobileRoot);
}

/** Normalize the two generated text files before receipt creation.
 * @param {string} mobileRoot
 */
function normalizeGeneratedText(mobileRoot) {
 const batchPath = path.join(mobileRoot, "android/gradlew.bat");
 const batch = fs.readFileSync(batchPath, "utf8").replace(/\r\n/g, "\n");
 fs.writeFileSync(batchPath, batch);
 const settingsPath = path.join(mobileRoot, "android/settings.gradle");
 const settings = fs.readFileSync(settingsPath, "utf8").replace(/\r\n/g, "\n")
   .replace(/[ \t]+$/gm, "").replace(/\n*$/, "\n");
 fs.writeFileSync(settingsPath, settings);
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
      throw new Error(`could not find generated signingConfigs block in ${buildGradlePath}`);
    }
    text = text.replace(debugSigningBlock, releaseSigningBlock);
  }

  const debugReleaseLine = "            signingConfig signingConfigs.debug";
  const uploadReleaseLine = "            signingConfig signingConfigs.release";
  const buildTypesIndex = text.indexOf("    buildTypes {");
  if (buildTypesIndex === -1) {
    throw new Error(`could not find buildTypes block in ${buildGradlePath}`);
  }
  const releaseIndex = text.indexOf("        release {", buildTypesIndex);
  if (releaseIndex === -1) {
    throw new Error(`could not find release buildType in ${buildGradlePath}`);
  }
  const releaseEnd = findGradleBlockEnd(text, releaseIndex);
  let releaseBlock = text.slice(releaseIndex, releaseEnd);
  if (!releaseBlock.includes(uploadReleaseLine)) {
    if (!releaseBlock.includes(debugReleaseLine)) {
      throw new Error(`could not find release signingConfig line in ${buildGradlePath}`);
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
    throw new Error("could not find Gradle block opening brace");
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
  throw new Error("could not find Gradle block closing brace");
}


/** @param {string} filePath @returns {Record<string,string>} */
function readProperties(filePath) {
 return Object.fromEntries(fs.readFileSync(filePath,"utf8").split(/\r?\n/).filter(line => line.includes("=") && !line.trim().startsWith("#")).map(line => { const split=line.indexOf("="); return [line.slice(0,split).trim(),line.slice(split+1).trim()]; }));
}
/** @param {string} filePath @param {Record<string,string>} values */
function writeProperties(filePath,values) { fs.writeFileSync(filePath,Object.entries(values).sort().map(([key,value])=>`${key}=${value}`).join("\n")+"\n"); }
