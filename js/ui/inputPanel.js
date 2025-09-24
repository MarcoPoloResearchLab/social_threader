// @ts-check
/**
 * @fileoverview View model for the left-hand input panel.
 */

import { TEXT_CONTENT } from "../constants.js";
import { templateHelpers } from "../utils/templates.js";

/** @type {number} */
const MINIMUM_FONT_SIZE = 14;
/** @type {number} */
const MAXIMUM_FONT_SIZE = 24;
/** @type {number} */
const FONT_INCREMENT = 0.05;

/**
 * Manages the user input textarea, statistics display, and error feedback.
 */
export class InputPanel {
    /**
     * @param {HTMLTextAreaElement} textAreaElement Text area used to accept source content.
     * @param {HTMLElement} statsElement Element displaying live statistics for the input.
     * @param {HTMLElement} errorElement Element responsible for showing validation feedback.
     */
    constructor(textAreaElement, statsElement, errorElement) {
        this.textAreaElement = textAreaElement;
        this.statsElement = statsElement;
        this.errorElement = errorElement;
    }

    /**
     * Populates static copy for headings and helper text.
     * @param {HTMLElement} titleElement Heading for the application name.
     * @param {HTMLElement} primaryDescriptionElement Primary descriptive paragraph.
     * @param {HTMLElement} secondaryDescriptionElement Secondary descriptive paragraph.
     * @returns {void}
     */
    initializeCopy(titleElement, primaryDescriptionElement, secondaryDescriptionElement) {
        titleElement.textContent = TEXT_CONTENT.APP_TITLE;
        primaryDescriptionElement.textContent = TEXT_CONTENT.PRIMARY_DESCRIPTION;
        secondaryDescriptionElement.textContent = TEXT_CONTENT.SECONDARY_DESCRIPTION;
        this.textAreaElement.placeholder = TEXT_CONTENT.TEXTAREA_PLACEHOLDER;
        this.statsElement.textContent = TEXT_CONTENT.INPUT_STATS_EMPTY;
    }

    /**
     * Returns the raw text entered by the user.
     * @returns {string} Current textarea value.
     */
    getValue() {
        return this.textAreaElement.value;
    }

    /**
     * Registers a change listener for textarea input events.
     * @param {(value: string) => void} callback Callback invoked when the textarea value changes.
     * @returns {void}
     */
    onInput(callback) {
        this.textAreaElement.addEventListener("input", () => {
            callback(this.getValue());
        });
    }

    /**
     * Registers a listener that reacts to pasted images within the textarea.
     * @param {(imageBlob: Blob) => void} callback Invoked when an image file is present on the clipboard.
     * @returns {void}
     */
    onImagePaste(callback) {
        this.textAreaElement.addEventListener("paste", (pasteEvent) => {
            const clipboardData = pasteEvent.clipboardData;
            if (!clipboardData || !clipboardData.items) {
                return;
            }

            for (const clipboardItem of clipboardData.items) {
                if (clipboardItem.kind === "file" && clipboardItem.type.startsWith("image/")) {
                    const imageFile = clipboardItem.getAsFile();
                    if (imageFile) {
                        callback(imageFile);
                    }
                    break;
                }
            }
        });
    }

    /**
     * Updates the statistics summary shown beneath the textarea.
     * @param {import("../types.d.js").ChunkStatistics} statistics Derived statistics for the input text.
     * @returns {void}
     */
    updateStatistics(statistics) {
        this.statsElement.textContent = templateHelpers.interpolate(TEXT_CONTENT.STATS_TEMPLATE, {
            characters: statistics.characters,
            words: statistics.words,
            sentences: statistics.sentences
        });
        this.adjustFontSize();
    }

    /**
     * Displays a validation error message.
     * @param {string} message Error message sourced from constants.
     * @returns {void}
     */
    showError(message) {
        this.errorElement.textContent = message;
    }

    /**
     * Clears any displayed validation error.
     * @returns {void}
     */
    clearError() {
        this.errorElement.textContent = "";
    }

    /**
     * Adjusts the textarea font size based on the total input length.
     * @returns {void}
     */
    adjustFontSize() {
        const textLength = this.textAreaElement.value.length;
        let newFontSize = MINIMUM_FONT_SIZE + textLength * FONT_INCREMENT;
        if (newFontSize > MAXIMUM_FONT_SIZE) {
            newFontSize = MAXIMUM_FONT_SIZE;
        }
        this.textAreaElement.style.fontSize = `${newFontSize}px`;
    }
}
