// @ts-check
/**
 * @fileoverview Pure text processing utilities that compute chunk boundaries and statistics.
 */

import { TEXT_CONTENT } from "../constants.js";

/** @type {RegExp} */
const EMBEDDED_WHITESPACE_BETWEEN_BREAKS = /\n[^\S\n]+\n/g;
/** @type {RegExp} */
const LINE_SEPARATOR_PATTERN = /\r\n|\r|\n|\u2028|\u2029|\u0085|\u000b|\u000c/g;
/** @type {RegExp} */
const MULTIPLE_WHITESPACE_PATTERN = /\s+/g;
/** @type {RegExp} */
const TAB_CHARACTER_PATTERN = /\t+/g;
/** @type {string} */
const TRAILING_WRAPPING_CHARACTERS = '"\')]}';
/** @type {string} */
const LEADING_PUNCTUATION_TO_IGNORE = "\"'([{“”‘’`";
/** @type {RegExp} */
const SENTENCE_TERMINATOR_PATTERN = /[.!?]+$/;
/** @type {RegExp} */
const LIST_MARKER_PATTERN = /^(?:[-*+•‣◦]|\d+[.)]|[a-zA-Z][.)])\s+/;
/** @type {RegExp} */
const MULTI_INITIAL_PATTERN = /^(?:[a-z]\.){2,}$/i;
/** @type {RegExp} */
const SINGLE_INITIAL_PATTERN = /^[a-z]\.$/i;
/** @type {RegExp} */
const ORDINAL_NUMBER_PATTERN = /^\d+(?:st|nd|rd|th)?\.$/i;
/** @type {RegExp} */
const ELLIPSIS_PATTERN = /\u2026|\.\.\.$/;
/** @type {RegExp} */
const DECIMAL_LIKE_PATTERN = /^\d+\.\d+$/;

const STRICT_NON_TERMINATING_ABBREVIATIONS = Object.freeze(
    new Set([
        "capt.",
        "dr.",
        "gov.",
        "hon.",
        "jr.",
        "lt.",
        "mr.",
        "mrs.",
        "ms.",
        "prof.",
        "sr.",
        "st."
    ])
);

const FLEXIBLE_ABBREVIATIONS = Object.freeze(
    new Set([
        "approx.",
        "appt.",
        "ave.",
        "corp.",
        "etc.",
        "fig.",
        "inc.",
        "vs.",
        "i.e.",
        "e.g.",
        "u.s.",
        "u.k.",
        "a.m.",
        "p.m.",
        "no.",
        "vol."
    ])
);

/**
 * Normalizes whitespace-only lines to ensure consistent line separator handling.
 * @param {string} rawText Raw text provided by the user.
 * @returns {string} Text with canonical line separators and collapsed whitespace-only breaks.
 */
function normalizeLineSeparators(rawText) {
    const standardizedBreaks = rawText.replace(LINE_SEPARATOR_PATTERN, "\n");
    return standardizedBreaks.replace(EMBEDDED_WHITESPACE_BETWEEN_BREAKS, "\n\n");
}

/**
 * Trims leading and trailing whitespace from a line while converting tabs to spaces.
 * @param {string} lineContent Raw line segment extracted from the text.
 * @returns {string} Sanitized line content.
 */
function sanitizeLineContent(lineContent) {
    return lineContent.replace(TAB_CHARACTER_PATTERN, " ").trim();
}

/**
 * Strips trailing wrapping characters such as quotes or parentheses.
 * @param {string} token Word token to sanitize.
 * @returns {string} Token without trailing wrapping characters.
 */
function stripTrailingWrappingCharacters(token) {
    let sanitizedToken = token;
    while (
        sanitizedToken.length > 0 &&
        TRAILING_WRAPPING_CHARACTERS.includes(sanitizedToken.charAt(sanitizedToken.length - 1))
    ) {
        sanitizedToken = sanitizedToken.slice(0, -1);
    }
    return sanitizedToken;
}

/**
 * Determines the classification of an abbreviation if applicable.
 * @param {string} token Candidate token potentially representing an abbreviation.
 * @returns {"strict" | "flexible" | null} Classification result or null when not an abbreviation.
 */
function classifyAbbreviation(token) {
    const normalizedToken = stripTrailingWrappingCharacters(token).toLowerCase();
    if (normalizedToken.length === 0) {
        return null;
    }

    if (STRICT_NON_TERMINATING_ABBREVIATIONS.has(normalizedToken)) {
        return "strict";
    }

    if (MULTI_INITIAL_PATTERN.test(normalizedToken)) {
        return "strict";
    }

    if (SINGLE_INITIAL_PATTERN.test(normalizedToken)) {
        return "strict";
    }

    if (FLEXIBLE_ABBREVIATIONS.has(normalizedToken)) {
        return "flexible";
    }

    return null;
}

/**
 * Determines whether a word token represents a decimal number that should not trigger sentence detection.
 * @param {string} token Candidate token including punctuation.
 * @returns {boolean} True when the token is decimal-like and should not end a sentence.
 */
function isDecimalNotation(token) {
    const normalizedToken = stripTrailingWrappingCharacters(token).toLowerCase();
    return DECIMAL_LIKE_PATTERN.test(normalizedToken);
}

/**
 * Retrieves the first alphanumeric character in a string, skipping leading punctuation.
 * @param {string} value Source string.
 * @returns {string} First meaningful character or an empty string when none exists.
 */
function getFirstSignificantCharacter(value) {
    for (let index = 0; index < value.length; index += 1) {
        const character = value.charAt(index);
        if (LEADING_PUNCTUATION_TO_IGNORE.includes(character)) {
            continue;
        }
        return character;
    }
    return "";
}

/**
 * Determines whether the next non-empty line should start a new paragraph based on punctuation heuristics.
 * @param {string} previousLine Previously accumulated line content.
 * @param {string} currentLine Current line content under consideration.
 * @returns {boolean} True when the current line should begin a new paragraph.
 */
function shouldStartNewParagraph(previousLine, currentLine) {
    if (LIST_MARKER_PATTERN.test(currentLine)) {
        return true;
    }

    const strippedPrevious = stripTrailingWrappingCharacters(previousLine);
    if (strippedPrevious.length === 0) {
        return false;
    }

    if (!SENTENCE_TERMINATOR_PATTERN.test(strippedPrevious)) {
        return false;
    }

    const firstCharacter = getFirstSignificantCharacter(currentLine);
    if (firstCharacter.length === 0) {
        return false;
    }

    if (!/[a-z0-9]/i.test(firstCharacter)) {
        return false;
    }

    return firstCharacter.toUpperCase() === firstCharacter;
}

/**
 * Normalizes paragraph breaks in the provided text.
 * @param {string} rawText Raw text provided by the user.
 * @returns {string[]} Trimmed paragraphs extracted from the text.
 */
function extractParagraphs(rawText) {
    const trimmedInput = rawText.trim();
    if (trimmedInput.length === 0) {
        return [];
    }

    const normalizedSeparators = normalizeLineSeparators(rawText.replace(/\u00a0/g, " "));
    const lines = normalizedSeparators.split("\n");

    /** @type {string[]} */
    const paragraphs = [];
    /** @type {string[]} */
    let currentParagraphLines = [];
    let previousLineBlank = false;

    for (const rawLine of lines) {
        const normalizedLine = sanitizeLineContent(rawLine);
        const isBlankLine = normalizedLine.length === 0;

        if (isBlankLine) {
            if (currentParagraphLines.length > 0) {
                paragraphs.push(currentParagraphLines.join(" ").trim());
                currentParagraphLines = [];
            }
            previousLineBlank = true;
            continue;
        }

        if (currentParagraphLines.length === 0) {
            currentParagraphLines.push(normalizedLine);
            previousLineBlank = false;
            continue;
        }

        if (
            previousLineBlank ||
            shouldStartNewParagraph(currentParagraphLines[currentParagraphLines.length - 1], normalizedLine)
        ) {
            paragraphs.push(currentParagraphLines.join(" ").trim());
            currentParagraphLines = [normalizedLine];
            previousLineBlank = false;
            continue;
        }

        currentParagraphLines.push(normalizedLine);
        previousLineBlank = false;
    }

    if (currentParagraphLines.length > 0) {
        paragraphs.push(currentParagraphLines.join(" ").trim());
    }

    return paragraphs;
}

/**
 * Splits a block of text into words while preserving punctuation alongside the word that precedes it.
 * @param {string} textString Raw text provided by the user.
 * @returns {string[]} Ordered array of words with trailing punctuation retained.
 */
function splitIntoWordsPreservingPunctuation(textString) {
    const normalizedText = textString
        .replace(LINE_SEPARATOR_PATTERN, " ")
        .replace(/\u00a0/g, " ")
        .replace(MULTIPLE_WHITESPACE_PATTERN, " ")
        .trim();
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
function isSentenceEnd(word, nextWord, currentSentenceLength) {
    const strippedWord = stripTrailingWrappingCharacters(word);
    if (strippedWord.length === 0) {
        return false;
    }

    if (!SENTENCE_TERMINATOR_PATTERN.test(strippedWord)) {
        return false;
    }

    if (ELLIPSIS_PATTERN.test(strippedWord)) {
        return true;
    }

    if (isDecimalNotation(strippedWord)) {
        return false;
    }

    if (ORDINAL_NUMBER_PATTERN.test(strippedWord) && currentSentenceLength <= 1) {
        return false;
    }

    const abbreviationType = classifyAbbreviation(strippedWord);
    if (abbreviationType === "strict") {
        return false;
    }

    if (abbreviationType === "flexible") {
        const nextToken = typeof nextWord === "string" ? nextWord : "";
        const nextLead = getFirstSignificantCharacter(nextToken.trim());
        if (nextLead.length === 0) {
            return true;
        }
        if (nextLead.toLowerCase() === nextLead) {
            return false;
        }
        return true;
    }

    if (typeof nextWord === "string" && nextWord.trim().length === 0) {
        return true;
    }

    return true;
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

    for (let index = 0; index < wordsArray.length; index += 1) {
        const word = wordsArray[index];
        currentSentence.push(word);
        const nextWord = index + 1 < wordsArray.length ? wordsArray[index + 1] : undefined;
        if (isSentenceEnd(word, nextWord, currentSentence.length)) {
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
        const normalizedParagraphs = extractParagraphs(rawText);
        for (const paragraphText of normalizedParagraphs) {
            if (paragraphText.length === 0) {
                continue;
            }
            const nestedOptions = Object.assign({}, options, { breakOnParagraphs: false });
            paragraphChunks.push(...buildBaseChunks(paragraphText, nestedOptions));
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
    const paragraphMatches = extractParagraphs(chunkText);

    const wordsArray = splitIntoWordsPreservingPunctuation(chunkText);
    const sentenceCount = buildSentences(wordsArray, true).length;

    return {
        characters: chunkText.length,
        words: wordsArray.length,
        sentences: sentenceCount,
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
