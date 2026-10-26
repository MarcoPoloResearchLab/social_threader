// @ts-check
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const MOBILE_ROOT = path.resolve(import.meta.dirname, "..");
const BUILDER = path.join(MOBILE_ROOT, "scripts/build-android-bundle.mjs");
const VERIFIER = path.join(MOBILE_ROOT, "scripts/verify-android-preparation.mjs");

/** @param {(root: string) => void} scenario */
function withFixture(scenario) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "social-android-contract-"));
  try {
    for (const directory of ["home", "tmp", "jdk/bin", "sdk", "mobile", "build"]) {
      fs.mkdirSync(path.join(root, directory), { recursive: true });
    }
    for (const filename of ["java", "jarsigner"]) fs.writeFileSync(path.join(root, "jdk/bin", filename), "synthetic sentinel");
    for (const filename of ["app.json", "android-release-identity.json", "package.json", "package-lock.json"]) {
      fs.copyFileSync(path.join(MOBILE_ROOT, filename), path.join(root, "mobile", filename));
    }
    fs.writeFileSync(path.join(root, "build/preserve.txt"), "existing build remains intact");
    scenario(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** @param {string} root */
function closedEnvironment(root) {
  return { PATH: "", HOME: path.join(root, "home"), TMPDIR: path.join(root, "tmp"),
    TMP: path.join(root, "tmp"), TEMP: path.join(root, "tmp"), CI: "1",
    JAVA_HOME: path.join(root, "jdk"), ANDROID_SDK_ROOT: path.join(root, "sdk") };
}

test("Android builder rejects absent preparation before Java, signing, provider or build effects", () => {
  withFixture((root) => {
    const result = spawnSync(process.execPath, [BUILDER,
      "--mobile-dir", path.join(root, "mobile"), "--build-dir", path.join(root, "build"),
      "--java-home", path.join(root, "jdk"), "--android-sdk-root", path.join(root, "sdk"),
      "--keystore-properties", path.join(root, "missing.properties"), "--version-code", "local"
    ], { env: closedEnvironment(root), encoding: "utf8", input: "", timeout: 5000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /Android preparation/i);
    assert.doesNotMatch(result.stderr, /signing properties|keystore|could not find a JDK/i);
    assert.equal(fs.readFileSync(path.join(root, "build/preserve.txt"), "utf8"), "existing build remains intact");
    assert.equal(result.stdout, "");
  });
});

test("dependency-free Android verifier rejects an absent preparation receipt through its public CLI", () => {
  withFixture((root) => {
    const result = spawnSync(process.execPath, [VERIFIER, "--mobile-dir", path.join(root, "mobile")], {
      env: closedEnvironment(root), encoding: "utf8", input: "", timeout: 5000
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /Android preparation/i);
    assert.doesNotMatch(result.stderr, /MODULE_NOT_FOUND/);
  });
});

/** @param {string} root */
async function prepareFixture(root) {
  const mobileRoot = path.join(root, "mobile");
  for (const filename of ["app.config.js", "babel.config.js", "metro.config.js", "index.js"]) {
    fs.copyFileSync(path.join(MOBILE_ROOT, filename), path.join(mobileRoot, filename));
  }
  for (const directory of ["assets", "scripts", "plugins"]) {
    fs.cpSync(path.join(MOBILE_ROOT, directory), path.join(mobileRoot, directory), { recursive: true });
  }
  for (const filename of ["gradlew", "gradlew.bat", "gradle/wrapper/gradle-wrapper.jar",
    "gradle/wrapper/gradle-wrapper.properties", "settings.gradle", "build.gradle", "gradle.properties",
    "app/build.gradle", "app/src/main/AndroidManifest.xml"]) {
    const destination = path.join(mobileRoot, "android", filename);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(MOBILE_ROOT, "android", filename), destination);
  }
  const { recordAndroidPreparation } = await import("./lib/android-preparation.mjs");
  recordAndroidPreparation(mobileRoot);
}

/** @param {string} root @param {string[]} extra @param {Record<string,string>} environment */
function invokeBuilder(root, extra = [], environment = {}) {
  return spawnSync(process.execPath, [BUILDER, "--mobile-dir", path.join(root, "mobile"),
    "--build-dir", path.join(root, "build"), "--java-home", path.join(root, "jdk"),
    "--android-sdk-root", path.join(root, "sdk"), "--version-code", "local", ...extra], {
    cwd: root, env: { ...closedEnvironment(root), ...environment }, encoding: "utf8", input: "", timeout: 5000
  });
}

// Keep fixture cleanup alive across asynchronous module loading.
/** @param {(root:string)=>Promise<void>} scenario */
async function withPreparedFixture(scenario) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "social-android-prepared-"));
  try {
    for (const directory of ["home", "tmp", "jdk/bin", "sdk", "mobile", "build"]) fs.mkdirSync(path.join(root,directory),{recursive:true});
    for (const filename of ["java", "jarsigner"]) fs.writeFileSync(path.join(root,"jdk/bin",filename),"synthetic sentinel");
    for (const filename of ["app.json","android-release-identity.json","package.json","package-lock.json"]) fs.copyFileSync(path.join(MOBILE_ROOT,filename),path.join(root,"mobile",filename));
    fs.writeFileSync(path.join(root,"build/preserve.txt"),"existing build remains intact");
    await prepareFixture(root);
    await scenario(root);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
}

test("Android preparation records semantic facts without file fingerprints", async () => {
  await withPreparedFixture(async root => {
    const record = JSON.parse(fs.readFileSync(path.join(root, "mobile/android/preparation.json"), "utf8"));
    assert.equal(Object.hasOwn(record, "inputs"), false);
    assert.equal(Object.hasOwn(record, "outputs"), false);
  });
});

test("Android verification accepts regenerated native metadata without a configuration change", async () => {
  await withPreparedFixture(async root => {
    fs.appendFileSync(path.join(root, "mobile/android/app/build.gradle"), "\n// Native tooling regenerated project metadata\n");
    fs.writeFileSync(path.join(root, "mobile/android/local.properties"), "sdk.dir=/synthetic/local-sdk\n");
    const result = spawnSync(process.execPath, [VERIFIER, "--mobile-dir", path.join(root, "mobile")], {
      env: closedEnvironment(root), encoding: "utf8", input: "", timeout: 5000
    });
    assert.equal(result.status, 0, result.stderr);
  });
});

for (const scenario of [
  { name: "missing Gradle settings", change: root => fs.rmSync(path.join(root, "mobile/android/settings.gradle")) },
  { name: "application identifier mismatch", change: root => {
    const filename = path.join(root, "mobile/app.json");
    const app = JSON.parse(fs.readFileSync(filename, "utf8"));
    app.expo.android.package = "com.mprlab.wrong";
    fs.writeFileSync(filename, JSON.stringify(app));
  } },
  { name: "application version mismatch", change: root => {
    const filename = path.join(root, "mobile/app.json");
    const app = JSON.parse(fs.readFileSync(filename, "utf8"));
    app.expo.version = "1.0.1";
    fs.writeFileSync(filename, JSON.stringify(app));
  } },
  { name: "native namespace mismatch", change: root => {
    const filename = path.join(root, "mobile/android/app/build.gradle");
    fs.writeFileSync(filename, fs.readFileSync(filename, "utf8").replace("namespace 'com.mprlab.socialthreader'", "namespace 'com.mprlab.wrong'"));
  } }
]) {
  test(`Android verifier and builder reject ${scenario.name} before signing or native effects`, async () => {
    await withPreparedFixture(async root => {
      scenario.change(root);
      const rejected = spawnSync(process.execPath, [VERIFIER, "--mobile-dir", path.join(root, "mobile")], {
        env: closedEnvironment(root), encoding: "utf8", input: "", timeout: 5000
      });
      assert.equal(rejected.status, 2, rejected.stderr);
      assert.match(rejected.stderr, /Android preparation/);
      const builder = invokeBuilder(root, ["--keystore-properties", path.join(root, "missing.properties")]);
      assert.equal(builder.status, 2, builder.stderr);
      assert.match(builder.stderr, /Android preparation/);
      assert.equal(fs.readFileSync(path.join(root, "build/preserve.txt"), "utf8"), "existing build remains intact");
    });
  });
}

for (const [setting, environmentName, constant] of [
  ["versionName", "SOCIAL_THREADER_ANDROID_ARTIFACT_VERSION_NAME", '\"1.0.0\"'],
  ["versionCode", "SOCIAL_THREADER_ANDROID_ARTIFACT_VERSION_CODE", "1"]
]) {
  test(`Android verifier rejects a constant ${setting} with the lifecycle input mentioned only in a comment`, async () => {
    await withPreparedFixture(async root => {
      const filename = path.join(root, "mobile/android/app/build.gradle");
      const gradle = fs.readFileSync(filename, "utf8");
      fs.writeFileSync(filename, gradle.replace(new RegExp(`^\\s*${setting} .+$`, "m"), `        ${setting} ${constant} // ${environmentName}`));
      const result = spawnSync(process.execPath, [VERIFIER, "--mobile-dir", path.join(root, "mobile")], {
        env: closedEnvironment(root), encoding: "utf8", input: "", timeout: 5000
      });
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, new RegExp(`${setting} lifecycle assignment`));
      const builder = invokeBuilder(root, ["--keystore-properties", path.join(root, "missing.properties")]);
      assert.equal(builder.status, 2, builder.stderr);
      assert.match(builder.stderr, new RegExp(`${setting} lifecycle assignment`));
    });
  });
}

test("Android prepared file copy selects public files and excludes private, local, and cached inputs", async () => {
  await withPreparedFixture(async root => {
    const mobile = path.join(root, "mobile");
    const added = "android/app/src/main/generated/NativeMetadata.txt";
    fs.mkdirSync(path.dirname(path.join(mobile, added)), { recursive: true });
    fs.writeFileSync(path.join(mobile, added), "current native metadata\n");
    const excluded = ["android/local.properties", "android/.env.release", "android/upload.jks",
      "android/release.keystore", "android/distribution.p12", "android/AuthKey_fixture.p8",
      "android/release-keystore.properties", "android/.gradle/cache.txt", "android/.kotlin/cache.txt",
      "android/.cxx/cache.txt", "android/build/generated.txt", "android/app/build/generated.txt"];
    for (const filename of excluded) {
      fs.mkdirSync(path.dirname(path.join(mobile, filename)), { recursive: true });
      fs.writeFileSync(path.join(mobile, filename), "synthetic private or local input\n");
    }
    const destination = path.join(root, "copied");
    const { copyPreparedAndroid } = await import("./lib/android-preparation.mjs");
    copyPreparedAndroid(mobile, destination);
    assert.equal(fs.readFileSync(path.join(destination, added), "utf8"), "current native metadata\n");
    for (const filename of excluded) assert.equal(fs.existsSync(path.join(destination, filename)), false, filename);
  });
});

test("Android prepared file copy rejects a native symlink", async () => {
  await withPreparedFixture(async root => {
    const mobile = path.join(root, "mobile");
    fs.symlinkSync(path.join(mobile, "android/settings.gradle"), path.join(mobile, "android/native-settings-link"));
    const { copyPreparedAndroid } = await import("./lib/android-preparation.mjs");
    assert.throws(() => copyPreparedAndroid(mobile, path.join(root, "copied")), /rejects a non-file entry/);
  });
});

test("Android signing requires an explicit direct selection and ignores ambient private-path bait", async () => {
  await withPreparedFixture(async root => {
    const result = invokeBuilder(root,[],{
      SOCIAL_THREADER_ANDROID_KEYSTORE_PROPERTIES:path.join(root,"ambient.properties"),
      SOCIAL_THREADER_ANDROID_UPLOAD_STORE_FILE:path.join(root,"ambient.jks")
    });
    assert.equal(result.status,2,result.stderr);
    assert.match(result.stderr,/require --keystore-properties/);
    assert.doesNotMatch(result.stderr,/ambient\.properties|ambient\.jks/);
  });
});

test("Android signing rejects missing storeFile before keystore or native access", async () => {
  await withPreparedFixture(async root => {
    const properties=path.join(root,"selected.properties");
    fs.writeFileSync(properties,"storePassword=synthetic-password\nkeyAlias=synthetic-alias\nkeyPassword=synthetic-key-password\n");
    const result=invokeBuilder(root,["--keystore-properties",properties],{SOCIAL_THREADER_ANDROID_UPLOAD_STORE_FILE:path.join(root,"ambient.jks")});
    assert.equal(result.status,2,result.stderr);
    assert.match(result.stderr,/missing signing property storeFile/);
    assert.doesNotMatch(result.stderr,/synthetic-password|synthetic-key-password|ambient\.jks/);
  });
});

test("Android lifecycle asks only the captured signing input and ignores the ambient selection", async () => {
  await withPreparedFixture(async root => {
    const selected=path.join(root,"captured.properties");
    fs.writeFileSync(selected,"storePassword=synthetic-password\nkeyAlias=synthetic-alias\nkeyPassword=synthetic-key-password\n");
    fs.writeFileSync(path.join(root,"private-environment-operation"),`
      const fs=require("node:fs");
      const request=JSON.parse(fs.readFileSync(0,"utf8"));
      fs.writeFileSync("capture-request.json",JSON.stringify(request));
      process.stdout.write(JSON.stringify({SOCIAL_THREADER_ANDROID_KEYSTORE_PROPERTIES:${JSON.stringify(selected)}}));
    `);
    const result=invokeBuilder(root,[],{MPRLAB_APP_ROOT:root,MPRLAB_GATEWAY_EXECUTABLE:process.execPath,
      MPRLAB_LIFECYCLE_OPERATION:"release",SOCIAL_THREADER_ANDROID_KEYSTORE_PROPERTIES:path.join(root,"ambient.properties")});
    assert.equal(result.status,2,result.stderr);
    assert.match(result.stderr,/missing signing property storeFile/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,"capture-request.json"),"utf8")),{
      root,keys:["SOCIAL_THREADER_ANDROID_KEYSTORE_PROPERTIES"]
    });
    assert.doesNotMatch(result.stderr,/synthetic-password|ambient\.properties/);
  });
});

/** @param {string} root */
function makeFixture(root) {
  fs.copyFileSync(path.join(MOBILE_ROOT,"../Makefile"),path.join(root,"Makefile"));
  const effect=path.join(root,"effect.mjs");
  fs.writeFileSync(effect,`import fs from "node:fs"; fs.appendFileSync(${JSON.stringify(path.join(root,"effects.jsonl"))},JSON.stringify(process.argv.slice(2))+"\\n");`);
  return { effect, record:path.join(root,"effects.jsonl") };
}

test("parallel Make rejects missing Android preparation before install, checks and build", async () => {
  await withPreparedFixture(async root => {
    const fixture=makeFixture(root);
    fs.rmSync(path.join(root,"mobile/android/settings.gradle"));
    const result=spawnSync("/usr/bin/make",["-j8","mobile-android-bundle",
      `MOBILE_NPM=${process.execPath} ${fixture.effect}`,`MOBILE_ANDROID_BUNDLE_SCRIPT=${fixture.effect}`],{
      cwd:root,env:{...closedEnvironment(root),PATH:path.dirname(process.execPath)},encoding:"utf8",input:"",timeout:5000
    });
    assert.equal(result.status,2,result.stderr);
    assert.match(result.stderr,/Android preparation/);
    assert.equal(fs.existsSync(fixture.record),false,"install/check/build program executed before preparation gate");
  });
});

test("parallel Make reaches install, check and build only after fresh Android preparation", async () => {
  await withPreparedFixture(async root => {
    const fixture=makeFixture(root);
    const result=spawnSync("/usr/bin/make",["-j8","mobile-android-bundle",
      `MOBILE_NPM=${process.execPath} ${fixture.effect}`,`MOBILE_ANDROID_BUNDLE_SCRIPT=${fixture.effect}`],{
      cwd:root,env:{...closedEnvironment(root),PATH:`${path.dirname(process.execPath)}:/usr/bin:/bin`},encoding:"utf8",input:"",timeout:5000
    });
    assert.equal(result.status,0,result.stderr);
    const effects=fs.readFileSync(fixture.record,"utf8").trim().split("\n").map(line=>JSON.parse(line));
    assert.deepEqual(effects.slice(0,2),[["ci"],["run","check"]]);
    assert.ok(effects[2].includes("--version-code"));
  });
});

test("parallel CI rejects absent iOS preparation before any Android or CI effect", async () => {
  await withPreparedFixture(async root => {
    const fixture=makeFixture(root);
    const overrides=path.join(root,"ci-effects.mk");
    const effectTargets=["test-installed-gateway","test-product-catalog","test-local-tauth-fixture",
      "browser-test","go-test","go-vet","go-format-check","shell-check","go-mod-verify",
      "mobile-install","mobile-check","test-ios-build","test-android-build"];
    fs.writeFileSync(overrides,effectTargets.map(target=>`${target}:\n\t@${process.execPath} ${fixture.effect} ${target}\n`).join("\n"));
    const result=spawnSync("/usr/bin/make",["-j8","-f","Makefile","-f",overrides,"ci"],{
      cwd:root,env:{...closedEnvironment(root),PATH:`${path.dirname(process.execPath)}:/usr/bin:/bin`},encoding:"utf8",input:"",timeout:5000
    });
    assert.equal(result.status,2,result.stderr);
    assert.match(result.stderr,/iOS preparation/);
    assert.equal(fs.existsSync(fixture.record),false,"CI effects executed before both preparation checks");
  });
});

/** Create a controlled child program through ordinary file copy and content writes.
 * @param {string} filename @param {string} source
 */
function nativeFixtureProgram(filename, source) {
  fs.mkdirSync(path.dirname(filename),{recursive:true});
  fs.copyFileSync(process.execPath,filename);
  fs.writeFileSync(filename,`#!${process.execPath}\n${source}\n`);
}

test("real Android builder forces computed versions over ambient bait and preserves signed AAB validation", async () => {
  await withPreparedFixture(async root => {
    const mobile=path.join(root,"mobile");
    const identity=JSON.parse(fs.readFileSync(path.join(mobile,"android-release-identity.json"),"utf8"));
    const app=JSON.parse(fs.readFileSync(path.join(mobile,"app.json"),"utf8")).expo;
    const trace=path.join(root,"native-trace.jsonl");
    const state=path.join(root,"gradle-state.json");
    const prefix=`const fs=require("node:fs"); const path=require("node:path"); fs.appendFileSync(${JSON.stringify(trace)},JSON.stringify({program:path.basename(process.argv[1]),args:process.argv.slice(2)})+"\\n");`;
    const properties=path.join(root,"selected.properties");
    fs.writeFileSync(path.join(root,"upload.jks"),"synthetic upload store");
    fs.writeFileSync(properties,"storeFile=upload.jks\nstorePassword=synthetic-password\nkeyAlias=synthetic-alias\nkeyPassword=synthetic-key-password\n");
    nativeFixtureProgram(path.join(root,"jdk/bin/keytool"),prefix+`process.stdout.write("Owner: CN=Synthetic\\nSHA256: ${identity.uploadKey.sha256}\\n");`);
    nativeFixtureProgram(path.join(root,"jdk/bin/jarsigner"),prefix);
    nativeFixtureProgram(path.join(root,"programs/npm"),prefix+`if(process.argv.includes("prebuild"))process.exit(97);`);
    nativeFixtureProgram(path.join(root,"programs/unzip"),prefix);
    nativeFixtureProgram(path.join(root,"programs/bundletool"),prefix+`
      if(process.argv[2]==="dump") {
        const state=JSON.parse(fs.readFileSync(${JSON.stringify(state)},"utf8"));
        const selector=process.argv.find(argument=>argument.startsWith("--xpath="));
        process.stdout.write(selector.endsWith("@package")?${JSON.stringify(app.android.package)}:selector.endsWith("@android:versionCode")?state.code:state.version);
      }
    `);
    nativeFixtureProgram(path.join(mobile,"android/gradlew"),prefix+`
      const state={version:process.env.SOCIAL_THREADER_ANDROID_ARTIFACT_VERSION_NAME,code:process.env.SOCIAL_THREADER_ANDROID_ARTIFACT_VERSION_CODE};
      fs.writeFileSync(${JSON.stringify(state)},JSON.stringify(state));
      const outputs=["app/build/outputs/bundle/release/app-release.aab","app/build/outputs/mapping/release/mapping.txt"];
      for(const file of outputs){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,"synthetic validated output");}
    `);
    const { recordAndroidPreparation }=await import("./lib/android-preparation.mjs");
    recordAndroidPreparation(mobile);
    const output=path.join(root,"result.aab");
    const result=invokeBuilder(root,["--keystore-properties",properties,"--output",output],{
      PATH:`${path.join(root,"programs")}:/usr/bin:/bin`,
      SOCIAL_THREADER_ANDROID_ARTIFACT_VERSION_NAME:"ambient-version-bait",
      SOCIAL_THREADER_ANDROID_ARTIFACT_VERSION_CODE:"999999999",
      SOCIAL_THREADER_ANDROID_UPLOAD_STORE_FILE:path.join(root,"ambient.jks")
    });
    assert.equal(result.error,undefined);
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(state,"utf8")),{version:app.version,code:String(app.android.versionCode)});
    const metadata=JSON.parse(fs.readFileSync(path.join(root,"result.json"),"utf8"));
    assert.equal(metadata.androidPackage,app.android.package);
    assert.equal(metadata.versionName,app.version);
    assert.equal(metadata.versionCode,app.android.versionCode);
    assert.equal(metadata.bundletoolValidated,true);
    assert.equal(metadata.jarSignature,"passed");
    assert.equal(metadata.releaseSigner,"passed");
    assert.equal(metadata.r8Minification,"enabled");
    assert.equal(metadata.keystore,undefined);
    assert.ok(fs.readFileSync(metadata.deobfuscationFile).length>0);
    assert.doesNotMatch(JSON.stringify(metadata),/synthetic-password|synthetic-key-password|upload\.jks/);
    const commands=fs.readFileSync(trace,"utf8").trim().split("\n").map(line=>JSON.parse(line));
    assert.deepEqual(commands.filter(command=>command.program==="npm").map(command=>command.args),[["ci","--include=dev"]]);
    assert.equal(commands.some(command=>command.args.includes("prebuild")),false);
    assert.equal(fs.existsSync(path.join(root,"build")),false);
  });
});

test("parallel CI checks Android configuration after valid iOS preparation and before CI effects", async () => {
  await withPreparedFixture(async root => {
    const mobile=path.join(root,"mobile");
    fs.copyFileSync(path.join(MOBILE_ROOT,"ios-release-identity.json"),path.join(mobile,"ios-release-identity.json"));
    const identity=JSON.parse(fs.readFileSync(path.join(mobile,"ios-release-identity.json"),"utf8"));
    for(const filename of ["Podfile","Podfile.lock","Podfile.properties.json",
      "SocialThreader.xcworkspace/contents.xcworkspacedata","SocialThreader.xcodeproj/project.pbxproj",
      "SocialThreader.xcodeproj/xcshareddata/xcschemes/SocialThreader.xcscheme","SocialThreader/Info.plist"]){
      const destination=path.join(mobile,"ios",filename);
      fs.mkdirSync(path.dirname(destination),{recursive:true});
      fs.copyFileSync(path.join(MOBILE_ROOT,"ios",filename),destination);
    }
    const {recordIosPreparation}=await import("./lib/ios-preparation.mjs");
    recordIosPreparation(mobile,{xcode:"Xcode 27.1\nBuild version 27A9275",cocoapods:"1.17.0"});
    fs.rmSync(path.join(mobile,"android/settings.gradle"));
    const fixture=makeFixture(root);
    const result=spawnSync("/usr/bin/make",["-j8","ci",`MOBILE_NPM=${process.execPath} ${fixture.effect}`],{
      cwd:root,env:{...closedEnvironment(root),PATH:`${path.dirname(process.execPath)}:/usr/bin:/bin`},encoding:"utf8",input:"",timeout:5000
    });
    assert.equal(result.status,2,result.stderr);
    assert.match(result.stdout,/iOS preparation satisfies/);
    assert.match(result.stderr,/Android preparation/);
    assert.equal(fs.existsSync(fixture.record),false);
  });
});


test("Android receipt rejects an explicitly selected local plugin outside the mobile root", async () => {
  await withPreparedFixture(async root => {
    fs.writeFileSync(path.join(root,"outside-plugin.js"),"module.exports = config => config;\n");
    const mobile=path.join(root,"mobile");
    const appPath=path.join(mobile,"app.json");
    const app=JSON.parse(fs.readFileSync(appPath,"utf8"));
    app.expo.plugins.push("../outside-plugin.js");
    fs.writeFileSync(appPath,JSON.stringify(app));
    const {recordAndroidPreparation}=await import("./lib/android-preparation.mjs");
    assert.throws(()=>recordAndroidPreparation(mobile),/local plugins must stay within the mobile root/);
  });
});

for (const [label,providerSource] of [
  ["failure", 'process.stderr.write("synthetic-private-value"); process.exit(23);'],
  ["cancellation", 'process.kill(process.pid,"SIGTERM");'],
  ["malformed response", 'process.stdout.write("synthetic-private-value not JSON");'],
  ["unexpected response key", 'process.stdout.write(JSON.stringify({SOCIAL_THREADER_ANDROID_KEYSTORE_PROPERTIES:"synthetic-selected",extra:"synthetic-private-value"}));'],
  ["missing response key", 'process.stdout.write("{}");']
]) {
  test(`Android capture ${label} stops before signing and build effects without private diagnostics`, async () => {
    await withPreparedFixture(async root => {
      fs.writeFileSync(path.join(root,"private-environment-operation"),providerSource);
      const result=invokeBuilder(root,[],{MPRLAB_APP_ROOT:root,MPRLAB_GATEWAY_EXECUTABLE:process.execPath,MPRLAB_LIFECYCLE_OPERATION:"release"});
      assert.equal(result.error,undefined);
      assert.equal(result.status,2,result.stderr);
      assert.match(result.stderr,/captured Android signing selection/);
      assert.doesNotMatch(result.stderr,/synthetic-private-value|synthetic-selected|missing signing property/);
      assert.equal(fs.readFileSync(path.join(root,"build/preserve.txt"),"utf8"),"existing build remains intact");
      assert.equal(result.stdout,"");
    });
  });
}

test("Android capture remains authoritative after the authored selection changes", async () => {
  await withPreparedFixture(async root => {
    const selected=path.join(root,"captured.properties");
    const changed=path.join(root,"changed.properties");
    const authored=path.join(root,"authored-selection.json");
    fs.writeFileSync(selected,"storePassword=synthetic-password\nkeyAlias=synthetic-alias\nkeyPassword=synthetic-key-password\n");
    fs.writeFileSync(changed,"storeFile=changed.jks\n");
    fs.writeFileSync(authored,JSON.stringify({SOCIAL_THREADER_ANDROID_KEYSTORE_PROPERTIES:selected}));
    fs.writeFileSync(path.join(root,"private-environment-operation"),`
      const fs=require("node:fs");
      const captured=JSON.parse(fs.readFileSync(${JSON.stringify(authored)},"utf8"));
      fs.writeFileSync(${JSON.stringify(authored)},JSON.stringify({SOCIAL_THREADER_ANDROID_KEYSTORE_PROPERTIES:${JSON.stringify(changed)}}));
      process.stdout.write(JSON.stringify(captured));
    `);
    const result=invokeBuilder(root,[],{MPRLAB_APP_ROOT:root,MPRLAB_GATEWAY_EXECUTABLE:process.execPath,
      MPRLAB_LIFECYCLE_OPERATION:"release",SOCIAL_THREADER_ANDROID_KEYSTORE_PROPERTIES:changed});
    assert.equal(result.status,2,result.stderr);
    assert.match(result.stderr,/missing signing property storeFile/);
    assert.doesNotMatch(result.stderr,/missing signing property keyAlias|missing signing property storePassword/);
    assert.equal(JSON.parse(fs.readFileSync(authored,"utf8")).SOCIAL_THREADER_ANDROID_KEYSTORE_PROPERTIES,changed);
  });
});

test("public Android preparation records provider success and accepts regenerated metadata", async () => {
  await withPreparedFixture(async root => {
    makeFixture(root);
    const mobile=path.join(root,"mobile");
    const generated=path.join(root,"generator-output");
    fs.cpSync(path.join(mobile,"android"),generated,{recursive:true});
    fs.writeFileSync(path.join(generated,"gradlew.bat"),"@echo off\r\ncall gradle %*\r\n");
    fs.writeFileSync(path.join(generated,"settings.gradle"),"pluginManagement { } \t\r\ninclude ':app'\t \r\n\r\n");
    const binary=Buffer.from([0,13,10,32,9,255,10]);
    fs.writeFileSync(path.join(generated,"gradle/wrapper/gradle-wrapper.jar"),binary);
    fs.writeFileSync(path.join(generated,"app/build.gradle"),`
def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()
react {
    entryFile = file("generated-entry.js")
    // Use Expo CLI to bundle the app, this ensures the Metro config
    // works correctly with Expo projects.
    cliFile = new File("generated-cli.js")
    bundleCommand = "export:embed"
}
android {
    namespace 'com.mprlab.socialthreader'
    defaultConfig {
        applicationId 'com.mprlab.socialthreader'
        versionCode 1
        versionName "1.0.0"
    }
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.debug
        }
    }
}
`);
    nativeFixtureProgram(path.join(root,"programs/npm"),`
      const fs=require("node:fs"),path=require("node:path");
      if(process.argv.includes("prebuild")){
        const target=path.join(process.cwd(),"android");
        fs.rmSync(target,{recursive:true,force:true});
        fs.cpSync(${JSON.stringify(generated)},target,{recursive:true});
      }
    `);
    const result=spawnSync("/usr/bin/make",["prepare-android"],{
      cwd:root,env:{...closedEnvironment(root),PATH:`${path.join(root,"programs")}:${path.dirname(process.execPath)}:/usr/bin:/bin`},
      encoding:"utf8",input:"",timeout:5000
    });
    assert.equal(result.error,undefined);
    assert.equal(result.status,0,result.stderr);
    assert.equal(fs.readFileSync(path.join(mobile,"android/gradlew.bat"),"utf8"),"@echo off\ncall gradle %*\n");
    assert.equal(fs.readFileSync(path.join(mobile,"android/settings.gradle"),"utf8"),"pluginManagement { }\ninclude ':app'\n");
    assert.deepEqual(fs.readFileSync(path.join(mobile,"android/gradle/wrapper/gradle-wrapper.jar")),binary);
    const verifier=spawnSync(process.execPath,[VERIFIER,"--mobile-dir",mobile],{env:closedEnvironment(root),encoding:"utf8",input:"",timeout:5000});
    assert.equal(verifier.status,0,verifier.stderr);
    const receipt=JSON.parse(fs.readFileSync(path.join(mobile,"android/preparation.json"),"utf8"));
    assert.equal(Object.hasOwn(receipt,"inputs"),false);
    assert.equal(Object.hasOwn(receipt,"outputs"),false);
    fs.writeFileSync(path.join(mobile,"android/gradlew.bat"),"@echo off\ncall gradle %*\n");
    fs.writeFileSync(path.join(mobile,"android/settings.gradle"),"pluginManagement { }\ninclude ':app'\n");
    const retained=spawnSync(process.execPath,[VERIFIER,"--mobile-dir",mobile],{env:closedEnvironment(root),encoding:"utf8",input:"",timeout:5000});
    assert.equal(retained.status,0,retained.stderr);
    assert.equal(JSON.parse(fs.readFileSync(path.join(mobile,"android/preparation.json"),"utf8")).schema,receipt.schema);
  });
});


test("public Android preparation does not record success after the native generator fails", async () => {
  await withPreparedFixture(async root => {
    makeFixture(root);
    const mobile = path.join(root, "mobile");
    fs.rmSync(path.join(mobile, "android/preparation.json"));
    nativeFixtureProgram(path.join(root, "programs/npm"), `
      if(process.argv.includes("prebuild")) {
        process.stderr.write("controlled Android generator failure");
        process.exit(23);
      }
    `);
    const result = spawnSync("/usr/bin/make", ["prepare-android"], {
      cwd: root,
      env: { ...closedEnvironment(root), PATH: `${path.join(root,"programs")}:${path.dirname(process.execPath)}:/usr/bin:/bin` },
      encoding: "utf8", input: "", timeout: 5000
    });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /controlled Android generator failure/);
    assert.equal(fs.existsSync(path.join(mobile, "android/preparation.json")), false);
  });
});
