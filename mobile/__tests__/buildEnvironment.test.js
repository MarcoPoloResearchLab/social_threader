import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildEnvironment } from "../scripts/lib/build-environment.mjs";

const MOBILE_DIR = path.resolve(__dirname, "..");
const NPM_CI_STEP_TIMEOUT_MS = 300000;

describe("android bundle build environment", () => {
  let savedNodeEnv;
  let workDir;

  beforeAll(() => {
    savedNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-threader-mobile-build-env-"));
  });

  afterAll(() => {
    if (savedNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = savedNodeEnv;
    }
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it("builds an environment without the caller NODE_ENV", () => {
    const javaHome = path.join(workDir, "java");
    const androidSdkRoot = path.join(workDir, "android-sdk");
    const environment = buildEnvironment(javaHome, androidSdkRoot);

    expect(environment.NODE_ENV).toBeUndefined();
    expect(environment.JAVA_HOME).toBe(javaHome);
    expect(environment.ANDROID_SDK_ROOT).toBe(androidSdkRoot);
    expect(environment.PATH.startsWith(`${path.join(javaHome, "bin")}${path.delimiter}`)).toBe(true);
  });

  it("installs devDependencies through the npm ci step under NODE_ENV=production", () => {
    const javaHome = path.join(workDir, "java");
    const androidSdkRoot = path.join(workDir, "android-sdk");
    const environment = buildEnvironment(javaHome, androidSdkRoot);

    const installDir = path.join(workDir, "install");
    fs.mkdirSync(installDir, { recursive: true });
    fs.copyFileSync(path.join(MOBILE_DIR, "package.json"), path.join(installDir, "package.json"));
    fs.copyFileSync(path.join(MOBILE_DIR, "package-lock.json"), path.join(installDir, "package-lock.json"));

    const result = spawnSync("npm", ["ci"], {
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
