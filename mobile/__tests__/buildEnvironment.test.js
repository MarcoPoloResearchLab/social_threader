import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildEnvironment, NPM_CI_ARGUMENTS } from "../scripts/lib/build-environment.mjs";

const MOBILE_DIR = path.resolve(__dirname, "..");
const NPM_CI_STEP_TIMEOUT_MS = 300000;
const CALLER_PRODUCTION_ENVIRONMENT = Object.freeze({
  NODE_ENV: "production",
  NPM_CONFIG_PRODUCTION: "true",
  NPM_CONFIG_OMIT: "dev"
});

describe("android bundle build environment", () => {
  let savedCallerEnvironment;
  let workDir;

  beforeAll(() => {
    savedCallerEnvironment = Object.fromEntries(
      Object.keys(CALLER_PRODUCTION_ENVIRONMENT).map((variableName) => [variableName, process.env[variableName]])
    );
    Object.assign(process.env, CALLER_PRODUCTION_ENVIRONMENT);
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-threader-mobile-build-env-"));
  });

  afterAll(() => {
    for (const [variableName, variableValue] of Object.entries(savedCallerEnvironment)) {
      if (variableValue === undefined) {
        delete process.env[variableName];
      } else {
        process.env[variableName] = variableValue;
      }
    }
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it("builds an environment without the caller NODE_ENV", () => {
    const javaHome = path.join(workDir, "java");
    const androidSdkRoot = path.join(workDir, "android-sdk");
    const environment = buildEnvironment(javaHome, androidSdkRoot);

    expect(environment.NODE_ENV).toBeUndefined();
    expect(environment.NPM_CONFIG_PRODUCTION).toBe("true");
    expect(environment.NPM_CONFIG_OMIT).toBe("dev");
    expect(environment.JAVA_HOME).toBe(javaHome);
    expect(environment.ANDROID_SDK_ROOT).toBe(androidSdkRoot);
    expect(environment.PATH.startsWith(`${path.join(javaHome, "bin")}${path.delimiter}`)).toBe(true);
  });

  it("installs devDependencies through npm ci under inherited production settings", () => {
    const javaHome = path.join(workDir, "java");
    const androidSdkRoot = path.join(workDir, "android-sdk");
    const environment = buildEnvironment(javaHome, androidSdkRoot);

    const installDir = path.join(workDir, "install");
    fs.mkdirSync(installDir, { recursive: true });
    fs.copyFileSync(path.join(MOBILE_DIR, "package.json"), path.join(installDir, "package.json"));
    fs.copyFileSync(path.join(MOBILE_DIR, "package-lock.json"), path.join(installDir, "package-lock.json"));

    const result = spawnSync("npm", NPM_CI_ARGUMENTS, {
      cwd: installDir,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8"
    });
    if (result.status !== 0) {
      throw new Error(`npm ci failed with exit ${result.status}: ${result.stdout || ""}${result.stderr || ""}`);
    }

    expect(fs.existsSync(path.join(installDir, "node_modules", "babel-preset-expo", "package.json"))).toBe(true);
  }, NPM_CI_STEP_TIMEOUT_MS);
});
