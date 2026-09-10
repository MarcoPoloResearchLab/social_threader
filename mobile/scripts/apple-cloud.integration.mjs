// @ts-check
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repository = resolve(import.meta.dirname, "../..");
const adapter = join(repository, "mobile/scripts/build-ios.sh");

test("Apple adapter forwards exact arguments and provider status without local tools", () => {
  const fixture = mkdtempSync(join(tmpdir(), "social-apple-cloud-"));
  try {
    writeFileSync(join(fixture, "apple-cloud-operation"),
      'process.stdout.write(JSON.stringify(process.argv.slice(2))); process.stderr.write("provider diagnostic"); process.exit(31);\n');
    const argumentsToForward = ["--config", "/source with spaces/apple-build.json", "--target", "ios", "--version", "1.2.3"];
    const result = spawnSync("/bin/sh", [adapter, ...argumentsToForward], {
      cwd: fixture,
      env: { PATH: "", MPRLAB_GATEWAY_EXECUTABLE: process.execPath },
      encoding: "utf8"
    });
    assert.equal(result.status, 31, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), argumentsToForward);
    assert.equal(result.stderr, "provider diagnostic");
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("Apple Make entrypoint forwards to the cloud adapter without local dependency setup", () => {
  const result = spawnSync("/usr/bin/make", ["--no-print-directory", "-n", "build-ios", "MOBILE_APPLE_BUILD_ARGS=--target ios --plan"], {
    cwd: repository, encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\/bin\/sh .*mobile\/scripts\/build-ios\.sh.*--target ios --plan/);
  assert.doesNotMatch(result.stdout, /npm|eas|expo|xcodebuild/);
});

test("Apple submission has one lifecycle and no EAS release configuration", () => {
  const result = spawnSync("/usr/bin/make", ["--no-print-directory", "-n", "submit-ios"], { cwd: repository, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No rule to make target/);
  assert.equal(existsSync(join(repository, "mobile/eas.json")), false);
});
