// @ts-check
/**
 * @fileoverview Bootstraps the browser-visible test harness when loaded through the production page.
 */

import { TEST_HARNESS_TEXT_CONTENT } from "../js/constants.js";
import { createTestRunner, runRegisteredSuites } from "./runner.js";

/**
 * Executes all browser-oriented test suites using the provided output container.
 * @param {HTMLElement} outputElement DOM node used by the harness to render status updates.
 * @returns {Promise<void>}
 */
export async function runBrowserTests(outputElement) {
    const { runTest, summarize, reportHarnessError } = createTestRunner(outputElement);

    try {
        await runRegisteredSuites(runTest);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        reportHarnessError(`${TEST_HARNESS_TEXT_CONTENT.UNEXPECTED_ERROR_PREFIX}${errorMessage}`);
    } finally {
        summarize();
    }
}
