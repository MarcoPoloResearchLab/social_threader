// @ts-check
/**
 * @fileoverview Executes the browser-facing regression suite using Puppeteer.
 */

import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer";

const SOURCE_TEXT_SELECTOR = "#sourceText";
const INPUT_STATS_SELECTOR = "#inputStats";
const PARAGRAPH_TEMPLATE = "<div>{PARAGRAPH_CONTENT}</div>";
const TRAILING_BREAK_MARKUP = "<div><br></div>";
const STATISTICS_SEGMENT_SEPARATOR = " | ";
const STATISTICS_VALUE_SEPARATOR = ": ";
const WAIT_UNTIL_EVENT = "load";
const INPUT_EVENT_TYPE = "input";
const HEADLESS_MODE = "new";
const PUPPETEER_ARGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--allow-file-access-from-files",
    "--enable-local-file-accesses"
];
const POLL_INTERVAL_MS = 200;
const MAX_STATISTICS_POLL_ATTEMPTS = 15;

const typedParagraphCases = [
    {
        name: "two paragraphs update statistics counts",
        paragraphs: [
            "Puppeteer ensures reliable browser coverage.",
            "Browser automation validates paragraph counts."
        ],
        expected: {
            characters: 92,
            words: 10,
            sentences: 2,
            paragraphs: 2
        }
    },
    {
        name: "multi-paragraph copy updates every statistic",
        paragraphs: [
            "Sentences wrong. Paragraphs wrong.",
            "Words wrong everywhere."
        ],
        expected: {
            characters: 59,
            words: 7,
            sentences: 3,
            paragraphs: 2
        }
    },
    {
        name: "abbreviations and decimals do not inflate statistics",
        paragraphs: [
            "Dr. Rivera met approx. 30 volunteers at 5.5 p.m. for training.",
            "Everyone said, \"Progress is slow... but steady!\" Did it improve?",
            "Next check-in is scheduled for Jan. 3rd, 2025."
        ],
        expected: {
            characters: 176,
            words: 29,
            sentences: 4,
            paragraphs: 3
        }
    }
];

const currentFilePath = fileURLToPath(import.meta.url);
const repositoryRootPath = path.resolve(path.dirname(currentFilePath), "..");
const indexHtmlUrl = pathToFileURL(path.join(repositoryRootPath, "index.html")).toString();

/**
 * @param {string} statisticsText
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

/**
 * @returns {{ pass: (name: string) => void; fail: (name: string, error: unknown) => void; summarize: () => number }}
 */
function createResultRecorder() {
    let passed = 0;
    let failed = 0;

    return {
        pass(name) {
            console.log(`✅ ${name}`);
            passed += 1;
        },
        fail(name, error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log(`❌ ${name} - ${errorMessage}`);
            failed += 1;
        },
        summarize() {
            console.log(`Passed: ${passed}, Failed: ${failed}`);
            return failed;
        }
    };
}

/**
 * @param {import("puppeteer").Page} page
 * @param {(name: string) => void} pass
 * @param {(name: string, error: unknown) => void} fail
 * @returns {Promise<void>}
 */
async function runInputStatisticsSuite(page, pass, fail) {
    for (const typedParagraphCase of typedParagraphCases) {
        const testName = `input statistics - ${typedParagraphCase.name}`;
        try {
            await page.goto(indexHtmlUrl, { waitUntil: WAIT_UNTIL_EVENT });

            const typedParagraphMarkup = `${typedParagraphCase.paragraphs
                .map((paragraphText) =>
                    PARAGRAPH_TEMPLATE.replace("{PARAGRAPH_CONTENT}", paragraphText)
                )
                // Newlines ensure the inert document used by the app preserves paragraph separators.
                .join(`\n${TRAILING_BREAK_MARKUP}\n`)}\n${TRAILING_BREAK_MARKUP}`;

            await page.$eval(
                SOURCE_TEXT_SELECTOR,
                (editorElement, options) => {
                    if (!(editorElement instanceof HTMLElement)) {
                        throw new Error(`Missing editor element for selector: ${options.editorSelector}`);
                    }

                    editorElement.innerHTML = options.markup;
                    const inputEvent = typeof InputEvent === "function"
                        ? new InputEvent(options.inputEventType, {
                              bubbles: true,
                              inputType: "insertFromPaste"
                          })
                        : new Event(options.inputEventType, { bubbles: true });
                    editorElement.dispatchEvent(inputEvent);
                },
                {
                    editorSelector: SOURCE_TEXT_SELECTOR,
                    markup: typedParagraphMarkup,
                    inputEventType: INPUT_EVENT_TYPE
                }
            );

            let statisticsText = "";
            let statistics = {
                characters: 0,
                words: 0,
                sentences: 0,
                paragraphs: 0
            };

            for (let attempt = 0; attempt < MAX_STATISTICS_POLL_ATTEMPTS; attempt += 1) {
                statisticsText = await page.$eval(INPUT_STATS_SELECTOR, (element) => {
                    if (!(element instanceof HTMLElement)) {
                        throw new Error(`Missing statistics element for selector: ${INPUT_STATS_SELECTOR}`);
                    }
                    return element.innerText;
                });

                statistics = parseStatisticsText(statisticsText);
                if (
                    statistics.characters === typedParagraphCase.expected.characters &&
                    statistics.words === typedParagraphCase.expected.words &&
                    statistics.sentences === typedParagraphCase.expected.sentences &&
                    statistics.paragraphs === typedParagraphCase.expected.paragraphs
                ) {
                    break;
                }

                await delay(POLL_INTERVAL_MS);
            }

            const expected = typedParagraphCase.expected;

            if (statistics.characters !== expected.characters) {
                throw new Error(
                    `Expected characters=${expected.characters} ` +
                        `but received ${statistics.characters}. Latest statistics text: ${statisticsText}`
                );
            }

            if (statistics.words !== expected.words) {
                throw new Error(
                    `Expected words=${expected.words} ` +
                        `but received ${statistics.words}. Latest statistics text: ${statisticsText}`
                );
            }

            if (statistics.sentences !== expected.sentences) {
                throw new Error(
                    `Expected sentences=${expected.sentences} ` +
                        `but received ${statistics.sentences}. Latest statistics text: ${statisticsText}`
                );
            }

            if (statistics.paragraphs !== expected.paragraphs) {
                throw new Error(
                    `Expected paragraphs=${expected.paragraphs} ` +
                        `but received ${statistics.paragraphs}. Latest statistics text: ${statisticsText}`
                );
            }

            pass(testName);
        } catch (error) {
            fail(testName, error);
        }
    }
}

async function main() {
    const browser = await puppeteer.launch({ headless: HEADLESS_MODE, args: PUPPETEER_ARGS });
    const page = await browser.newPage();
    const { pass, fail, summarize } = createResultRecorder();

    try {
        await runInputStatisticsSuite(page, pass, fail);
    } finally {
        await browser.close();
    }

    const failureCount = summarize();
    if (failureCount > 0) {
        process.exitCode = failureCount;
    }
}

main().catch((error) => {
    console.error("Puppeteer suite failed:", error);
    process.exitCode = 1;
});
/**
 * @param {number} milliseconds
 * @returns {Promise<void>}
 */
function delay(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

