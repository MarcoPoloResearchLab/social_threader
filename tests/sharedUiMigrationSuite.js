// @ts-check
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sharedUiCandidate } from "./sharedUiCandidate.js";

const HEADER = "#socialThreaderHeader";
const SOURCE = "#sourceText";
const POLISH = '[data-transformation-operation="polish"]';
const GOOGLE_SDK = `window.google = { accounts: { id: {
    initialize(config) { this.config = config; },
    renderButton(host, options) {
        const button = document.createElement('button');
        button.textContent = 'Google';
        button.dataset.test = 'candidate-google';
        button.onclick = () => {
            options.click_listener();
            this.config.callback({ credential: 'threader-test-credential', state: options.state });
        };
        host.replaceChildren(button);
    },
    prompt() {}, disableAutoSelect() {}, cancel() {}
} } };`;

/**
 * @param {import('puppeteer').Browser} browser
 * @param {(name: string) => void} pass
 * @param {(name: string, error: unknown) => void} fail
 * @param {string} origin
 */
export async function runSharedUiMigrationSuite(browser, pass, fail, origin) {
    const assets = await sharedUiCandidate();
    const sourceConfig = await readFile(new URL("../config-ui.yaml", import.meta.url), "utf8");
    for (const environment of ["local", "hosted"]) {
        for (const width of [390, 1280]) {
            const name = `shared provider map, Google login, reload, and logout: ${environment} ${width}px`;
            const context = await browser.createBrowserContext();
            const page = await context.newPage();
            let stage = "startup";
            let requestSummary = [];
            try {
                page.setDefaultTimeout(4000);
                page.setDefaultNavigationTimeout(4000);
                await page.setViewport({ width, height: 900 });
                const config = sourceConfig.replace(
                    environment === "local" ? "http://localhost:4173" : "https://threader.mprlab.com",
                    origin
                );
                const authOrigin = environment === "local" ? origin : "https://tauth-api.mprlab.com";
                const requests = [];
                requestSummary = requests;
                const runtimeErrors = [];
                let authenticated = false;
                const profile = { user_id: "threader-candidate-user", user_email: "threader@example.test", display: "Threader Test User" };
                page.on("pageerror", error => runtimeErrors.push(error.message));
                await page.setRequestInterception(true);
                page.on("request", async request => {
                    const url = new URL(request.url());
                    const assetName = url.pathname.split("/").at(-1);
                    if (url.hostname === "cdn.jsdelivr.net" && assets.has(assetName)) {
                        await request.respond({ status: 200, contentType: assetName.endsWith(".css") ? "text/css" : "application/javascript", body: assets.get(assetName) });
                        return;
                    }
                    if (url.origin === origin && url.pathname === "/config-ui.yaml") {
                        await request.respond({ status: 200, contentType: "text/yaml", body: config });
                        return;
                    }
                    if (url.origin === origin && url.pathname === "/config-app.json") {
                        await request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ schema_version: 1, environments: [{ name: "candidate", origins: [origin], api_origin: origin }] }) });
                        return;
                    }
                    if (url.hostname === "accounts.google.com") {
                        await request.respond({ status: 200, contentType: "application/javascript", body: GOOGLE_SDK });
                        return;
                    }
                    if (url.origin === authOrigin && url.pathname.startsWith("/auth/")) {
                        const headers = {
                            "Access-Control-Allow-Origin": origin,
                            "Access-Control-Allow-Credentials": "true",
                            "Access-Control-Allow-Headers": "content-type,x-requested-with,x-tauth-tenant",
                            "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
                        };
                        if (request.method() === "OPTIONS") {
                            await request.respond({ status: 204, headers });
                            return;
                        }
                        requests.push({ path: url.pathname, tenant: request.headers()["x-tauth-tenant"], payload: request.postData() });
                        let status = 200;
                        let payload = {};
                        if (url.pathname === "/auth/nonce") payload = { nonce: "threader-candidate-nonce" };
                        else if (url.pathname === "/auth/google") {
                            authenticated = true;
                            payload = profile;
                        } else if (url.pathname === "/auth/session") {
                            status = authenticated ? 200 : 401;
                            payload = authenticated ? profile : { error: "unauthorized" };
                        } else if (url.pathname === "/auth/logout") {
                            authenticated = false;
                            status = 204;
                        } else if (url.pathname === "/auth/refresh") status = authenticated ? 204 : 401;
                        else {
                            status = 404;
                            payload = { error: "unexpected_test_auth_path" };
                        }
                        await request.respond({ status, headers, contentType: "application/json", body: status === 204 ? "" : JSON.stringify(payload) });
                        return;
                    }
                    if (url.hostname === "loopaware.mprlab.com" || url.hostname === "www.googletagmanager.com") {
                        await request.respond({ status: 200, contentType: "application/javascript", body: "" });
                        return;
                    }
                    await request.continue();
                });
                await page.goto(`${origin}/index.html`, { waitUntil: "domcontentloaded" });
                await page.waitForSelector(`${HEADER}[auth-config]`, { timeout: 2000 });
                const auth = await page.$eval(HEADER, element => JSON.parse(element.getAttribute("auth-config")));
                assert.equal(auth.tenantId, "social-threader");
                assert.equal(auth.sessionPath, "/auth/session");
                assert.equal(auth.tauthUrl, environment === "local" ? "" : authOrigin);
                assert.equal(auth.providers.google.enabled, true);
                assert.equal(auth.providers.google.clientId, "991677581607-r0dj8q6irjagipali0jpca7nfp8sfj9r.apps.googleusercontent.com");
                assert.deepEqual(auth.providers.apple, { enabled: false });
                assert.deepEqual(auth.providers.password, { enabled: false });
                await page.type(SOURCE, "A guest draft remains available for splitting.");
                assert.equal(await page.$eval(POLISH, button => button.disabled), true);
                await page.waitForSelector('[data-test="candidate-google"]', { visible: true });
                await page.click('[data-test="candidate-google"]');
                await page.waitForFunction(selector => !document.querySelector(selector).disabled, {}, POLISH);
                const exchange = requests.find(request => request.path === "/auth/google");
                assert.equal(exchange?.tenant, "social-threader");
                assert.equal(JSON.parse(exchange?.payload).google_id_token, "threader-test-credential");
                assert.equal(JSON.parse(exchange?.payload).nonce_token, "threader-candidate-nonce");
                stage = "session restoration";
                await page.reload({ waitUntil: "domcontentloaded" });
                await page.waitForSelector(`${HEADER} mpr-user[data-mpr-user-status="authenticated"]`, { timeout: 4000 });
                assert.ok(requests.some(request => request.path === "/auth/session"));
                await page.type(SOURCE, "A restored session can use the protected toolbar.");
                await page.waitForFunction(selector => !document.querySelector(selector).disabled, {}, POLISH);
                const trigger = `${HEADER} [data-mpr-user="trigger"]`;
                await page.focus(trigger);
                await page.keyboard.press("Enter");
                await page.waitForSelector(`${HEADER} [data-mpr-user="logout"]`, { visible: true });
                await page.keyboard.press("Escape");
                assert.equal(await page.$eval(trigger, element => element.getAttribute("aria-expanded")), "false");
                await page.click(trigger);
                stage = "logout viewport";
                const logoutBounds = await page.$eval(`${HEADER} [data-mpr-user="logout"]`, element => element.getBoundingClientRect().toJSON());
                assert.ok(logoutBounds.width > 0 && logoutBounds.left >= 0 && logoutBounds.right <= width, `Sign-out control exceeds the viewport: ${JSON.stringify(logoutBounds)}`);
                stage = "logout navigation";
                await Promise.all([
                    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
                    page.click(`${HEADER} [data-mpr-user="logout"]`)
                ]);
                await page.waitForSelector(POLISH);
                assert.equal(await page.$eval(POLISH, button => button.disabled), true);
                assert.equal(authenticated, false);
                assert.ok(requests.some(request => request.path === "/auth/logout"));
                assert.deepEqual(runtimeErrors, []);
                pass(name);
            } catch (error) {
                await page.screenshot({ path: `/tmp/social-threader-i003-${environment}-${width}.png` });
                const controls = await page.$$eval('[data-mpr-user="logout"]', elements => elements.map(element => ({ text: element.textContent, bounds: element.getBoundingClientRect().toJSON(), open: element.closest("mpr-user")?.getAttribute("data-mpr-user-open") })));
                fail(name, new Error(`${stage}: ${error.message}; url=${page.url()}; requests=${JSON.stringify(requestSummary)}; controls=${JSON.stringify(controls)}`));
            } finally {
                await context.close();
            }
        }
    }
}
