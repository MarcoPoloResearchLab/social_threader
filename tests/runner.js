// @ts-check
/**
 * @fileoverview Lightweight test runner for browser execution.
 */

/**
 * @param {HTMLElement} outputElement Container for writing test results.
 */
export function createTestRunner(outputElement) {
    const listElement = document.createElement("ul");
    outputElement.appendChild(listElement);
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
            const summary = document.createElement("p");
            summary.textContent = `Passed: ${passed}, Failed: ${failed}`;
            outputElement.appendChild(summary);
        }
    };
}
