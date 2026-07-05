#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";

import { launchAndroidExpoGo } from "./lib/android-device.mjs";
import { waitForMetroReady } from "./lib/metro.mjs";
import { findAvailablePort, parsePort } from "./lib/ports.mjs";

const DEFAULT_PORT = 8081;
const DEFAULT_SEARCH_LIMIT = 40;
const ANDROID_LAUNCH_FAILURE_SHUTDOWN_MS = 3_000;

main().catch((error) => {
  console.error(`Social Threader mobile: Android start failed: ${error.message}`);
  process.exit(1);
});

async function main() {
  const parsedArgs = parseArgs(process.argv.slice(2));
  const requestedPort =
    parsedArgs.port
    || parsePort(process.env.SOCIAL_THREADER_MOBILE_PORT)
    || parsePort(process.env.EXPO_PORT)
    || parsePort(process.env.RCT_METRO_PORT)
    || DEFAULT_PORT;
  const searchLimit = parsePort(process.env.SOCIAL_THREADER_MOBILE_PORT_SEARCH_LIMIT) || DEFAULT_SEARCH_LIMIT;
  const port = await findAvailablePort(requestedPort, searchLimit);
  const expoArgs = normalizeExpoArgs(parsedArgs.expoArgs, port);
  const commandText = `npx --no-install ${expoArgs.map(shellQuote).join(" ")}`;

  if (port !== requestedPort) {
    console.log(`Social Threader mobile: port ${requestedPort} is busy; using ${port}.`);
  } else {
    console.log(`Social Threader mobile: using Expo port ${port}.`);
  }

  if (parsedArgs.printCommand) {
    printAndroidLaunchCommands(port, commandText);
    return;
  }

  const child = spawn("npx", ["--no-install", ...expoArgs], {
    env: createExpoEnvironment(port),
    shell: process.platform === "win32",
    stdio: "inherit"
  });
  let forcedExitCode = null;
  let forcedExitTimer = null;

  openAndroidWhenMetroIsReady(port).catch((error) => {
    forcedExitCode = 1;
    console.error(`Social Threader mobile: Android launch verification failed: ${error.message}`);
    forcedExitTimer = stopChildForFailure(child);
  });

  child.on("exit", (code, signal) => {
    if (forcedExitTimer) clearTimeout(forcedExitTimer);
    if (signal) {
      if (forcedExitCode !== null) {
        process.exit(forcedExitCode);
        return;
      }
      process.kill(process.pid, signal);
      return;
    }
    process.exit(forcedExitCode ?? code ?? 0);
  });
}

async function openAndroidWhenMetroIsReady(port) {
  await waitForMetroReady(port);
  await launchAndroidExpoGo(port);
}

function parseArgs(args) {
  const expoArgs = [];
  let port = null;
  let printCommand = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--print-command") {
      printCommand = true;
      continue;
    }
    if (arg === "--port") {
      port = parsePort(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--port=")) {
      port = parsePort(arg.slice("--port=".length));
      continue;
    }
    if (arg === "--android") {
      continue;
    }
    expoArgs.push(arg);
  }

  return { expoArgs, port, printCommand };
}

function normalizeExpoArgs(expoArgs, port) {
  const normalizedArgs = ["expo", "start"];
  const hasHostArgument = expoArgs.some((arg) => arg === "--localhost" || arg === "--lan" || arg === "--tunnel");
  normalizedArgs.push(...expoArgs);
  if (!hasHostArgument) {
    normalizedArgs.push("--localhost");
  }
  normalizedArgs.push("--port", String(port));
  return normalizedArgs;
}

function createExpoEnvironment(port) {
  const childEnvironment = {
    ...process.env,
    EXPO_NO_TELEMETRY: "1",
    EXPO_PACKAGER_PORT: String(port),
    RCT_METRO_PORT: String(port),
    REACT_NATIVE_PACKAGER_HOSTNAME: "127.0.0.1",
    SOCIAL_THREADER_MOBILE_PORT: String(port)
  };
  childEnvironment.NODE_OPTIONS = appendNodeOption(process.env.NODE_OPTIONS, "--dns-result-order=ipv4first");
  delete childEnvironment.FORCE_COLOR;
  delete childEnvironment.NO_COLOR;
  return childEnvironment;
}

function appendNodeOption(currentValue, option) {
  const existingValue = String(currentValue || "").trim();
  if (existingValue.split(/\s+/).includes(option)) {
    return existingValue;
  }
  return existingValue ? `${existingValue} ${option}` : option;
}

function printAndroidLaunchCommands(port, commandText) {
  console.log("adb devices");
  console.log(`adb reverse tcp:${port} tcp:${port}`);
  console.log(`adb shell am start -W -a android.intent.action.VIEW -d exp://127.0.0.1:${port}/--/`);
  console.log(commandText);
}

function stopChildForFailure(child) {
  if (child.exitCode !== null || child.signalCode !== null) return null;

  child.kill("SIGTERM");
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
    process.exit(1);
  }, ANDROID_LAUNCH_FAILURE_SHUTDOWN_MS);
  timer.unref();
  return timer;
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}
