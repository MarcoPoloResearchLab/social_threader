// @ts-check
/**
 * @fileoverview Behavior-driven tests for the chunking service.
 */

import { chunkingService } from "../js/core/chunking.js";
import { assertDeepEqual, assertEqual } from "./assert.js";

/**
 * Executes chunking unit tests.
 * @param {(name: string, fn: () => (void | Promise<void>)) => Promise<void>} runTest Test harness callback.
 * @returns {Promise<void>}
 */
export async function runChunkingTests(runTest) {
    const chunkCases = [
        {
            name: "splits text according to length without sentence enforcement",
            input: "This is a demonstration sentence that should be broken into predictable pieces.",
            options: {
                maximumLength: 20,
                breakOnSentences: false,
                enumerate: false,
                breakOnParagraphs: false
            },
            expected: [
                "This is a",
                "demonstration",
                "sentence that should",
                "be broken into",
                "predictable pieces."
            ]
        },
        {
            name: "respects sentence boundaries when enabled",
            input: "Hello world! Another idea appears. Short.",
            options: {
                maximumLength: 50,
                breakOnSentences: true,
                enumerate: false,
                breakOnParagraphs: false
            },
            expected: [
                "Hello world! Another idea appears. Short."
            ]
        },
        {
            name: "enumerates final chunks",
            input: "Alpha bravo charlie delta echo.",
            options: {
                maximumLength: 12,
                breakOnSentences: false,
                enumerate: true,
                breakOnParagraphs: false
            },
            expected: [
                "Alpha (1/6)",
                "bravo (2/6)",
                "charli (3/6)",
                "e (4/6)",
                "delta (5/6)",
                "echo. (6/6)"
            ]
        },
        {
            name: "splits by paragraphs before additional processing",
            input: "First paragraph.\n\nSecond paragraph has more content than the first entry.",
            options: {
                maximumLength: 25,
                breakOnSentences: false,
                enumerate: false,
                breakOnParagraphs: true
            },
            expected: [
                "First paragraph.",
                "Second paragraph has more",
                "content than the first",
                "entry."
            ]
        },
        {
            name: "respects multi-line paragraphs ending with parentheses",
            input: [
                "There are religious holidays (Christmas, Rosh Hashanah, Eid, Diwali, etc.)",
                "There are pagan (old religions) holidays (solstices, harvest, Lunar New Year, etc.)",
                "There are social contract holidays (Independence Day, Labor Day, etc.)",
                "But there are no technology celebration holidays even though each of these holidays was enabled by technology."
            ].join("\n \u00A0 \n"),
            options: {
                maximumLength: 280,
                breakOnSentences: false,
                enumerate: false,
                breakOnParagraphs: true
            },
            expected: [
                "There are religious holidays (Christmas, Rosh Hashanah, Eid, Diwali, etc.)",
                "There are pagan (old religions) holidays (solstices, harvest, Lunar New Year, etc.)",
                "There are social contract holidays (Independence Day, Labor Day, etc.)",
                "But there are no technology celebration holidays even though each of these holidays was enabled by technology."
            ]
        }
    ];

    for (const testCase of chunkCases) {
        await runTest(testCase.name, () => {
            const actualChunks = chunkingService.getChunks(testCase.input, testCase.options);
            assertDeepEqual(actualChunks, testCase.expected, "chunk output should match expectations");
            if (testCase.options.enumerate) {
                const withinLimit = actualChunks.every(
                    (chunk) => chunk.length <= testCase.options.maximumLength
                );
                assertEqual(withinLimit, true, "enumerated chunks should respect the maximum length");
            }
        });
    }

    const statisticsCases = [
        {
            name: "calculates statistics for provided text",
            input: "One two three. This is four?",
            expected: {
                characters: 28,
                words: 6,
                sentences: 2,
                paragraphs: 1
            }
        },
        {
            name: "counts sentences and paragraphs when parentheses close text",
            input: "First idea (alpha etc.)\rSecond idea (beta etc.)",
            expected: {
                characters: 47,
                words: 8,
                sentences: 2,
                paragraphs: 2
            }
        },
        {
            name: "detects paragraphs separated by whitespace-wrapped line breaks",
            input: [
                "There are religious holidays (Christmas, Rosh Hashanah, Eid, Diwali, etc.)",
                "There are pagan (old religions) holidays (solstices, harvest, Lunar New Year, etc.)",
                "There are social contract holidays (Independence Day, Labor Day, etc.)",
                "But there are no technology celebration holidays even though each of these holidays was enabled by technology."
            ].join("\n \u00A0 \n"),
            expected: {
                characters: 352,
                words: 49,
                sentences: 4,
                paragraphs: 4
            }
        }
    ];

    for (const statisticsCase of statisticsCases) {
        await runTest(statisticsCase.name, () => {
            const statistics = chunkingService.calculateStatistics(statisticsCase.input);
            assertDeepEqual(statistics, statisticsCase.expected, "statistics should match expected values");
        });
    }
}
