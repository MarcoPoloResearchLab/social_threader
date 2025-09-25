const { defineConfig } = require("@playwright/test");

const PLAYWRIGHT_TEST_DIRECTORY = "playwright";

module.exports = defineConfig({
    testDir: PLAYWRIGHT_TEST_DIRECTORY,
    retries: process.env.CI ? 2 : 0,
    use: {
        headless: true
    }
});
