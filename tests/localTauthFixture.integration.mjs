// @ts-check
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("published fixture preparation preserves persisted identity and rejects changed inputs", () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "social-tauth-contract-"));
    const root = path.join(temporary, "fixture");
    const environment = path.resolve(".env.example");
    const makeArguments = ["local-tauth-prepare", `LOCAL_ENV_FILE=${environment}`, `LOCAL_TAUTH_ROOT=${root}`];
    try {
        const first = spawnSync("make", makeArguments, { encoding: "utf8", env: {
            ...process.env, TAUTH_JWT_SIGNING_KEY: "unselected-ambient-key", GOOGLE_CLIENT_ID: "unselected-ambient-client"
        } });
        assert.equal(first.status, 0, first.stdout + first.stderr);
        const receiptPath = path.join(root, "prepared", "receipt.json");
        const receiptBytes = fs.readFileSync(receiptPath);
        const receipt = JSON.parse(receiptBytes.toString());
        assert.equal(receipt.tenant_id, "social-threader");
        assert.equal(receipt.accounts.smoke.state, "active");
        assert.ok(receipt.accounts.smoke.user_id);
        const declaration = JSON.parse(fs.readFileSync(path.join(root, "fixture.json"), "utf8"));
        assert.equal(declaration.tenant.jwt_signing_key, "replace-with-the-social-threader-tauth-signing-key", "selected file owns local fixture inputs");
        const cookieJar = path.join(temporary, "cookies.txt");
        const synthetic = spawnSync(process.execPath, ["scripts/local-tauth-session.mjs", "issue-synthetic", root, cookieJar], { encoding: "utf8" });
        assert.equal(synthetic.status, 0, synthetic.stderr);
        const token = fs.readFileSync(cookieJar, "utf8").trim().split("\t").at(-1);
        const [header, payload, signature] = token.split(".");
        assert.equal(crypto.createHmac("sha256", declaration.tenant.jwt_signing_key).update(`${header}.${payload}`).digest("base64url"), signature);
        assert.equal(JSON.parse(Buffer.from(payload, "base64url").toString()).user_id, receipt.accounts.smoke.user_id, "synthetic authorization uses persisted public identity");
        const profilePath = path.join(temporary, "profile.json");
        const account = receipt.accounts.smoke;
        const profile = {
            user_id: account.user_id, user_email: account.email, display: account.display_name,
            avatar_url: account.avatar_url, roles: account.roles,
            expires: new Date(Date.now() + 60_000).toISOString()
        };
        fs.writeFileSync(profilePath, JSON.stringify(profile));
        const verified = spawnSync(process.execPath, ["scripts/local-tauth-session.mjs", "verify-profile", root, profilePath], { encoding: "utf8" });
        assert.equal(verified.status, 0, verified.stderr);
        for (const expires of [new Date(Date.now() - 60_000).toISOString(), "invalid-timestamp", Math.floor(Date.now() / 1000) + 60]) {
            fs.writeFileSync(profilePath, JSON.stringify({ ...profile, expires }));
            const rejected = spawnSync(process.execPath, ["scripts/local-tauth-session.mjs", "verify-profile", root, profilePath], { encoding: "utf8" });
            assert.notEqual(rejected.status, 0, `invalid real-service expiry must fail: ${expires}`);
        }
        const noncePath = path.join(temporary, "nonce.json");
        for (const [response, accepted] of [[{ nonce: "issued-tenant-nonce" }, true], [{ nonce: "" }, false], [{ nonce: 12 }, false], [{ nonce: "value", extra: true }, false]]) {
            fs.writeFileSync(noncePath, JSON.stringify(response));
            const checked = spawnSync(process.execPath, ["scripts/local-tauth-session.mjs", "verify-nonce", root, noncePath], { encoding: "utf8" });
            assert.equal(checked.status === 0, accepted, checked.stderr);
        }
        const database = path.join(root, "prepared", "tauth.db");
        const digest = () => crypto.createHash("sha256").update(fs.readFileSync(database)).digest("hex");
        const originalDigest = digest();
        const restarted = spawnSync("make", makeArguments, { encoding: "utf8" });
        assert.equal(restarted.status, 0, restarted.stdout + restarted.stderr);
        assert.deepEqual(fs.readFileSync(receiptPath), receiptBytes, "restart retains persisted public identity");
        assert.equal(digest(), originalDigest, "restart does not prepare or replace the store");
        const changedEnvironment = path.join(temporary, "changed.env");
        fs.writeFileSync(changedEnvironment, fs.readFileSync(environment, "utf8").replace(
            "TAUTH_JWT_SIGNING_KEY=replace-with-the-social-threader-tauth-signing-key",
            "TAUTH_JWT_SIGNING_KEY=changed-synthetic-signing-key"
        ));
        const changed = spawnSync("make", ["local-tauth-prepare", `LOCAL_ENV_FILE=${changedEnvironment}`, `LOCAL_TAUTH_ROOT=${root}`], { encoding: "utf8" });
        assert.notEqual(changed.status, 0);
        assert.match(changed.stderr, /local fixture inputs changed/);
        assert.equal(digest(), originalDigest, "input rejection preserves the store");
    } finally {
        fs.rmSync(temporary, { recursive: true });
    }
});
