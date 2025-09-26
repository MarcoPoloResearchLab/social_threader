// @ts-check
/**
 * @fileoverview Detects the test query flag and wires the browser harness into the production page.
 */

import {
    LOG_MESSAGES,
    TEST_HARNESS_CLASS_NAMES,
    TEST_HARNESS_DOM,
    TEST_HARNESS_TEXT_CONTENT,
    TEST_MODE_CONFIG
} from "./constants.js";
import { loggingAdapter } from "./utils/logging.js";

/**
 * Determines whether the browser should activate the test harness.
 * @param {string} searchString Window location search string.
 * @returns {boolean}
 */
function shouldActivateTestMode(searchString) {
    const searchParameters = new URLSearchParams(searchString);
    return searchParameters.get(TEST_MODE_CONFIG.QUERY_PARAMETER) === TEST_MODE_CONFIG.ENABLED_VALUE;
}

/**
 * Creates the DOM structure used to present harness output.
 * @param {Document} documentRef Document reference used to build nodes.
 * @returns {HTMLElement}
 */
function createHarnessOutput(documentRef) {
    const wrapperElement = documentRef.createElement("section");
    wrapperElement.id = TEST_HARNESS_DOM.WRAPPER_ID;
    wrapperElement.classList.add(TEST_HARNESS_CLASS_NAMES.WRAPPER);

    const titleElement = documentRef.createElement("h2");
    titleElement.id = TEST_HARNESS_DOM.TITLE_ID;
    titleElement.textContent = TEST_HARNESS_TEXT_CONTENT.TITLE;
    wrapperElement.appendChild(titleElement);

    const outputElement = documentRef.createElement("div");
    outputElement.id = TEST_HARNESS_DOM.OUTPUT_ID;

    const placeholderElement = documentRef.createElement("p");
    placeholderElement.textContent = TEST_HARNESS_TEXT_CONTENT.SUMMARY_PLACEHOLDER;
    outputElement.appendChild(placeholderElement);

    wrapperElement.appendChild(outputElement);
    documentRef.body.appendChild(wrapperElement);

    return outputElement;
}

/**
 * Updates the placeholder summary message when initialization fails early.
 * @param {HTMLElement} outputElement Harness container element.
 * @param {string} message Replacement text for the placeholder paragraph.
 * @returns {void}
 */
function updatePlaceholderMessage(outputElement, message) {
    const summaryElement = outputElement.querySelector("p");
    if (summaryElement) {
        summaryElement.textContent = message;
    }
}

/**
 * Loads the browser harness dynamically so production users are unaffected.
 * @param {HTMLElement} outputElement Harness container element.
 * @returns {Promise<void>}
 */
async function initializeBrowserHarness(outputElement) {
    let harnessModule;
    try {
        harnessModule = await import("../tests/browserHarness.js");
    } catch (error) {
        loggingAdapter.reportError(LOG_MESSAGES.TEST_HARNESS_IMPORT_FAILURE, error);
        updatePlaceholderMessage(outputElement, TEST_HARNESS_TEXT_CONTENT.INITIALIZATION_FAILURE);
        return;
    }

    if (typeof harnessModule.runBrowserTests !== "function") {
        updatePlaceholderMessage(outputElement, TEST_HARNESS_TEXT_CONTENT.INITIALIZATION_FAILURE);
        return;
    }

    try {
        await harnessModule.runBrowserTests(outputElement);
    } catch (error) {
        loggingAdapter.reportError(LOG_MESSAGES.TEST_HARNESS_INITIALIZATION_FAILURE, error);
        updatePlaceholderMessage(outputElement, TEST_HARNESS_TEXT_CONTENT.INITIALIZATION_FAILURE);
    }
}

if (shouldActivateTestMode(window.location.search)) {
    const harnessOutputElement = createHarnessOutput(document);
    void initializeBrowserHarness(harnessOutputElement);
}
