// @ts-check
/**
 * @fileoverview Tests for rich text placeholder translation helpers.
 */

import { richTextHelpers } from "../js/core/richText.js";
import { TEXT_CONTENT } from "../js/constants.js";
import { assertEqual } from "./assert.js";

/**
 * Executes tests covering placeholder to HTML conversion.
 * @param {(name: string, fn: () => (void | Promise<void>)) => Promise<void>} runTest Test harness callback.
 * @returns {Promise<void>}
 */
export async function runRichTextTests(runTest) {
    await runTest("buildChunkContent separates text and image segments", () => {
        const token = richTextHelpers.createPlaceholderToken(0);
        const imageRecord = {
            placeholderToken: token,
            dataUrl: "data:image/png;base64,ZmFrZQ==",
            altText: TEXT_CONTENT.PASTED_IMAGE_ALT
        };
        const segments = richTextHelpers.buildChunkContent(`Alpha ${token} omega`, [imageRecord]);
        const textSegment = segments.find((segment) => segment.variant === "text");
        const imageSegment = segments.find((segment) => segment.variant === "image");

        if (!textSegment || !imageSegment) {
            throw new Error("Both text and image segments should be produced");
        }

        assertEqual(
            textSegment.plainText.includes(TEXT_CONTENT.IMAGE_PLAIN_TEXT_PLACEHOLDER),
            true,
            "plain text should include the configured image placeholder"
        );
        assertEqual(/<img/.test(textSegment.htmlContent), false, "Text HTML should not inline the image element");
        assertEqual(/<img/.test(imageSegment.htmlContent), true, "Image HTML should render the image element");
        assertEqual(
            imageSegment.htmlContent.includes(imageRecord.dataUrl),
            true,
            "Image segment should embed the image data URL"
        );
    });

    await runTest("extractPlainText removes placeholder tokens", () => {
        const firstToken = richTextHelpers.createPlaceholderToken(0);
        const secondToken = richTextHelpers.createPlaceholderToken(1);
        const imageRecords = [
            { placeholderToken: firstToken, dataUrl: "data:image/png;base64,ZmFrZQ==", altText: TEXT_CONTENT.PASTED_IMAGE_ALT },
            { placeholderToken: secondToken, dataUrl: "data:image/png;base64,ZmFrZQ==", altText: TEXT_CONTENT.PASTED_IMAGE_ALT }
        ];
        const placeholderText = `${firstToken}\n${secondToken}`;
        const plainText = richTextHelpers.extractPlainText(placeholderText, imageRecords);
        const expectedText = `${TEXT_CONTENT.IMAGE_PLAIN_TEXT_PLACEHOLDER}\n${TEXT_CONTENT.IMAGE_PLAIN_TEXT_PLACEHOLDER}`;
        assertEqual(plainText, expectedText, "plain text should replace each placeholder token");
    });
}
