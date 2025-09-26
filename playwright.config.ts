import { defineConfig, devices } from "@playwright/test";

const CI_ENVIRONMENT_FLAG = "true";
const TEST_DIRECTORY = "./tests";
const CI_TIMEOUT_MILLISECONDS = 90000;
const LOCAL_TIMEOUT_MILLISECONDS = 30000;
const CI_EXPECT_TIMEOUT_MILLISECONDS = 20000;
const LOCAL_EXPECT_TIMEOUT_MILLISECONDS = 10000;
const SPEC_FILE_GLOB = "**/*.spec.ts";
const CI_RETRY_COUNT = 2;
const LOCAL_RETRY_COUNT = 0;
const CI_WORKER_COUNT = 2;
const HEADLESS_MODE = true;
const CI_ACTION_TIMEOUT_MILLISECONDS = 20000;
const LOCAL_ACTION_TIMEOUT_MILLISECONDS = 0;
const CI_NAVIGATION_TIMEOUT_MILLISECONDS = 45000;
const LOCAL_NAVIGATION_TIMEOUT_MILLISECONDS = 30000;
const TRACE_SETTING = "on-first-retry";
const RETAIN_ON_FAILURE_VIDEO_POLICY = "retain-on-failure";
const FAILURE_ONLY_SCREENSHOT_POLICY = "only-on-failure";
const CHROMIUM_PROJECT_NAME = "chromium";
const DESKTOP_CHROME_DEVICE_NAME = "Desktop Chrome";
const NO_SANDBOX_FLAG = "--no-sandbox";
const DISABLE_DEV_SHM_USAGE_FLAG = "--disable-dev-shm-usage";
const DISABLE_GPU_FLAG = "--disable-gpu";
const LIST_REPORTER_NAME = "list";
const JUNIT_REPORTER_NAME = "junit";
const JUNIT_OUTPUT_FILE = "junit.xml";
const HTML_REPORTER_NAME = "html";
const PLAYWRIGHT_REPORT_DIRECTORY = "playwright-report";
const HTML_REPORT_OPEN_BEHAVIOR = "never";

const isCiEnvironment = process.env.CI === CI_ENVIRONMENT_FLAG;

export default defineConfig({
    testDir: TEST_DIRECTORY,
    testMatch: SPEC_FILE_GLOB,
    timeout: isCiEnvironment ? CI_TIMEOUT_MILLISECONDS : LOCAL_TIMEOUT_MILLISECONDS,
    expect: {
        timeout: isCiEnvironment ? CI_EXPECT_TIMEOUT_MILLISECONDS : LOCAL_EXPECT_TIMEOUT_MILLISECONDS
    },
    retries: isCiEnvironment ? CI_RETRY_COUNT : LOCAL_RETRY_COUNT,
    workers: isCiEnvironment ? CI_WORKER_COUNT : undefined,
    reporter: [
        [LIST_REPORTER_NAME],
        [JUNIT_REPORTER_NAME, { outputFile: JUNIT_OUTPUT_FILE }],
        [HTML_REPORTER_NAME, { outputFolder: PLAYWRIGHT_REPORT_DIRECTORY, open: HTML_REPORT_OPEN_BEHAVIOR }]
    ],
    use: {
        headless: HEADLESS_MODE,
        actionTimeout: isCiEnvironment ? CI_ACTION_TIMEOUT_MILLISECONDS : LOCAL_ACTION_TIMEOUT_MILLISECONDS,
        navigationTimeout: isCiEnvironment
            ? CI_NAVIGATION_TIMEOUT_MILLISECONDS
            : LOCAL_NAVIGATION_TIMEOUT_MILLISECONDS,
        trace: TRACE_SETTING,
        video: RETAIN_ON_FAILURE_VIDEO_POLICY,
        screenshot: FAILURE_ONLY_SCREENSHOT_POLICY
    },
    projects: [
        {
            name: CHROMIUM_PROJECT_NAME,
            use: {
                ...devices[DESKTOP_CHROME_DEVICE_NAME],
                launchOptions: {
                    args: [NO_SANDBOX_FLAG, DISABLE_DEV_SHM_USAGE_FLAG, DISABLE_GPU_FLAG]
                }
            }
        }
    ]
});
