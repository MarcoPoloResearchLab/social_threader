// @ts-check
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const [operation, fixtureRoot, resultPath] = process.argv.slice(2);
const declaration = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "fixture.json"), "utf8"));
const receipt = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "prepared", "receipt.json"), "utf8"));
const account = receipt.accounts.smoke;
assert.equal(receipt.tenant_id, declaration.tenant.id, "persisted fixture tenant");
assert.equal(account.state, "active", "persisted fixture account state");
assert.ok(account.user_id, "persisted public user ID");
const tenant = declaration.tenant;

if (operation === "issue-synthetic") {
    assert.equal(tenant.session_ttl, "30m", "local synthetic session lifetime");
    const issuedAt = Math.floor(Date.now() / 1000);
    const expires = issuedAt + 30 * 60;
    const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
    const claims = {
        iss: "tauth", iat: issuedAt, exp: expires,
        tenant_id: receipt.tenant_id, user_id: account.user_id,
        user_email: account.email, user_display_name: account.display_name,
        user_avatar_url: account.avatar_url, user_roles: account.roles
    };
    const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}`;
    const signature = crypto.createHmac("sha256", tenant.jwt_signing_key).update(unsigned).digest("base64url");
    const hostname = new URL(tenant.origin).hostname;
    fs.writeFileSync(resultPath, `# Netscape HTTP Cookie File\n# Synthetic local test session; not a provider login.\n#HttpOnly_${hostname}\tFALSE\t/\tFALSE\t${expires}\t${tenant.session_cookie_name}\t${unsigned}.${signature}\n`);
} else if (operation === "verify-profile") {
    const profile = JSON.parse(fs.readFileSync(resultPath, "utf8"));
    for (const [field, expected] of Object.entries({
        user_id: account.user_id, user_email: account.email,
        display: account.display_name, avatar_url: account.avatar_url, roles: account.roles
    })) assert.deepEqual(profile[field], expected, `real /me persisted profile ${field}`);
    assert.equal(typeof profile.expires, "string", "real /me expiry must be an RFC3339 timestamp");
    assert.match(profile.expires, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/, "real /me RFC3339 expiry");
    const expiryMilliseconds = Date.parse(profile.expires);
    assert.ok(Number.isFinite(expiryMilliseconds) && expiryMilliseconds > Date.now(), "real /me session expiry must be in the future");
} else if (operation === "verify-nonce") {
    const response = JSON.parse(fs.readFileSync(resultPath, "utf8"));
    assert.deepEqual(Object.keys(response), ["nonce"], "real tenant nonce response shape");
    assert.equal(typeof response.nonce, "string", "real tenant nonce type");
    assert.ok(response.nonce.trim(), "real tenant nonce must not be empty");
} else if (operation === "verify-logout") {
    const headers = fs.readFileSync(resultPath, "utf8").split(/\r?\n/);
    for (const [name, cookiePath] of [[tenant.session_cookie_name, "/"], [tenant.refresh_cookie_name, "/auth"]]) {
        const header = headers.find(line => line.toLowerCase().startsWith(`set-cookie: ${name}=`));
        assert.ok(header, `logout clears ${name}`);
        assert.ok(header.includes(`Path=${cookiePath};`), `logout ${name} path`);
        assert.ok(header.includes("Max-Age=0"), `logout expires ${name}`);
    }
} else {
    throw new Error(`unknown local synthetic-session operation: ${operation}`);
}
