// @ts-check
/**
 * @fileoverview Helper utilities for translating placeholder-based rich text into renderable output.
 */

import { PLACEHOLDER_TOKENS, TEXT_CONTENT } from "../constants.js";
import { templateHelpers } from "../utils/templates.js";

/** @type {RegExp} */
const WHITESPACE_PATTERN = /\r?\n/g;

/**
 * Escapes special characters for use in a regular expression literal.
 * @param {string} value Raw string containing potential special characters.
 * @returns {string} Escaped string safe for regex construction.
 */
function escapeForRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a fresh regular expression used to locate placeholder tokens.
 * @returns {RegExp} Compiled expression that matches image placeholder tokens.
 */
function createPlaceholderPattern() {
    return new RegExp(
        `${escapeForRegExp(PLACEHOLDER_TOKENS.IMAGE_PREFIX)}(\\d+)${escapeForRegExp(PLACEHOLDER_TOKENS.IMAGE_SUFFIX)}`,
        "g"
    );
}

/**
 * Converts a plain text segment into HTML-safe markup preserving line breaks.
 * @param {string} textSegment Segment of text without inline images.
 * @returns {string} Escaped HTML string representing the text segment.
 */
function convertTextSegmentToHtml(textSegment) {
    if (textSegment.length === 0) {
        return "";
    }
    const sanitizedText = templateHelpers.escapeHtml(textSegment);
    return sanitizedText.replace(WHITESPACE_PATTERN, "<br>");
}

/**
 * Constructs a lookup table for placeholder tokens to their corresponding images.
 * @param {import("../types.d.js").RichTextImage[]} imageRecords Image metadata collected from the editor.
 * @returns {Map<string, import("../types.d.js").RichTextImage>} Lookup table keyed by placeholder token.
 */
function createImageLookup(imageRecords) {
    const lookup = new Map();
    for (const imageRecord of imageRecords) {
        lookup.set(imageRecord.placeholderToken, imageRecord);
    }
    return lookup;
}

/**
 * Translates placeholder-based text into renderable chunks and aggregate text forms.
 * @param {string} placeholderText Text containing placeholder tokens representing images.
 * @param {import("../types.d.js").RichTextImage[]} imageRecords Image metadata ordered as encountered in the editor.
 * @returns {{ plainText: string; textWithoutImages: string; imageChunks: import("../types.d.js").ChunkContent[] }}
 */
function translatePlaceholderText(placeholderText, imageRecords) {
    const placeholderPattern = createPlaceholderPattern();
    const imageLookup = createImageLookup(imageRecords);

    let lastIndex = 0;
    let plainTextResult = "";
    let textWithoutImages = "";
    /** @type {import("../types.d.js").ChunkContent[]} */
    const imageChunks = [];

    while (true) {
        const placeholderMatch = placeholderPattern.exec(placeholderText);
        if (placeholderMatch === null) {
            break;
        }

        const textBeforeMatch = placeholderText.slice(lastIndex, placeholderMatch.index);
        if (textBeforeMatch.length > 0) {
            plainTextResult += textBeforeMatch;
            textWithoutImages += textBeforeMatch;
        }

        const placeholderToken = placeholderMatch[0];
        const imageRecord = imageLookup.get(placeholderToken);
        if (imageRecord) {
            const altText = imageRecord.altText || TEXT_CONTENT.PASTED_IMAGE_ALT;
            const sanitizedAlt = templateHelpers.escapeHtml(altText);
            imageChunks.push({
                variant: "image",
                plainText: "",
                htmlContent: `<img src="${imageRecord.dataUrl}" alt="${sanitizedAlt}" draggable="false">`,
                clipboardHtml: `<img src="${imageRecord.dataUrl}" alt="${sanitizedAlt}" draggable="false">`,
                imageDataUrl: imageRecord.dataUrl
            });
        } else {
            plainTextResult += TEXT_CONTENT.IMAGE_PLAIN_TEXT_PLACEHOLDER;
            textWithoutImages += TEXT_CONTENT.IMAGE_PLAIN_TEXT_PLACEHOLDER;
        }

        lastIndex = placeholderPattern.lastIndex;
    }

    const trailingText = placeholderText.slice(lastIndex);
    if (trailingText.length > 0) {
        plainTextResult += trailingText;
        textWithoutImages += trailingText;
    }

    return {
        plainText: plainTextResult,
        textWithoutImages,
        imageChunks
    };
}

/**
 * Generates rich chunk content from placeholder-based text.
 * @param {string} placeholderText Text containing placeholder tokens representing images.
 * @param {import("../types.d.js").RichTextImage[]} imageRecords Image metadata ordered as encountered in the editor.
 * @returns {import("../types.d.js").ChunkContent[]} Renderable chunk representations.
 */
function buildChunkContent(placeholderText, imageRecords) {
    const translation = translatePlaceholderText(placeholderText, imageRecords);

    /** @type {import("../types.d.js").ChunkContent[]} */
    const chunkSegments = [];

    if (translation.textWithoutImages.length > 0) {
        chunkSegments.push({
            variant: "text",
            plainText: translation.textWithoutImages,
            htmlContent: convertTextSegmentToHtml(translation.textWithoutImages),
            clipboardHtml: convertTextSegmentToHtml(translation.textWithoutImages),
            statisticsText: translation.textWithoutImages
        });
    }

    chunkSegments.push(...translation.imageChunks);
    return chunkSegments;
}

/**
 * Builds chunk content objects for the provided placeholder chunks.
 * @param {string[]} placeholderChunks Ordered chunk strings containing placeholder tokens.
 * @param {import("../types.d.js").RichTextImage[]} imageRecords Image metadata ordered as encountered in the editor.
 * @returns {import("../types.d.js").ChunkContent[]} Chunk representations with text and HTML content.
 */
function buildChunkContents(placeholderChunks, imageRecords) {
    /** @type {import("../types.d.js").ChunkContent[]} */
    const renderableChunks = [];
    placeholderChunks.forEach((chunk) => {
        renderableChunks.push(...buildChunkContent(chunk, imageRecords));
    });
    return renderableChunks;
}

/**
 * Computes a plain text representation of the provided placeholder text.
 * @param {string} placeholderText Text containing placeholder tokens.
 * @param {import("../types.d.js").RichTextImage[]} imageRecords Image metadata ordered as encountered in the editor.
 * @returns {string} Plain text with placeholder tokens substituted for text placeholders.
 */
function extractPlainText(placeholderText, imageRecords) {
    return translatePlaceholderText(placeholderText, imageRecords).plainText;
}

/**
 * Generates a unique placeholder token for the provided image index.
 * @param {number} imageIndex Zero-based sequence number of the image within the document.
 * @returns {string} Placeholder token representing the image location.
 */
function createPlaceholderToken(imageIndex) {
    return `${PLACEHOLDER_TOKENS.IMAGE_PREFIX}${imageIndex}${PLACEHOLDER_TOKENS.IMAGE_SUFFIX}`;
}

export const richTextHelpers = Object.freeze({
    buildChunkContent,
    buildChunkContents,
    extractPlainText,
    createPlaceholderToken
});
