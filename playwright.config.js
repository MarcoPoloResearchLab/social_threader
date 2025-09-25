const { defineConfig, devices } = require("@playwright/test");

const PLAYWRIGHT_TEST_DIRECTORY = "playwright";
const CHROMIUM_PROJECT = devices["Desktop Chrome"];

module.exports = defineConfig({
    testDir: PLAYWRIGHT_TEST_DIRECTORY,
    retries: process.env.CI ? 2 : 0,
    use: {
        headless: true
    },
    projects: [
        {
            name: CHROMIUM_PROJECT.name,
            use: {
                ...CHROMIUM_PROJECT,
                headless: true
            }
        }
    ]
});
