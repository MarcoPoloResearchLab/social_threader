const { test, expect } = require("@playwright/test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const APPLICATION_FILE_NAME = "index.html";
const SOURCE_TEXT_SELECTOR = "#sourceText";
const PRESET_TWITTER_SELECTOR = "#presetTwitter";
const RESULTS_CHUNK_SELECTOR = ".chunkContainer .chunkContent";
const PARAGRAPH_TOGGLE_SELECTOR = "#paragraphToggle";
const INPUT_STATS_SELECTOR = "#inputStats";

const testHarnessFilePath = path.join(__dirname, "..", APPLICATION_FILE_NAME);
const testHarnessUrl = pathToFileURL(testHarnessFilePath).href;

async function setEditorContent(page, textContent) {
    const editorLocator = page.locator(SOURCE_TEXT_SELECTOR);
    await editorLocator.evaluate((element, value) => {
        element.textContent = value;
        const inputEvent = new Event("input", { bubbles: true });
        element.dispatchEvent(inputEvent);
    }, textContent);
}

test.describe("Social Threader application", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(testHarnessUrl);
        await page.waitForSelector(SOURCE_TEXT_SELECTOR);
    });

    test("splits text using the Twitter preset", async ({ page }) => {
        const sampleText = Array.from({ length: 10 }, () => "The quick brown fox jumps over the lazy dog.").join(" ");
        await setEditorContent(page, sampleText);

        await expect(page.locator(INPUT_STATS_SELECTOR)).toContainText("Characters:");

        await page.locator(PRESET_TWITTER_SELECTOR).click();

        const expectedChunks = await page.evaluate(async (text) => {
            const chunkingModule = await import("./js/core/chunking.js");
            return chunkingModule.chunkingService.getChunks(text, {
                maximumLength: 280,
                breakOnSentences: false,
                enumerate: false,
                breakOnParagraphs: false
            });
        }, sampleText);

        const chunkLocator = page.locator(RESULTS_CHUNK_SELECTOR);
        await expect(chunkLocator).toHaveCount(expectedChunks.length);

        const renderedChunks = await chunkLocator.evaluateAll((elements) =>
            elements.map((element) => element.textContent || "")
        );
        expect(renderedChunks).toEqual(expectedChunks);
    });

    test("enables paragraph chunking when multiple paragraphs are entered", async ({ page }) => {
        const paragraphToggle = page.locator(PARAGRAPH_TOGGLE_SELECTOR);

        await setEditorContent(page, "Single paragraph only.");
        await expect(paragraphToggle).toBeDisabled();

        await setEditorContent(page, "First paragraph.\n\nSecond paragraph.");
        await expect(paragraphToggle).toBeEnabled();
    });
});
