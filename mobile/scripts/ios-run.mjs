#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";

import {
  createExpoEnvironment,
  resolvePortSearchLimit,
  resolveRequestedPort,
  toShellCommand
} from "./lib/expo-local-run.mjs";
import { findAvailablePort, parsePort } from "./lib/ports.mjs";

const EXPECT_COMMAND = process.env.SOCIAL_THREADER_MOBILE_EXPECT || "/usr/bin/expect";
const EXPECT_SCRIPT = "scripts/expo-run.expect";

main().catch((error) => {
  console.error(`Social Threader mobile: iOS start failed: ${error.message}`);
  process.exit(1);
});

async function main() {
  const parsedArgs = parseArgs(process.argv.slice(2));
  const requestedPort = resolveRequestedPort(parsedArgs.port);
  const searchLimit = resolvePortSearchLimit();
  const port = await findAvailablePort(requestedPort, searchLimit);
  const expoArgs = normalizeExpoArgs(parsedArgs.expoArgs, port);
  const expectArgs = [EXPECT_SCRIPT, "npx", "--no-install", ...expoArgs];
  const commandText = toShellCommand(EXPECT_COMMAND, expectArgs);

  if (port !== requestedPort) {
    console.log(`Social Threader mobile: port ${requestedPort} is busy; using ${port}.`);
  } else {
    console.log(`Social Threader mobile: using Expo port ${port}.`);
  }

  if (parsedArgs.printCommand) {
    console.log(commandText);
    return;
  }

  const child = spawn(EXPECT_COMMAND, expectArgs, {
    env: createExpoEnvironment(port),
    shell: process.platform === "win32",
    stdio: "inherit"
  });

  child.on("error", (error) => {
    console.error(`Social Threader mobile: could not start iOS Expo wrapper: ${error.message}`);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
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
    if (arg === "--ios") {
      continue;
    }
    expoArgs.push(arg);
  }

  return { expoArgs, port, printCommand };
}

function normalizeExpoArgs(expoArgs, port) {
  return ["expo", "start", "--ios", ...expoArgs, "--port", String(port)];
}
