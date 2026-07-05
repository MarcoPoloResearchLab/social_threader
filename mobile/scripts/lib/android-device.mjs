import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const ANDROID_DEVICE_READY_TIMEOUT_MS = 90_000;
const ANDROID_ADB_COMMAND_TIMEOUT_MS = 15_000;
const ANDROID_INSTALL_COMMAND_TIMEOUT_MS = 120_000;
const ANDROID_APP_RENDER_TIMEOUT_MS = 45_000;
const ANDROID_LAUNCH_MAX_ATTEMPTS = 4;
const ANDROID_LAUNCH_RETRY_INTERVAL_MS = 5_000;
const EXPO_GO_PACKAGE = "host.exp.exponent";
const require = createRequire(import.meta.url);
const SOCIAL_THREADER_RENDER_MARKERS = Object.freeze([
  "Social Threader",
  "Paste or type text",
  "Share thread",
  "Attach image"
]);

let selectedAndroidSerial = "";

export async function launchAndroidExpoGo(port) {
  startAndroidEmulatorIfNeeded();
  await waitForAndroidDeviceReady();
  await ensureAndroidExpoGoInstalled();
  wakeAndroidDevice();
  configureAndroidPortForward(port);
  forceStopAndroidPackage(EXPO_GO_PACKAGE);
  await waitForAndroidAppRendered(`exp://127.0.0.1:${port}/--/`);
  console.log("Social Threader mobile: Android app rendered in Expo Go.");
}

function startAndroidEmulatorIfNeeded() {
  ensureAndroidAdbServer();
  const devices = listAndroidDevices();
  if (devices.error?.code === "ENOENT") {
    throw new Error("adb was not found. Install Android platform-tools or set ANDROID_SDK_ROOT.");
  }
  if (devices.error) throw devices.error;
  if (devices.ready.length > 0 || devices.present.length > 0) return;

  const avdName = resolveAndroidAvdName();
  if (!avdName) {
    throw new Error("No Android device is attached and no Android AVD is available. Create or start an Android emulator, then rerun make run-android.");
  }

  console.log(`Social Threader mobile: no Android device is attached; starting emulator ${avdName}.`);
  const child = spawn("emulator", ["-avd", avdName], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
}

function resolveAndroidAvdName() {
  const configuredName = String(process.env.SOCIAL_THREADER_ANDROID_AVD || process.env.ANDROID_AVD || "").trim();
  if (configuredName) return configuredName;

  const result = spawnSync("emulator", ["-list-avds"], {
    encoding: "utf8",
    stdio: "pipe",
    timeout: ANDROID_ADB_COMMAND_TIMEOUT_MS
  });
  if (result.error || result.status !== 0) return "";

  const avdNames = String(result.stdout || "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  return avdNames[0] || "";
}

async function waitForAndroidDeviceReady() {
  selectedAndroidSerial = "";
  const deadline = Date.now() + ANDROID_DEVICE_READY_TIMEOUT_MS;
  let lastState = "no Android device";

  while (Date.now() < deadline) {
    const devices = listAndroidDevices();
    if (devices.error?.code === "ENOENT") {
      throw new Error("adb was not found. Install Android platform-tools or set ANDROID_SDK_ROOT.");
    }
    if (devices.error) {
      lastState = devices.error.message;
    } else if (devices.ready.length > 0) {
      selectedAndroidSerial = chooseAndroidDeviceSerial(devices.ready);
      if (isAndroidBootComplete()) return;
      lastState = `waiting for Android device ${selectedAndroidSerial} to finish booting`;
    } else if (devices.present.length > 0) {
      lastState = `waiting for Android device ${devices.present[0].serial} (${devices.present[0].state})`;
    }
    await delay(1_000);
  }

  throw new Error(`Android device did not become ready within ${ANDROID_DEVICE_READY_TIMEOUT_MS / 1_000}s: ${lastState}`);
}

function listAndroidDevices() {
  const result = spawnSync("adb", ["devices"], {
    encoding: "utf8",
    stdio: "pipe",
    timeout: ANDROID_ADB_COMMAND_TIMEOUT_MS
  });
  if (result.error) return { error: result.error, present: [], ready: [] };
  if (result.status !== 0) {
    return { error: new Error(adbResultOutput(result) || "adb devices failed"), present: [], ready: [] };
  }

  const present = [];
  const lines = String(result.stdout || "").split(/\r?\n/).slice(1);
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    const [serial, state] = trimmedLine.split(/\s+/);
    if (serial && state) present.push({ serial, state });
  }

  return {
    present,
    ready: present.filter((device) => device.state === "device").map((device) => device.serial)
  };
}

function chooseAndroidDeviceSerial(serials) {
  return serials.find((serial) => serial.startsWith("emulator-")) || serials[0];
}

function isAndroidBootComplete() {
  const result = runAdb(["shell", "getprop", "sys.boot_completed"]);
  return result.status === 0 && String(result.stdout || "").trim() === "1";
}

async function ensureAndroidExpoGoInstalled() {
  const sdkVersion = resolveExpoSdkVersion();
  const installedVersion = getAndroidPackageVersion(EXPO_GO_PACKAGE);
  const sdkMajorVersion = sdkVersion.split(".")[0];
  if (installedVersion && installedVersion.startsWith(`${sdkMajorVersion}.`)) {
    return;
  }
  if (installedVersion) {
    console.log(`Social Threader mobile: replacing Expo Go ${installedVersion} with the SDK ${sdkVersion} build.`);
    runAdb(["uninstall", EXPO_GO_PACKAGE], { timeout: ANDROID_INSTALL_COMMAND_TIMEOUT_MS });
  } else {
    console.log(`Social Threader mobile: installing Expo Go for SDK ${sdkVersion}.`);
  }

  const apkPath = await downloadAndroidExpoGoApk(sdkVersion);
  const installResult = runAdb(["install", "-r", apkPath], { timeout: ANDROID_INSTALL_COMMAND_TIMEOUT_MS });
  if (installResult.error?.code === "ENOENT") {
    throw new Error("adb was not found. Install Android platform-tools or set ANDROID_SDK_ROOT.");
  }
  if (installResult.error) throw new Error(installResult.error.message);
  if (installResult.status !== 0) {
    const reason = adbResultOutput(installResult);
    throw new Error(`unable to install Expo Go${reason ? `: ${reason}` : ""}`);
  }
}

function getAndroidPackageVersion(packageName) {
  const pathResult = runAdb(["shell", "pm", "path", packageName]);
  if (pathResult.status !== 0 || !String(pathResult.stdout || "").trim()) {
    return "";
  }
  const result = runAdb(["shell", "dumpsys", "package", packageName]);
  if (result.error?.code === "ENOENT") {
    throw new Error("adb was not found. Install Android platform-tools or set ANDROID_SDK_ROOT.");
  }
  if (result.error) throw new Error(result.error.message);
  if (result.status !== 0) {
    return "";
  }
  const match = String(result.stdout || "").match(/\bversionName=([^\s]+)/);
  return match?.[1] || "";
}

function resolveExpoSdkVersion() {
  const expoPackage = require("expo/package.json");
  const majorVersion = String(expoPackage.version || "").match(/^([0-9]+)\./)?.[1];
  if (!majorVersion) {
    throw new Error(`Unable to infer Expo SDK version from expo package version ${expoPackage.version}`);
  }
  return `${majorVersion}.0.0`;
}

async function downloadAndroidExpoGoApk(sdkVersion) {
  const { downloadExpoGoAsync } = require("expo/node_modules/@expo/cli/build/src/utils/downloadExpoGoAsync.js");
  return downloadExpoGoAsync("android", { sdkVersion });
}

function wakeAndroidDevice() {
  runAdb(["shell", "input", "keyevent", "KEYCODE_WAKEUP"]);
  runAdb(["shell", "wm", "dismiss-keyguard"]);
}

function configureAndroidPortForward(port) {
  runAdb(["reverse", "--remove", `tcp:${port}`]);
  const result = runAdb(["reverse", `tcp:${port}`, `tcp:${port}`]);
  if (result.error?.code === "ENOENT") {
    throw new Error("adb was not found. Install Android platform-tools or set ANDROID_SDK_ROOT.");
  }
  if (result.error) throw new Error(result.error.message);
  if (result.status !== 0) {
    const reason = adbResultOutput(result);
    throw new Error(`adb reverse tcp:${port} tcp:${port} failed${reason ? `: ${reason}` : ""}`);
  }
  console.log(`Social Threader mobile: Android Expo Go will use host port ${port}.`);
}

function forceStopAndroidPackage(packageName) {
  runAdb(["shell", "am", "force-stop", packageName]);
}

async function waitForAndroidAppRendered(url) {
  const deadline = Date.now() + ANDROID_APP_RENDER_TIMEOUT_MS;
  let launchAttempts = 0;
  let nextRetryAt = 0;
  let lastState = "Social Threader UI markers were not visible";

  while (Date.now() < deadline) {
    if (launchAttempts === 0 || (Date.now() >= nextRetryAt && launchAttempts < ANDROID_LAUNCH_MAX_ATTEMPTS)) {
      launchAttempts += 1;
      wakeAndroidDevice();
      launchAndroidExpoUrl(url);
      console.log(`Social Threader mobile: launched Android Expo Go at ${url} (${launchAttempts}/${ANDROID_LAUNCH_MAX_ATTEMPTS}).`);
      nextRetryAt = Date.now() + ANDROID_LAUNCH_RETRY_INTERVAL_MS;
    }

    const hierarchy = readAndroidWindowHierarchy();
    if (hierarchy.error?.code === "ENOENT") {
      throw new Error("adb was not found. Install Android platform-tools or set ANDROID_SDK_ROOT.");
    }
    if (hierarchy.error) {
      lastState = hierarchy.error.message;
    } else if (androidHierarchyHasSocialThreaderApp(hierarchy.xml)) {
      return;
    } else {
      lastState = androidVisibleState(hierarchy.xml);
    }
    await delay(1_000);
  }

  throw new Error(`Android Expo Go opened, but Social Threader did not render within ${ANDROID_APP_RENDER_TIMEOUT_MS / 1_000}s: ${lastState}`);
}

function launchAndroidExpoUrl(url) {
  const result = runAdb([
    "shell",
    "am",
    "start",
    "-W",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    url
  ]);
  if (result.error) throw new Error(result.error.message);
  if (result.status !== 0) {
    const reason = adbResultOutput(result);
    throw new Error(`unable to launch Android Expo Go${reason ? `: ${reason}` : ""}`);
  }
}

function readAndroidWindowHierarchy() {
  const dump = runAdb(["shell", "uiautomator", "dump", "/sdcard/social-threader-window.xml"]);
  if (dump.error) return { error: dump.error, xml: "" };
  if (dump.status !== 0) return { error: new Error(adbResultOutput(dump) || "uiautomator dump failed"), xml: "" };

  const cat = runAdb(["shell", "cat", "/sdcard/social-threader-window.xml"]);
  if (cat.error) return { error: cat.error, xml: "" };
  if (cat.status !== 0) return { error: new Error(adbResultOutput(cat) || "uiautomator cat failed"), xml: "" };
  return { error: null, xml: String(cat.stdout || "") };
}

function androidHierarchyHasSocialThreaderApp(xml) {
  const hierarchy = String(xml || "");
  if (androidHierarchyHasExpoError(hierarchy)) return false;
  return SOCIAL_THREADER_RENDER_MARKERS.some((marker) => hierarchy.includes(marker));
}

function androidHierarchyHasExpoError(xml) {
  const hierarchy = String(xml || "");
  return hierarchy.includes("Cannot connect to Expo CLI")
    || hierarchy.includes("Failed to download remote update")
    || hierarchy.includes("Something went wrong");
}

function androidVisibleState(xml) {
  const hierarchy = String(xml || "");
  const visibleStrings = androidVisibleStrings(hierarchy);
  if (androidHierarchyHasExpoError(hierarchy)) {
    return visibleStrings.length ? `Expo Go error screen: ${visibleStrings.join(" / ")}` : "Expo Go error screen";
  }
  if (hierarchy.includes(`package="${EXPO_GO_PACKAGE}"`)) {
    return visibleStrings.length
      ? `Expo Go visible without Social Threader UI markers: ${visibleStrings.join(" / ")}`
      : "Expo Go visible without Social Threader UI markers";
  }
  return visibleStrings.length ? `visible strings: ${visibleStrings.join(" / ")}` : "unknown visible screen";
}

function androidVisibleStrings(xml) {
  const visibleStrings = [];
  for (const attr of ["text", "content-desc", "hint"]) {
    const pattern = new RegExp(`\\b${attr}="([^"]{1,120})"`, "g");
    for (const match of String(xml || "").matchAll(pattern)) {
      const value = match[1].trim();
      if (value && !visibleStrings.includes(value)) visibleStrings.push(value);
      if (visibleStrings.length >= 5) return visibleStrings;
    }
  }
  return visibleStrings;
}

function ensureAndroidAdbServer() {
  spawnSync("adb", ["start-server"], {
    encoding: "utf8",
    stdio: "pipe",
    timeout: ANDROID_ADB_COMMAND_TIMEOUT_MS
  });
}

function runAdb(args, options = {}) {
  const adbArgs = selectedAndroidSerial ? ["-s", selectedAndroidSerial, ...args] : args;
  return spawnSync("adb", adbArgs, {
    encoding: "utf8",
    stdio: "pipe",
    timeout: options.timeout ?? ANDROID_ADB_COMMAND_TIMEOUT_MS
  });
}

function adbResultOutput(result) {
  return [result.stderr, result.stdout]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("\n");
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
