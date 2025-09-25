const { defineConfig } = require("@playwright/test");

const PLAYWRIGHT_TEST_DIRECTORY = "playwright";
const CHROMIUM_PROJECT_NAME = "chromium";

module.exports = defineConfig({
    testDir: PLAYWRIGHT_TEST_DIRECTORY,
    retries: process.env.CI ? 2 : 0,
    use: {
        headless: true
    },
    projects: [
        {
            name: CHROMIUM_PROJECT_NAME,
            use: {
                browserName: CHROMIUM_PROJECT_NAME,
                headless: true
            }
        }
    ]
});
