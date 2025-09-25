const { test, expect } = require("@playwright/test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const TEST_HARNESS_DIRECTORY_NAME = "tests";
const TEST_HARNESS_FILE_NAME = "index.html";
const FAILURE_ICON = "❌";
const SUMMARY_SELECTOR = "#test-output p:last-of-type";
const SUMMARY_EXPECTATION_PATTERN = /Passed: \d+, Failed: 0/;
const SUMMARY_WAIT_TIMEOUT_MS = 15000;
const TEST_SUITE_DESCRIPTION = "browser test harness";
const CLEAN_SUMMARY_TEST_DESCRIPTION = "reports a clean test summary";

const testHarnessFilePath = path.join(__dirname, "..", TEST_HARNESS_DIRECTORY_NAME, TEST_HARNESS_FILE_NAME);
const testHarnessUrl = pathToFileURL(testHarnessFilePath).href;

test.describe(TEST_SUITE_DESCRIPTION, () => {
    test(CLEAN_SUMMARY_TEST_DESCRIPTION, async ({ page }) => {
        await page.goto(testHarnessUrl);

        const summaryLocator = page.locator(SUMMARY_SELECTOR);
        await expect(summaryLocator).toHaveText(SUMMARY_EXPECTATION_PATTERN, {
            timeout: SUMMARY_WAIT_TIMEOUT_MS
        });

        const failingTestLocator = page.locator(`#test-output li:has-text("${FAILURE_ICON}")`);
        await expect(failingTestLocator).toHaveCount(0);
    });
});
