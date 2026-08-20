// @ts-check
import path from "node:path";

/** @type {readonly string[]} */
export const NPM_CI_ARGUMENTS = Object.freeze(["ci", "--include=dev"]);

/**
 * Build the environment for the Android bundle build steps.
 *
 * NODE_ENV is removed so the `npm ci` step always installs devDependencies.
 * The Gradle step sets NODE_ENV to production on its own.
 *
 * @param {string} javaHome
 * @param {string} androidSdkRoot
 * @returns {NodeJS.ProcessEnv}
 */
export function buildEnvironment(javaHome, androidSdkRoot) {
  const environment = {
    ...process.env,
    CI: "1",
    EXPO_NO_TELEMETRY: "1",
    JAVA_HOME: javaHome,
    ANDROID_HOME: androidSdkRoot,
    ANDROID_SDK_ROOT: androidSdkRoot,
    PATH: [
      path.join(javaHome, "bin"),
      path.join(androidSdkRoot, "platform-tools"),
      path.join(androidSdkRoot, "cmdline-tools", "latest", "bin"),
      process.env.PATH || ""
    ]
      .filter(Boolean)
      .join(path.delimiter)
  };
  delete environment.FORCE_COLOR;
  delete environment.NO_COLOR;
  delete environment.NODE_ENV;
  return environment;
}
