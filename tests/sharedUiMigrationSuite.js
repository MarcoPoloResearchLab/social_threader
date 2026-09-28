// @ts-check
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadSharedUiAssets } from "./sharedUiAssets.js";

const HEADER = "#socialThreaderHeader";
const SOURCE = "#sourceText";
const POLISH = '[data-transformation-operation="polish"]';
const LOGIN_DIALOG = "#transformationLoginDialog";
const LOGIN_CLOSE = "#transformationLoginClose";
const DIALOG_GOOGLE = `${LOGIN_DIALOG} [data-test="candidate-google"]`;
const DRAFT_TEXT = "A guest draft remains available for splitting.";
const LOGIN_CASES = Object.freeze([
    { operation: "polish", label: "Polish", cancelWithEscape: true },
    { operation: "expand", label: "Expand", cancelWithEscape: true },
    { operation: "punch_up", label: "Punch Up", cancelWithEscape: false }
]);
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
    const assets = await loadSharedUiAssets();
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
                const transformationRequests = [];
                const unauthenticatedAiRequests = [];
                requestSummary = requests;
                const runtimeErrors = [];
                let authenticated = false;
                let rejectNextLogin = false;
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
                    if (url.origin === origin && url.pathname === "/v1/thread-transformations") {
                        const payload = JSON.parse(request.postData());
                        if (!authenticated) {
                            unauthenticatedAiRequests.push(payload);
                            await request.respond({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "unauthorized" }) });
                            return;
                        }
                        transformationRequests.push(payload);
                        await request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({
                            operation: payload.operation,
                            text: "A polished thread suggestion.",
                            request_id: payload.request_id,
                            template_version: `${payload.operation}.v1`
                        }) });
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
                            if (rejectNextLogin) {
                                rejectNextLogin = false;
                                status = 401;
                                payload = { error: "unauthorized" };
                            } else {
                                authenticated = true;
                                payload = profile;
                            }
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
                await page.type(SOURCE, DRAFT_TEXT);
                assert.equal(await page.$eval(POLISH, button => button.disabled), false);
                stage = "guest action cancellation";
                for (const loginCase of LOGIN_CASES) {
                    const actionSelector = `[data-transformation-operation="${loginCase.operation}"]`;
                    await page.click(actionSelector);
                    await page.waitForSelector(`${LOGIN_DIALOG}[open]`);
                    assert.equal(await page.$eval("#transformationLoginTitle", element => element.textContent), `Sign in to ${loginCase.label}`);
                    const dialogBounds = await page.$eval(LOGIN_DIALOG, element => element.getBoundingClientRect().toJSON());
                    assert.ok(dialogBounds.left >= 0 && dialogBounds.right <= width && dialogBounds.height > 0);
                    assert.equal(transformationRequests.length, 0);
                    if (loginCase.cancelWithEscape) await page.keyboard.press("Escape");
                    else await page.click(LOGIN_CLOSE);
                    await page.waitForSelector(`${LOGIN_DIALOG}:not([open])`, { hidden: true });
                    assert.equal(await page.$eval(SOURCE, element => element.textContent), DRAFT_TEXT);
                    assert.equal(await page.$eval(actionSelector, element => document.activeElement === element), true);
                }
                stage = "header login after cancellation";
                const headerGoogle = `${HEADER} [data-test="candidate-google"]`;
                await page.waitForSelector(headerGoogle, { visible: true });
                await page.click(headerGoogle);
                await page.waitForFunction(selector => !document.querySelector(selector).disabled, {}, POLISH);
                await page.waitForSelector(`${HEADER} mpr-user[data-mpr-user-status="authenticated"]`);
                assert.equal(transformationRequests.length, 0, "Canceled AI intents must not resume on a later login");
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
                stage = "dialog login resumes one AI action";
                await page.type(SOURCE, DRAFT_TEXT);
                const resumedOperation = environment === "hosted" ? LOGIN_CASES[2] : LOGIN_CASES[width === 390 ? 0 : 1];
                await page.click(`[data-transformation-operation="${resumedOperation.operation}"]`);
                await page.waitForSelector(`${LOGIN_DIALOG}[open]`);
                await page.waitForSelector(DIALOG_GOOGLE, { visible: true });
                stage = "failed dialog login preserves the selected action";
                rejectNextLogin = true;
                await page.evaluate(() => {
                    document.addEventListener("mpr-ui:auth:error", () => document.body.dataset.testAuthFailure = "true", { once: true });
                });
                await page.click(DIALOG_GOOGLE);
                await page.waitForSelector('body[data-test-auth-failure="true"]');
                await page.waitForFunction(selector => !document.querySelector(selector).disabled, {}, DIALOG_GOOGLE);
                assert.equal(await page.$eval(LOGIN_DIALOG, element => element.open), true);
                assert.equal(await page.$eval(SOURCE, element => element.textContent), DRAFT_TEXT);
                assert.equal(transformationRequests.length, 0);
                stage = "successful retry resumes one AI action";
                await page.click(DIALOG_GOOGLE);
                await page.waitForSelector("[data-transformation-preview-text]:not([hidden])");
                await page.waitForSelector(`${HEADER} mpr-user[data-mpr-user-status="authenticated"]`);
                assert.equal(await page.$eval(LOGIN_DIALOG, element => element.open), false);
                assert.equal(transformationRequests.length, 1);
                assert.equal(transformationRequests[0].operation, resumedOperation.operation);
                assert.equal(transformationRequests[0].text, DRAFT_TEXT);
                await page.evaluate(() => document.dispatchEvent(new CustomEvent("mpr-ui:auth:authenticated")));
                assert.equal(transformationRequests.length, 1, "Repeated lifecycle events must not repeat the AI request");
                assert.equal(await page.$eval(SOURCE, element => element.textContent), DRAFT_TEXT);
                assert.deepEqual(unauthenticatedAiRequests, [], "AI requests require completed shared authentication");
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
