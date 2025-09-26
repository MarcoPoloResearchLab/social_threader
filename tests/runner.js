// @ts-check
/**
 * @fileoverview Lightweight test runner for browser execution.
 */

const TEST_SUITE_REGISTRY = Object.freeze([
    { modulePath: "./chunking.test.js", exportName: "runChunkingTests" },
    { modulePath: "./richText.test.js", exportName: "runRichTextTests" },
    { modulePath: "./inputPanel.test.js", exportName: "runInputPanelTests" },
    { modulePath: "./integration.test.js", exportName: "runIntegrationTests" }
]);

/**
 * @param {HTMLElement} outputElement Container for writing test results.
 */
export function createTestRunner(outputElement) {
    const existingSummary = outputElement.querySelector("p");
    const summaryElement = existingSummary ?? document.createElement("p");
    summaryElement.textContent = "Running tests…";
    if (!existingSummary) {
        outputElement.appendChild(summaryElement);
    }

    const listElement = document.createElement("ul");
    outputElement.insertBefore(listElement, summaryElement);
    let passed = 0;
    let failed = 0;

    /**
     * Records and renders the outcome of a test.
     * @param {string} name Test description.
     * @param {boolean} success Whether the test passed.
     * @param {unknown} error Optional error information.
     * @returns {void}
     */
    function recordResult(name, success, error) {
        const item = document.createElement("li");
        item.textContent = success ? `✅ ${name}` : `❌ ${name} - ${error}`;
        listElement.appendChild(item);
        if (success) {
            passed += 1;
        } else {
            failed += 1;
        }
    }

    return {
        /**
         * Executes an individual test.
         * @param {string} name Test description.
         * @param {() => (void | Promise<void>)} fn Test body.
         * @returns {Promise<void>}
         */
        async runTest(name, fn) {
            try {
                await fn();
                recordResult(name, true);
            } catch (error) {
                recordResult(name, false, error instanceof Error ? error.message : String(error));
            }
        },
        /**
         * Prints a summary of test outcomes.
         * @returns {void}
         */
        summarize() {
            summaryElement.textContent = `Passed: ${passed}, Failed: ${failed}`;
        },
        /**
         * Renders an error message without disturbing the summary element order.
         * @param {string} message Error description to display.
         * @returns {void}
         */
        reportHarnessError(message) {
            const errorElement = document.createElement("p");
            errorElement.textContent = message;
            outputElement.insertBefore(errorElement, summaryElement);
        }
    };
}

/**
 * Dynamically imports and executes all registered test suites.
 * @param {(name: string, fn: () => (void | Promise<void>)) => Promise<void>} runTest Test harness callback.
 * @returns {Promise<void>}
 */
export async function runRegisteredSuites(runTest) {
    for (const testSuite of TEST_SUITE_REGISTRY) {
        const moduleExports = await import(testSuite.modulePath);
        const suiteRunner = moduleExports[testSuite.exportName];
        if (typeof suiteRunner !== "function") {
            throw new Error(`Module ${testSuite.modulePath} did not export ${testSuite.exportName}`);
        }
        await suiteRunner(runTest);
    }
}
