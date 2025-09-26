import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SOURCE_TEXT_SELECTOR = "#sourceText";
const INPUT_STATS_SELECTOR = "#inputStats";
const PARAGRAPH_TEMPLATE = "<div>{PARAGRAPH_CONTENT}</div>";
const TRAILING_BREAK_MARKUP = "<div><br></div>";
const STATISTICS_SEGMENT_SEPARATOR = " | ";
const STATISTICS_VALUE_SEPARATOR = ": ";
const PAGE_LOAD_STATE = "load";
const INPUT_EVENT_TYPE = "input";

const typedParagraphCases = [
    {
        name: "two paragraphs update statistics counts",
        paragraphs: [
            "Playwright ensures reliable browser coverage.",
            "Browser automation validates paragraph counts."
        ],
        expected: {
            words: 10,
            paragraphs: 2
        }
    }
];

const currentFilePath = fileURLToPath(import.meta.url);
const repositoryRootPath = path.resolve(path.dirname(currentFilePath), "..");
const indexHtmlUrl = new URL(
    "?test=true",
    pathToFileURL(path.join(repositoryRootPath, "index.html"))
).toString();

/**
 * Parses the statistics string rendered by the UI into discrete numeric values.
 * @param {string} statisticsText Text content rendered in the statistics panel.
 * @returns {{ characters: number; words: number; sentences: number; paragraphs: number }}
 */
function parseStatisticsText(statisticsText) {
    const statisticsResult = {
        characters: 0,
        words: 0,
        sentences: 0,
        paragraphs: 0
    };

    const statisticSegments = statisticsText.split(STATISTICS_SEGMENT_SEPARATOR);
    for (const statisticSegment of statisticSegments) {
        const [rawLabel, rawValue] = statisticSegment.split(STATISTICS_VALUE_SEPARATOR);
        if (!rawLabel || !rawValue) {
            continue;
        }

        const normalizedLabel = rawLabel.trim().toLowerCase();
        const parsedValue = Number.parseInt(rawValue.trim(), 10);
        if (Number.isNaN(parsedValue)) {
            continue;
        }

        if (normalizedLabel === "characters") {
            statisticsResult.characters = parsedValue;
        } else if (normalizedLabel === "words") {
            statisticsResult.words = parsedValue;
        } else if (normalizedLabel === "sentences") {
            statisticsResult.sentences = parsedValue;
        } else if (normalizedLabel === "paragraphs") {
            statisticsResult.paragraphs = parsedValue;
        }
    }

    return statisticsResult;
}

test.describe("input statistics", () => {
    for (const typedParagraphCase of typedParagraphCases) {
        test(typedParagraphCase.name, async ({ page }) => {
            await page.goto(indexHtmlUrl);
            await page.waitForLoadState(PAGE_LOAD_STATE);

            const typedParagraphMarkup = `${typedParagraphCase.paragraphs
                .map((paragraphText) =>
                    PARAGRAPH_TEMPLATE.replace("{PARAGRAPH_CONTENT}", paragraphText)
                )
                .join("")}${TRAILING_BREAK_MARKUP}`;

            await page.evaluate(
                ({ editorSelector, markup, inputEventType }) => {
                    const editorElement = document.querySelector(editorSelector);
                    if (!(editorElement instanceof HTMLElement)) {
                        throw new Error(`Missing editor element for selector: ${editorSelector}`);
                    }
                    editorElement.innerHTML = markup;
                    const inputEvent = new Event(inputEventType, { bubbles: true });
                    editorElement.dispatchEvent(inputEvent);
                },
                {
                    editorSelector: SOURCE_TEXT_SELECTOR,
                    markup: typedParagraphMarkup,
                    inputEventType: INPUT_EVENT_TYPE
                }
            );

            const statisticsText = await page.locator(INPUT_STATS_SELECTOR).innerText();
            const statistics = parseStatisticsText(statisticsText);

            expect(statistics.paragraphs).toBe(typedParagraphCase.expected.paragraphs);
            expect(statistics.words).toBe(typedParagraphCase.expected.words);
        });
    }
});
