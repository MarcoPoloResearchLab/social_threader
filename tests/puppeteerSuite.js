// @ts-check
/**
 * @fileoverview Executes the browser-facing regression suite using Puppeteer.
 */

import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { runProductDirectorySuite } from "./productDirectorySuite.js";
import { runPublicPagesSeoSuite } from "./publicPagesSeoSuite.js";
import { LOOPAWARE_PIXEL_URL_PREFIX, PUBLIC_LOOPAWARE_SITE_ID } from "./publicPagesSeoSupport.js";
import { runSharedUiMigrationSuite } from "./sharedUiMigrationSuite.js";
import { runPlatformControlsBrowserSuite } from "./platformControlsPuppeteerSuite.js";
import { runHeaderBrandBrowserSuite } from "./headerBrandPuppeteerSuite.js";
import {
    runTransformationBrowserSuite,
    startTransformationApiServer
} from "./transformationPuppeteerSuite.js";

const LOOPAWARE_WIDGET_URL = `https://loopaware.mprlab.com/widget.js?site_id=${PUBLIC_LOOPAWARE_SITE_ID}`;
const LOOPAWARE_CONFIG_URL = `https://loopaware-api.mprlab.com/public/widget-config?site_id=${PUBLIC_LOOPAWARE_SITE_ID}`;
const LOOPAWARE_BUBBLE_SELECTOR = "#mp-feedback-bubble";
const LOOPAWARE_PANEL_SELECTOR = "#mp-feedback-panel";
const LOOPAWARE_TEST_CONFIG = Object.freeze({
    site_id: PUBLIC_LOOPAWARE_SITE_ID,
    widget_bubble_side: "right",
    widget_bubble_bottom_offset: 16,
    widget_accent_color: "#0d6efd",
    widget_show_message_input: true,
    widget_show_sentiment_buttons: true
});

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

const pastedParagraphCases = [
    {
        name: "two paragraphs update statistics counts",
        paragraphs: [
            "Puppeteer ensures reliable browser coverage.",
            "Browser automation validates paragraph counts."
        ],
        expected: {
            characters: 91,
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
            characters: 58,
            words: 7,
            sentences: 3,
            paragraphs: 2
        }
    },
    {
        name: "abbreviations and decimals do not inflate statistics",
        paragraphs: [
            "Dr. Rivera met approx. 30 volunteers at 5.5 p.m. for training.",
            "",
            "Everyone said, \"Progress is slow... but steady!\" Did it improve?",
            "",
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

const typingParagraphCases = [
    {
        name: "three typed paragraphs report full statistics",
        paragraphs: [
            "Paragraph #1.",
            "Paragraph #2.",
            "Paragraph #3."
        ],
        expected: {
            characters: 41,
            words: 6,
            sentences: 3,
            paragraphs: 3
        }
    }
];

const currentFilePath = fileURLToPath(import.meta.url);
const repositoryRootPath = path.resolve(path.dirname(currentFilePath), "..");

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
 * Determines the correct MIME type for the requested file.
 * @param {string} filePath
 * @returns {string}
 */
function getMimeType(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === ".html") {
        return "text/html; charset=utf-8";
    }
    if (extension === ".js") {
        return "text/javascript; charset=utf-8";
    }
    if (extension === ".css") {
        return "text/css; charset=utf-8";
    }
    if (extension === ".svg") {
        return "image/svg+xml";
    }
    if (extension === ".json") {
        return "application/json; charset=utf-8";
    }
    if (extension === ".png") {
        return "image/png";
    }
    if (extension === ".jpg" || extension === ".jpeg") {
        return "image/jpeg";
    }
    if (extension === ".ico") {
        return "image/x-icon";
    }
    return "application/octet-stream";
}

/**
 * Launches a lightweight static file server rooted at the repository path.
 * @param {string} rootDirectory
 * @returns {Promise<{ origin: string; close: () => Promise<void> }>}
 */
function startStaticServer(rootDirectory) {
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (request, response) => {
            try {
                const requestUrl = new URL(request.url || "/", "http://localhost");
                const requestedPathname = requestUrl.pathname;
                const candidatePath = requestedPathname.endsWith("/")
                    ? `${requestedPathname}index.html`
                    : requestedPathname;
                const normalizedRelativePath = path
                    .normalize(candidatePath)
                    .replace(/^([\\/])+/, "");
                const resolvedFilePath = path.join(rootDirectory, normalizedRelativePath);

                if (!resolvedFilePath.startsWith(rootDirectory)) {
                    response.writeHead(403).end("Forbidden");
                    return;
                }

                let filePath = resolvedFilePath;
                const fileStats = await fs.stat(filePath).catch(() => null);
                if (!fileStats) {
                    response.writeHead(404).end("Not Found");
                    return;
                }

                if (fileStats.isDirectory()) {
                    filePath = path.join(filePath, "index.html");
                }

                const fileContent = await fs.readFile(filePath);
                response.writeHead(200, { "Content-Type": getMimeType(filePath) });
                response.end(fileContent);
            } catch (error) {
                response.writeHead(500).end("Internal Server Error");
            }
        });

        server.on("error", (error) => {
            reject(error);
        });

        server.listen(0, () => {
            const addressInfo = server.address();
            if (!addressInfo || typeof addressInfo === "string") {
                reject(new Error("Unable to determine static server port"));
                return;
            }

            const origin = `http://127.0.0.1:${addressInfo.port}`;
            resolve({
                origin,
                close: () =>
                    new Promise((resolveClose) => {
                        server.close(() => resolveClose());
                    })
            });
        });
    });
}

/**
 * @param {import("puppeteer").Page} page
 * @param {{ characters: number; words: number; sentences: number; paragraphs: number }} expected
 * @returns {Promise<{ statistics: { characters: number; words: number; sentences: number; paragraphs: number }; statisticsText: string }>}
 */
async function waitForExpectedStatistics(page, expected) {
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
            statistics.characters === expected.characters &&
            statistics.words === expected.words &&
            statistics.sentences === expected.sentences &&
            statistics.paragraphs === expected.paragraphs
        ) {
            break;
        }

        await delay(POLL_INTERVAL_MS);
    }

    return { statistics, statisticsText };
}

async function runInputStatisticsSuite(page, pass, fail, indexUrl) {
    for (const pastedCase of pastedParagraphCases) {
        const testName = `input statistics - ${pastedCase.name}`;
        try {
            await page.goto(indexUrl, { waitUntil: WAIT_UNTIL_EVENT });

            const typedParagraphMarkup = `${pastedCase.paragraphs
                .map((paragraphText) => {
                    if (paragraphText.trim().length === 0) {
                        return TRAILING_BREAK_MARKUP;
                    }
                    return PARAGRAPH_TEMPLATE.replace("{PARAGRAPH_CONTENT}", paragraphText);
                })
                .join("\n")}\n${TRAILING_BREAK_MARKUP}`;

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

            const { statistics, statisticsText } = await waitForExpectedStatistics(
                page,
                pastedCase.expected
            );
            const expected = pastedCase.expected;

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

    for (const typingCase of typingParagraphCases) {
        const testName = `typing statistics - ${typingCase.name}`;
        try {
            await page.goto(indexUrl, { waitUntil: WAIT_UNTIL_EVENT });
            await page.focus(SOURCE_TEXT_SELECTOR);
            await page.$eval(SOURCE_TEXT_SELECTOR, (editorElement) => {
                if (!(editorElement instanceof HTMLElement)) {
                    throw new Error(`Missing editor element for selector: ${SOURCE_TEXT_SELECTOR}`);
                }
                editorElement.innerHTML = "";
            });

            for (let index = 0; index < typingCase.paragraphs.length; index += 1) {
                const paragraphText = typingCase.paragraphs[index];
                await page.type(SOURCE_TEXT_SELECTOR, paragraphText);
                if (index < typingCase.paragraphs.length - 1) {
                    await page.keyboard.press("Enter");
                }
            }

            const { statistics, statisticsText } = await waitForExpectedStatistics(
                page,
                typingCase.expected
            );

            const expected = typingCase.expected;

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

/**
 * Verify option availability as the user changes the draft.
 * @param {import("puppeteer").Page} page
 * @param {(name: string) => void} pass
 * @param {(name: string, error: unknown) => void} fail
 * @param {string} indexUrl
 * @returns {Promise<void>}
 */
async function runChunkingOptionsSuite(page, pass, fail, indexUrl) {
    const testName = "chunking options follow draft content and reset after clearing";
    const optionsSelector = ".toggle-options input";
    const cases = [
        { markup: null, enabled: [false, false, false] },
        { markup: "<div>One sentence.</div>", enabled: [false, true, true] },
        { markup: "<div>First paragraph.</div><div>Second paragraph.</div>", enabled: [true, true, true] },
        { markup: '<img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1\' height=\'1\'/%3E" alt="Attached image">', enabled: [false, false, true] },
        { markup: "<div> &nbsp; </div>", enabled: [false, false, false] },
        { markup: "One sentence again.", enabled: [false, true, true] },
        { markup: "", enabled: [false, false, false] }
    ];
    try {
        await page.goto(indexUrl, { waitUntil: WAIT_UNTIL_EVENT });
        for (const testCase of cases) {
            if (testCase.markup !== null) {
                await page.$eval(SOURCE_TEXT_SELECTOR, (editor, markup) => {
                    editor.innerHTML = markup;
                    editor.dispatchEvent(new Event("input", { bubbles: true }));
                }, testCase.markup);
            }
            const actual = await page.$$eval(optionsSelector, inputs => inputs.map(input => ({ enabled: !input.disabled, checked: input.checked })));
            if (JSON.stringify(actual.map(input => input.enabled)) !== JSON.stringify(testCase.enabled)) {
                throw new Error(`Unexpected options for ${testCase.markup}: ${JSON.stringify(actual)}`);
            }
            for (const [optionIndex, input] of actual.entries()) {
                if (!input.enabled && input.checked) {
                    throw new Error(`Disabled option ${optionIndex} remains selected`);
                }
            }
            if (testCase.enabled.every(Boolean)) {
                for (const input of await page.$$(optionsSelector)) await input.click();
            }
        }
        pass(testName);
    } catch (error) {
        fail(testName, error);
    }
}

/**
 * Verifies the released feedback widget through the real application page.
 * Provider configuration is controlled to support the test server origin.
 * @param {import("puppeteer").Page} page
 * @param {(name: string) => void} pass
 * @param {(name: string, error: unknown) => void} fail
 * @param {string} indexUrl
 * @returns {Promise<void>}
 */
async function runFeedbackWidgetSuite(page, pass, fail, indexUrl) {
    const testName = "LoopAware feedback opens and closes with the Social Threader site identity";
    try {
        await page.goto(indexUrl, { waitUntil: WAIT_UNTIL_EVENT });
        const embed = await page.evaluate(() => ({
            widgetScripts: [...document.scripts].filter(script => script.src.includes("/widget.js")).map(script => ({ src: script.src, defer: script.defer })),
            legacyScripts: [...document.scripts].filter(script => script.src.includes("formspree.io")).length,
            legacyInitializer: typeof window.formbutton
        }));
        if (embed.widgetScripts.length !== 1 || embed.widgetScripts[0].src !== LOOPAWARE_WIDGET_URL || !embed.widgetScripts[0].defer) {
            throw new Error(`Incorrect feedback embed: ${JSON.stringify(embed)}`);
        }
        if (embed.legacyScripts !== 0 || embed.legacyInitializer !== "undefined") {
            throw new Error("Formspree feedback remains active");
        }
        await page.waitForSelector(LOOPAWARE_BUBBLE_SELECTOR, { visible: true });
        await page.click(LOOPAWARE_BUBBLE_SELECTOR);
        await page.waitForSelector(LOOPAWARE_PANEL_SELECTOR, { visible: true });
        await page.waitForSelector("#mp-feedback-contact", { visible: true });
        await page.waitForSelector("#mp-feedback-message", { visible: true });
        await page.waitForSelector("#mp-feedback-sentiment", { visible: true });
        await page.click(`${LOOPAWARE_PANEL_SELECTOR} button[aria-label="Close feedback panel"]`);
        await page.waitForSelector(LOOPAWARE_PANEL_SELECTOR, { hidden: true });
        pass(testName);
    } catch (error) {
        fail(testName, error);
    }
}

async function main() {
    const staticServer = await startStaticServer(repositoryRootPath);
    const transformationApiServer = await startTransformationApiServer(staticServer.origin);
    const indexUrl = `${staticServer.origin}/index.html`;
    const publicPageUiConfig = (await fs.readFile(path.join(repositoryRootPath, 'config-ui.yaml'), 'utf8'))
        .replace('http://localhost:4173', staticServer.origin);
    const browser = await puppeteer.launch({ headless: HEADLESS_MODE, args: PUPPETEER_ARGS });
    const page = await browser.newPage();
    /** @param {import("puppeteer").HTTPRequest} request */
    const handlePublicPageRequest = (request) => {
        const requestUrl = new URL(request.url());
        if (requestUrl.origin === staticServer.origin && requestUrl.pathname === '/config-ui.yaml') {
            void request.respond({ status: 200, contentType: 'text/yaml', body: publicPageUiConfig });
            return;
        }
        if (requestUrl.origin === staticServer.origin && requestUrl.pathname === '/auth/session') {
            void request.respond({ status: 401, contentType: 'application/json', body: '{"error":"unauthorized"}' });
            return;
        }
        if (request.url() === LOOPAWARE_CONFIG_URL) {
            void request.respond({
                status: 200,
                contentType: "application/json",
                headers: { "Access-Control-Allow-Origin": staticServer.origin },
                body: JSON.stringify(LOOPAWARE_TEST_CONFIG)
            });
            return;
        }
        if (request.url().startsWith(LOOPAWARE_PIXEL_URL_PREFIX)) {
            void request.abort();
            return;
        }
        void request.continue();
    };
    const { pass, fail, summarize } = createResultRecorder();

    try {
        if (process.env.SOCIAL_THREADER_DIRECTORY_ONLY === "1") {
            await runProductDirectorySuite(browser, pass, fail, staticServer.origin);
            process.exitCode = summarize() > 0 ? 1 : 0;
            return;
        }
        await page.setRequestInterception(true);
        page.on("request", handlePublicPageRequest);
        await runFeedbackWidgetSuite(page, pass, fail, indexUrl);
        await runInputStatisticsSuite(page, pass, fail, indexUrl);
        await runHeaderBrandBrowserSuite(page, pass, fail, indexUrl);
        await runPlatformControlsBrowserSuite(page, pass, fail, indexUrl);
        await runChunkingOptionsSuite(page, pass, fail, indexUrl);
        await runPublicPagesSeoSuite(page, pass, fail, staticServer.origin);
        page.off("request", handlePublicPageRequest);
        await page.setRequestInterception(false);
        await runTransformationBrowserSuite(
            page,
            pass,
            fail,
            indexUrl,
            staticServer.origin,
            transformationApiServer
        );
        await runSharedUiMigrationSuite(browser, pass, fail, staticServer.origin);
        await runProductDirectorySuite(browser, pass, fail, staticServer.origin);
    } finally {
        page.off("request", handlePublicPageRequest);
        await browser.close();
        await transformationApiServer.close();
        await staticServer.close();
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
