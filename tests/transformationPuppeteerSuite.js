// @ts-check
/**
 * @fileoverview Real-browser split-origin transformation scenario for Puppeteer.
 */

import http from "node:http";

const SOURCE_TEXT_SELECTOR = "#sourceText";
const TRANSFORMATION_TOOLBAR_SELECTOR = "#transformationToolbar";
const POLISH_BUTTON_SELECTOR = '[data-transformation-operation="polish"]';
const PREVIEW_TEXT_SELECTOR = "[data-transformation-preview-text]";
const TRANSFORMATION_ERROR_SELECTOR = "[data-transformation-error]";
const APPLY_BUTTON_SELECTOR = '[data-transformation-action="apply"]';
const UNDO_BUTTON_SELECTOR = '[data-transformation-action="undo"]';
const LOCAL_SESSION_COOKIE_NAME = "social_threader_development_session";

/**
 * Launches a separate API origin with exact credentialed CORS behavior.
 * @param {string} frontendOrigin Exact browser frontend origin.
 * @returns {Promise<{ origin: string; capture: () => { requestCount: number; payload: Record<string, unknown> | null; cookieHeader: string }; close: () => Promise<void> }>}
 */
export function startTransformationApiServer(frontendOrigin) {
    return new Promise((resolve, reject) => {
        let requestCount = 0;
        /** @type {Record<string, unknown> | null} */
        let capturedPayload = null;
        let capturedCookieHeader = "";
        const server = http.createServer((request, response) => {
            response.setHeader("Access-Control-Allow-Origin", frontendOrigin);
            response.setHeader("Access-Control-Allow-Credentials", "true");
            response.setHeader("Vary", "Origin");
            if (request.method === "OPTIONS") {
                response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
                response.setHeader("Access-Control-Allow-Headers", "Content-Type");
                response.writeHead(204).end();
                return;
            }
            if (request.method !== "POST" || request.url !== "/v1/thread-transformations") {
                response.writeHead(404).end("Not Found");
                return;
            }

            const requestBodyChunks = [];
            request.on("data", (requestBodyChunk) => requestBodyChunks.push(requestBodyChunk));
            request.on("end", () => {
                try {
                    requestCount += 1;
                    capturedPayload = JSON.parse(Buffer.concat(requestBodyChunks).toString("utf8"));
                    capturedCookieHeader = request.headers.cookie || "";
                    response.writeHead(200, {
                        "Cache-Control": "no-store",
                        "Content-Type": "application/json; charset=utf-8"
                    });
                    response.end(JSON.stringify({
                        operation: "polish",
                        text: "Browser-safe <strong>result</strong>.",
                        request_id: capturedPayload.request_id,
                        template_version: "polish.v1"
                    }));
                } catch {
                    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
                    response.end(JSON.stringify({ error: { code: "invalid_request", message: "Invalid request" } }));
                }
            });
        });

        server.on("error", (error) => reject(error));
        server.listen(0, "127.0.0.1", () => {
            const addressInfo = server.address();
            if (!addressInfo || typeof addressInfo === "string") {
                reject(new Error("Unable to determine transformation API server port"));
                return;
            }
            resolve({
                origin: `http://127.0.0.1:${addressInfo.port}`,
                capture: () => ({
                    requestCount,
                    payload: capturedPayload,
                    cookieHeader: capturedCookieHeader
                }),
                close: () => new Promise((resolveClose) => server.close(() => resolveClose()))
            });
        });
    });
}

/**
 * @param {import("puppeteer").Page} page
 * @param {(name: string) => void} pass
 * @param {(name: string, error: unknown) => void} fail
 * @param {string} indexUrl
 * @param {string} publicOrigin
 * @param {{ origin: string; capture: () => { requestCount: number; payload: Record<string, unknown> | null; cookieHeader: string } }} transformationApiServer
 * @returns {Promise<void>}
 */
export async function runTransformationBrowserSuite(page, pass, fail, indexUrl, publicOrigin, transformationApiServer) {
    const testName = "authenticated AI transformation - explicit profile retry, CORS, preview, apply, and undo";
    let applicationConfigRequestCount = 0;
    const handleRequest = async (httpRequest) => {
        const requestUrl = new URL(httpRequest.url());
        if (requestUrl.origin === publicOrigin && requestUrl.pathname === "/config-app.json") {
            applicationConfigRequestCount += 1;
            if (applicationConfigRequestCount === 1) {
                await httpRequest.respond({
                    status: 503,
                    contentType: "application/json; charset=utf-8",
                    body: JSON.stringify({ error: { code: "capacity_unavailable" } })
                });
                return;
            }
            await httpRequest.respond({
                status: 200,
                contentType: "application/json; charset=utf-8",
                body: JSON.stringify({
                    schema_version: 1,
                    environments: [{
                        name: "puppeteer",
                        origins: [publicOrigin],
                        api_origin: transformationApiServer.origin
                    }]
                })
            });
            return;
        }
        if (requestUrl.origin === publicOrigin && requestUrl.pathname === "/config-ui.yaml") {
            await httpRequest.respond({
                status: 200,
                contentType: "text/yaml; charset=utf-8",
                body: [
                    "environments:",
                    "  - description: Puppeteer",
                    "    origins:",
                    `      - "${publicOrigin}"`,
                    "    auth:",
                    "      tauthUrl: \"\"",
                    "      googleClientId: \"browser-test.apps.googleusercontent.com\"",
                    "      tenantId: \"social-threader\"",
                    "      loginPath: \"/auth/google\"",
                    "      logoutPath: \"/auth/logout\"",
                    "      noncePath: \"/auth/nonce\"",
                    "      sessionPath: \"/auth/session\""
                ].join("\n")
            });
            return;
        }
        await httpRequest.continue();
    };

    try {
        await page.setRequestInterception(true);
        page.on("request", handleRequest);
        await page.goto(indexUrl, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(TRANSFORMATION_TOOLBAR_SELECTOR);
        await page.setCookie({
            name: LOCAL_SESSION_COOKIE_NAME,
            value: "puppeteer-profile-session",
            url: publicOrigin,
            sameSite: "Lax"
        });
        await page.$eval(SOURCE_TEXT_SELECTOR, (editorElement, sourceText) => {
            editorElement.textContent = sourceText;
            editorElement.dispatchEvent(new Event("input", { bubbles: true }));
        }, "Browser source draft.");

        const disabledBeforeAuth = await page.$eval(POLISH_BUTTON_SELECTOR, (buttonElement) => buttonElement.disabled);
        if (!disabledBeforeAuth || transformationApiServer.capture().requestCount !== 0) {
            throw new Error("Protected controls or requests became active before the mpr-ui authenticated lifecycle");
        }
        await page.evaluate((authenticatedEventName) => {
            document.dispatchEvent(new CustomEvent(authenticatedEventName));
        }, "mpr-ui:auth:authenticated");
        await page.waitForFunction((buttonSelector) => {
            const buttonElement = document.querySelector(buttonSelector);
            return buttonElement instanceof HTMLButtonElement && !buttonElement.disabled;
        }, {}, POLISH_BUTTON_SELECTOR);
        await page.click(POLISH_BUTTON_SELECTOR);
        await page.waitForSelector(`${TRANSFORMATION_ERROR_SELECTOR}:not([hidden])`);
        if (applicationConfigRequestCount !== 1 || transformationApiServer.capture().requestCount !== 0) {
            throw new Error("Profile discovery failure triggered an automatic protected retry");
        }
        await page.waitForFunction((buttonSelector) => {
            const buttonElement = document.querySelector(buttonSelector);
            return buttonElement instanceof HTMLButtonElement && !buttonElement.disabled;
        }, {}, POLISH_BUTTON_SELECTOR);
        await page.click(POLISH_BUTTON_SELECTOR);
        await page.waitForSelector(`${PREVIEW_TEXT_SELECTOR}:not([hidden])`);

        const apiCapture = transformationApiServer.capture();
        if (applicationConfigRequestCount !== 2) {
            throw new Error(`Expected explicit profile retry, received ${applicationConfigRequestCount} config requests`);
        }
        if (apiCapture.requestCount !== 1) {
            throw new Error(`Expected one protected request, received ${apiCapture.requestCount}`);
        }
        if (
            !apiCapture.payload ||
            apiCapture.payload.operation !== "polish" ||
            apiCapture.payload.text !== "Browser source draft." ||
            Object.keys(apiCapture.payload).sort().join(",") !== "operation,request_id,text"
        ) {
            throw new Error(`Unexpected protected payload: ${JSON.stringify(apiCapture.payload)}`);
        }
        if (!apiCapture.cookieHeader.includes(`${LOCAL_SESSION_COOKIE_NAME}=puppeteer-profile-session`)) {
            throw new Error("Credentialed fetch omitted the profile session cookie");
        }
        const previewState = await page.$eval(PREVIEW_TEXT_SELECTOR, (previewElement) => ({
            text: previewElement.textContent,
            nestedStrongCount: previewElement.querySelectorAll("strong").length
        }));
        if (previewState.text !== "Browser-safe <strong>result</strong>." || previewState.nestedStrongCount !== 0) {
            throw new Error(`Preview did not preserve plain text: ${JSON.stringify(previewState)}`);
        }
        const sourceBeforeApply = await page.$eval(SOURCE_TEXT_SELECTOR, (editorElement) => editorElement.textContent);
        if (sourceBeforeApply !== "Browser source draft.") {
            throw new Error("Preview overwrote the editor before Apply");
        }
        await page.click(APPLY_BUTTON_SELECTOR);
        const sourceAfterApply = await page.$eval(SOURCE_TEXT_SELECTOR, (editorElement) => editorElement.textContent);
        if (sourceAfterApply !== "Browser-safe <strong>result</strong>.") {
            throw new Error("Apply did not use the plain-text editor boundary");
        }
        await page.click(UNDO_BUTTON_SELECTOR);
        const sourceAfterUndo = await page.$eval(SOURCE_TEXT_SELECTOR, (editorElement) => editorElement.textContent);
        if (sourceAfterUndo !== "Browser source draft.") {
            throw new Error("Undo did not restore the replaced source");
        }
        await page.evaluate((unauthenticatedEventName) => {
            document.dispatchEvent(new CustomEvent(unauthenticatedEventName));
        }, "mpr-ui:auth:unauthenticated");
        const logoutState = await page.evaluate((buttonSelector, sourceSelector) => {
            const buttonElement = document.querySelector(buttonSelector);
            const sourceElement = document.querySelector(sourceSelector);
            return {
                disabled: buttonElement instanceof HTMLButtonElement && buttonElement.disabled,
                sourceText: sourceElement?.textContent
            };
        }, POLISH_BUTTON_SELECTOR, SOURCE_TEXT_SELECTOR);
        if (!logoutState.disabled || logoutState.sourceText !== "Browser source draft.") {
            throw new Error("Logout did not clear protected UI state while preserving the draft");
        }
        pass(testName);
    } catch (error) {
        fail(testName, error);
    } finally {
        page.off("request", handleRequest);
        await page.setRequestInterception(false);
    }
}
