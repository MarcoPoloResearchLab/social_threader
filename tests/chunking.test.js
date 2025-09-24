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
                "Alpha bravo (1/3)",
                "charlie (2/3)",
                "delta echo. (3/3)"
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
        }
    ];

    for (const testCase of chunkCases) {
        await runTest(testCase.name, () => {
            const actualChunks = chunkingService.getChunks(testCase.input, testCase.options);
            assertDeepEqual(actualChunks, testCase.expected, "chunk output should match expectations");
        });
    }

    await runTest("calculates statistics for provided text", () => {
        const statistics = chunkingService.calculateStatistics("One two three. This is four?");
        assertEqual(statistics.characters, 28, "character count should match");
        assertEqual(statistics.words, 6, "word count should match");
        assertEqual(statistics.sentences, 2, "sentence count should match");
    });
}
