// @ts-check
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const VERSION = "v2.2.24";
const ARCHIVES = Object.freeze({
    "darwin-arm64": "ce252c4efb37050d7f2b1982533dc66050cc6152b2cfee4d666570cf77ce8356",
    "linux-amd64": "fc0064b47c658c6868ef9db519a6394f8423dad6dfbc844ca8847e3b1e86c6ba"
});
const fixtureRoot = path.resolve(process.argv[3]);
const hash = contents => crypto.createHash("sha256").update(contents).digest("hex");

/** Acquire the exact published fixture, or use the explicitly supplied candidate. */
async function acquireFixture() {
    if (process.env.TAUTH_TEST_FIXTURE_BIN) {
        assert.ok(path.isAbsolute(process.env.TAUTH_TEST_FIXTURE_BIN), "TAUTH_TEST_FIXTURE_BIN must be absolute");
        return fs.realpathSync(process.env.TAUTH_TEST_FIXTURE_BIN);
    }
    const platform = `${os.platform()}-${os.arch() === "x64" ? "amd64" : os.arch()}`;
    assert.ok(Object.hasOwn(ARCHIVES, platform), `unsupported published fixture platform: ${platform}`);
    const directory = path.join(fixtureRoot, "artifact", VERSION, platform);
    const archive = path.join(directory, "fixture.tar.gz");
    const executable = path.join(directory, "tauth-test-fixture");
    const expectedDigest = ARCHIVES[platform];
    fs.mkdirSync(directory, { recursive: true });
    if (!fs.existsSync(archive)) {
        const url = `https://github.com/tyemirov/TAuth/releases/download/${VERSION}/tauth-test-fixture-${platform}.tar.gz`;
        const response = await fetch(url);
        assert.ok(response.ok, `retrieve published fixture: HTTP ${response.status}`);
        const contents = Buffer.from(await response.arrayBuffer());
        assert.equal(hash(contents), expectedDigest, "published fixture archive SHA-256");
        fs.writeFileSync(archive, contents, { flag: "wx" });
    }
    assert.equal(hash(fs.readFileSync(archive)), expectedDigest, "cached published fixture archive SHA-256");
    if (!fs.existsSync(executable)) {
        const entries = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" }).trim().split("\n");
        assert.deepEqual(entries, ["tauth-test-fixture"], "published archive contents");
        execFileSync("tar", ["-xzf", archive, "-C", directory]);
    }
    const publishedExecutable = execFileSync("tar", ["-xOzf", archive, "tauth-test-fixture"], { maxBuffer: 64 * 1024 * 1024 });
    assert.equal(hash(fs.readFileSync(executable)), hash(publishedExecutable), "cached executable matches the verified published archive");
    return executable;
}

/** Prepare once, then retain the same persisted fixture identity on restart. */
async function prepareFixture() {
    const executable = await acquireFixture();
    const declaration = JSON.parse(fs.readFileSync("configs/tauth.local.json", "utf8"));
    for (const [field, name] of Object.entries({ google_web_client_id: "GOOGLE_CLIENT_ID", jwt_signing_key: "TAUTH_JWT_SIGNING_KEY" })) {
        const value = process.env[name];
        assert.ok(value?.trim(), `selected local environment requires ${name}`);
        declaration.tenant[field] = value;
    }
    const input = JSON.stringify(declaration) + "\n";
    const inputPath = path.join(fixtureRoot, "fixture.json");
    const output = path.join(fixtureRoot, "prepared");
    if (fs.existsSync(output)) {
        assert.equal(fs.readFileSync(inputPath, "utf8"), input, "local fixture inputs changed; select a new LOCAL_TAUTH_ROOT to preserve existing state");
        const receipt = JSON.parse(fs.readFileSync(path.join(output, "receipt.json"), "utf8"));
        assert.equal(receipt.input_sha256, hash(input), "existing fixture input receipt");
    } else {
        fs.mkdirSync(fixtureRoot, { recursive: true });
        fs.writeFileSync(inputPath, input);
        execFileSync(executable, ["--input", inputPath, "--output-dir", output], { stdio: ["ignore", "inherit", "inherit"] });
    }
    const buildIdentity = execFileSync("go", ["version", "-m", executable], { encoding: "utf8" });
    assert.match(buildIdentity, /github\.com\/tyemirov\/tauth\/cmd\/testfixture/, "fixture build package");
    fs.writeFileSync(path.join(fixtureRoot, "artifact-identity.json"), JSON.stringify({
        version: VERSION, executable, sha256: hash(fs.readFileSync(executable)), build_identity: buildIdentity
    }, null, 2) + "\n");
    process.stdout.write(`${output}\n`);
}

assert.equal(process.argv[2], "prepare", "expected prepare operation");
await prepareFixture();
