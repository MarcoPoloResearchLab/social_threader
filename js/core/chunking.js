// @ts-check
/**
 * @fileoverview Pure text processing utilities that compute chunk boundaries and statistics.
 */

import { TEXT_CONTENT } from "../constants.js";

/** @type {RegExp} */
const PARAGRAPH_SPLITTER = /(?:\r\n|\r|\n|\u2028|\u2029|\u0085)+/;
/** @type {string} */
const SENTENCE_ENDING_PUNCTUATION = ".!?";
/** @type {string} */
const TRAILING_WRAPPING_CHARACTERS = '"\')]}';

/**
 * Splits a block of text into words while preserving punctuation alongside the word that precedes it.
 * @param {string} textString Raw text provided by the user.
 * @returns {string[]} Ordered array of words with trailing punctuation retained.
 */
function splitIntoWordsPreservingPunctuation(textString) {
    const normalizedText = textString.replace(/\s+/g, " ").trim();
    if (normalizedText.length === 0) {
        return [];
    }

    /** @type {string[]} */
    const wordsArray = [];
    let currentWord = "";
    let insideQuote = false;

    for (let index = 0; index < normalizedText.length; index += 1) {
        const character = normalizedText[index];
        if (character === " " && !insideQuote) {
            if (currentWord.length > 0) {
                wordsArray.push(currentWord);
                currentWord = "";
            }
            continue;
        }

        if (character === '"') {
            insideQuote = !insideQuote;
        }

        currentWord += character;
    }

    if (currentWord.length > 0) {
        wordsArray.push(currentWord);
    }

    return wordsArray;
}

/**
 * Determines whether the provided word terminates a sentence.
 * @param {string} word Candidate word including punctuation.
 * @returns {boolean} True when the word signals the end of a sentence.
 */
function isSentenceEnd(word) {
    let strippedWord = word;
    while (strippedWord.length > 0 && TRAILING_WRAPPING_CHARACTERS.includes(strippedWord[strippedWord.length - 1])) {
        strippedWord = strippedWord.slice(0, -1);
    }
    if (strippedWord.length === 0) {
        return false;
    }
    return SENTENCE_ENDING_PUNCTUATION.includes(strippedWord[strippedWord.length - 1]);
}

/**
 * Aggregates words into sentences when the user opts into sentence awareness.
 * @param {string[]} wordsArray Array of words with punctuation attached.
 * @param {boolean} useSentenceBreak Flag specifying whether to enforce sentence boundaries.
 * @returns {string[]} Sentences derived from the provided words.
 */
function buildSentences(wordsArray, useSentenceBreak) {
    if (!useSentenceBreak) {
        return [wordsArray.join(" ")];
    }

    /** @type {string[]} */
    const sentencesArray = [];
    /** @type {string[]} */
    let currentSentence = [];

    for (const word of wordsArray) {
        currentSentence.push(word);
        if (isSentenceEnd(word)) {
            sentencesArray.push(currentSentence.join(" "));
            currentSentence = [];
        }
    }

    if (currentSentence.length > 0) {
        sentencesArray.push(currentSentence.join(" "));
    }

    return sentencesArray;
}

/**
 * Breaks a sentence into chunks constrained by the supplied maximum length.
 * @param {string} sentenceText Text containing a single sentence.
 * @param {number} maximumLength Character limit for each chunk.
 * @returns {string[]} Chunks extracted from the sentence.
 */
function chunkByLength(sentenceText, maximumLength) {
    /** @type {string[]} */
    const resultChunks = [];
    let remainingText = sentenceText.replace(/\s+/g, " ").trim();

    while (remainingText.length > 0) {
        if (remainingText.length <= maximumLength) {
            resultChunks.push(remainingText);
            break;
        }

        let breakIndex = -1;
        for (let index = maximumLength; index >= 0; index -= 1) {
            if (index > remainingText.length) {
                continue;
            }
            const candidateCharacter = remainingText.charAt(index);
            if (candidateCharacter === " " || /[.,!?;]/.test(candidateCharacter)) {
                breakIndex = index;
                break;
            }
        }

        if (breakIndex > 0) {
            resultChunks.push(remainingText.slice(0, breakIndex).trim());
            remainingText = remainingText.slice(breakIndex).trim();
        } else {
            resultChunks.push(remainingText.slice(0, maximumLength));
            remainingText = remainingText.slice(maximumLength).trim();
        }
    }

    return resultChunks;
}

/**
 * Computes a formatted enumeration label.
 * @param {string} chunkText Text contained in the chunk.
 * @param {number} chunkIndex Zero-based chunk index.
 * @param {number} totalChunks Total number of chunks produced.
 * @returns {string} Enumerated chunk text.
 */
function enumerateChunk(chunkText, chunkIndex, totalChunks) {
    return TEXT_CONTENT.ENUMERATION_TEMPLATE
        .replace("{text}", chunkText)
        .replace("{current}", String(chunkIndex + 1))
        .replace("{total}", String(totalChunks));
}

/**
 * Determines the maximum number of characters consumed by enumeration metadata.
 * @param {number} totalChunks Total number of chunks produced for the text.
 * @returns {number} Maximum overhead added by enumeration.
 */
function getMaximumEnumerationOverhead(totalChunks) {
    if (totalChunks <= 0) {
        return 0;
    }
    return enumerateChunk("", totalChunks - 1, totalChunks).length;
}

/**
 * Builds non-enumerated chunks using the supplied configuration.
 * @param {string} rawText Raw text provided by the user.
 * @param {import("../types.d.js").ThreadingOptions} options Threading configuration flags.
 * @returns {string[]} Array of base chunks constrained by the maximum length.
 */
function buildBaseChunks(rawText, options) {
    const availableLength = Math.max(1, options.maximumLength);

    if (options.breakOnParagraphs) {
        /** @type {string[]} */
        const paragraphChunks = [];
        const paragraphs = rawText.split(PARAGRAPH_SPLITTER);
        for (const paragraph of paragraphs) {
            const trimmedParagraph = paragraph.trim();
            if (trimmedParagraph.length === 0) {
                continue;
            }
            const nestedOptions = Object.assign({}, options, { breakOnParagraphs: false });
            paragraphChunks.push(...buildBaseChunks(trimmedParagraph, nestedOptions));
        }
        return paragraphChunks;
    }

    const wordsArray = splitIntoWordsPreservingPunctuation(rawText);
    if (wordsArray.length === 0) {
        return [];
    }

    const sentencesArray = buildSentences(wordsArray, options.breakOnSentences);
    /** @type {string[]} */
    const baseChunks = [];
    let currentChunk = "";

    for (const sentence of sentencesArray) {
        if (sentence.length > availableLength) {
            if (currentChunk.length > 0) {
                baseChunks.push(currentChunk);
                currentChunk = "";
            }
            baseChunks.push(...chunkByLength(sentence, availableLength));
            continue;
        }

        const potentialChunk = currentChunk.length > 0 ? `${currentChunk} ${sentence}` : sentence;
        if (potentialChunk.length <= availableLength) {
            currentChunk = potentialChunk;
        } else {
            if (currentChunk.length > 0) {
                baseChunks.push(currentChunk);
            }
            currentChunk = sentence;
        }
    }

    if (currentChunk.length > 0) {
        baseChunks.push(currentChunk);
    }

    return baseChunks;
}

/**
 * Calculates statistics for a given chunk of text.
 * @param {string} chunkText Text to analyze.
 * @returns {import("../types.d.js").ChunkStatistics} Derived statistics.
 */
function calculateStatistics(chunkText) {
    const trimmedInput = chunkText.trim();
    const paragraphMatches = chunkText
        .split(PARAGRAPH_SPLITTER)
        .map((paragraphText) => paragraphText.trim())
        .filter((paragraphText) => paragraphText.length > 0);

    const wordsArray = splitIntoWordsPreservingPunctuation(chunkText);
    const sentencesArray = wordsArray.length === 0 ? [] : buildSentences(wordsArray, true);
    const filteredSentences = sentencesArray.filter((sentenceText) => sentenceText.trim().length > 0);

    return {
        characters: chunkText.length,
        words: wordsArray.length,
        sentences: filteredSentences.length,
        paragraphs: trimmedInput.length === 0 ? 0 : paragraphMatches.length
    };
}

/**
 * Generates threaded chunks from the provided text.
 * @param {string} rawText Raw text entered by the user.
 * @param {import("../types.d.js").ThreadingOptions} options Threading configuration flags.
 * @returns {string[]} Ordered list of chunk strings, optionally enumerated.
 */
function getChunks(rawText, options) {
    if (!options.enumerate) {
        return buildBaseChunks(rawText, options);
    }

    let effectiveMaximumLength = Math.max(1, options.maximumLength);
    /** @type {string[]} */
    let baseChunks = [];

    while (true) {
        const iterationOptions = Object.assign({}, options, { maximumLength: effectiveMaximumLength });
        baseChunks = buildBaseChunks(rawText, iterationOptions);
        if (baseChunks.length === 0) {
            return [];
        }

        const enumerationOverhead = getMaximumEnumerationOverhead(baseChunks.length);
        const nextEffectiveMaximumLength = Math.max(1, options.maximumLength - enumerationOverhead);

        if (nextEffectiveMaximumLength === effectiveMaximumLength) {
            break;
        }

        effectiveMaximumLength = nextEffectiveMaximumLength;
    }

    return baseChunks.map((chunkText, index) => enumerateChunk(chunkText, index, baseChunks.length));
}

export const chunkingService = Object.freeze({
    splitIntoWordsPreservingPunctuation,
    buildSentences,
    chunkByLength,
    getChunks,
    calculateStatistics
});
