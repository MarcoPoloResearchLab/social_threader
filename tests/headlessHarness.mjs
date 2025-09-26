// @ts-check
/**
 * @fileoverview Headless DOM harness that executes browser-oriented tests using happy-dom.
 */

import { Window } from "happy-dom";
import process from "node:process";

const HARNESS_URL = "http://localhost/";
const HARNESS_VIEWPORT_WIDTH = 1280;
const HARNESS_VIEWPORT_HEIGHT = 720;
const FRAME_DURATION_MS = 16;
const OUTPUT_CONTAINER_ID = "headless-test-output";
const SUMMARY_QUERY = "p";
const RESULT_QUERY = "li";

/**
 * Creates a window instance suitable for executing browser-focused tests.
 * @returns {Window}
 */
function createBrowserWindow() {
    return new Window({
        url: HARNESS_URL,
        width: HARNESS_VIEWPORT_WIDTH,
        height: HARNESS_VIEWPORT_HEIGHT,
        pretendToBeVisual: true
    });
}

/**
 * Propagates selected properties from the window instance onto the global scope so modules relying on
 * browser globals can function in a Node environment.
 * @param {Window} browserWindow
 * @returns {void}
 */
function applyWindowGlobals(browserWindow) {
    const globalMappings = {
        window: browserWindow,
        document: browserWindow.document,
        navigator: browserWindow.navigator,
        HTMLElement: browserWindow.HTMLElement,
        HTMLDivElement: browserWindow.HTMLDivElement,
        HTMLInputElement: browserWindow.HTMLInputElement,
        HTMLButtonElement: browserWindow.HTMLButtonElement,
        HTMLLabelElement: browserWindow.HTMLLabelElement,
        HTMLImageElement: browserWindow.HTMLImageElement,
        Event: browserWindow.Event,
        CustomEvent: browserWindow.CustomEvent,
        EventTarget: browserWindow.EventTarget,
        Blob: browserWindow.Blob,
        FileReader: browserWindow.FileReader,
        Node: browserWindow.Node,
        Text: browserWindow.Text,
        Comment: browserWindow.Comment,
        DocumentFragment: browserWindow.DocumentFragment,
        MutationObserver: browserWindow.MutationObserver,
        DOMParser: browserWindow.DOMParser,
        XMLSerializer: browserWindow.XMLSerializer,
        getComputedStyle: browserWindow.getComputedStyle.bind(browserWindow),
        requestAnimationFrame: browserWindow.requestAnimationFrame,
        cancelAnimationFrame: browserWindow.cancelAnimationFrame
    };

    for (const [propertyName, propertyValue] of Object.entries(globalMappings)) {
        if (typeof propertyValue !== "undefined") {
            // @ts-ignore
            globalThis[propertyName] = propertyValue;
        }
    }

    if (typeof browserWindow.requestAnimationFrame !== "function") {
        const requestAnimationFrameFallback = (callback) => {
            return setTimeout(() => callback(Date.now()), FRAME_DURATION_MS);
        };
        browserWindow.requestAnimationFrame = requestAnimationFrameFallback;
        browserWindow.cancelAnimationFrame = (handle) => clearTimeout(handle);
        globalThis.requestAnimationFrame = requestAnimationFrameFallback;
        globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);
    }
}

/**
 * Ensures the harness exits with a non-zero status when tests fail.
 * @param {HTMLElement} outputContainer
 * @returns {number}
 */
function summarizeResults(outputContainer) {
    const summaryElement = outputContainer.querySelector(SUMMARY_QUERY);
    const resultElements = outputContainer.querySelectorAll(RESULT_QUERY);

    for (const resultElement of resultElements) {
        if (resultElement.textContent) {
            console.log(resultElement.textContent);
        }
    }

    const summaryText = summaryElement?.textContent ?? "No summary produced";
    console.log(summaryText);

    const failureMatch = summaryText.match(/Failed:\s*(\d+)/);
    if (!failureMatch) {
        return 1;
    }
    const failureCount = Number.parseInt(failureMatch[1], 10);
    return Number.isNaN(failureCount) ? 1 : failureCount;
}

async function main() {
    const browserWindow = createBrowserWindow();
    applyWindowGlobals(browserWindow);

    const outputContainer = browserWindow.document.createElement("div");
    outputContainer.id = OUTPUT_CONTAINER_ID;
    browserWindow.document.body.appendChild(outputContainer);

    const { createTestRunner } = await import("./runner.js");
    const testRunner = createTestRunner(outputContainer);

    const runTest = (name, testBody) => testRunner.runTest(name, testBody);

    const testModules = [
        { path: "./chunking.test.js", symbol: "runChunkingTests" },
        { path: "./richText.test.js", symbol: "runRichTextTests" },
        { path: "./integration.test.js", symbol: "runIntegrationTests" }
    ];

    for (const testModule of testModules) {
        const moduleExports = await import(testModule.path);
        const runnerFunction = moduleExports[testModule.symbol];
        if (typeof runnerFunction !== "function") {
            throw new Error(`Module ${testModule.path} did not export ${testModule.symbol}`);
        }
        await runnerFunction(runTest);
    }

    testRunner.summarize();
    const failureCount = summarizeResults(outputContainer);
    if (failureCount > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error("Test harness failed:", error);
    process.exitCode = 1;
});
