#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";

import { launchAndroidExpoGo } from "./lib/android-device.mjs";
import {
  createExpoEnvironment,
  resolvePortSearchLimit,
  resolveRequestedPort,
  toShellCommand
} from "./lib/expo-local-run.mjs";
import { waitForMetroReady } from "./lib/metro.mjs";
import { findAvailablePort, parsePort } from "./lib/ports.mjs";

const ANDROID_LAUNCH_FAILURE_SHUTDOWN_MS = 3_000;

main().catch((error) => {
  console.error(`Social Threader mobile: Android start failed: ${error.message}`);
  process.exit(1);
});

async function main() {
  const parsedArgs = parseArgs(process.argv.slice(2));
  const requestedPort = resolveRequestedPort(parsedArgs.port);
  const searchLimit = resolvePortSearchLimit();
  const port = await findAvailablePort(requestedPort, searchLimit);
  const expoArgs = normalizeExpoArgs(parsedArgs.expoArgs, port);
  const commandText = toShellCommand("npx", ["--no-install", ...expoArgs]);

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
    env: createExpoEnvironment(port, { REACT_NATIVE_PACKAGER_HOSTNAME: "127.0.0.1" }),
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
