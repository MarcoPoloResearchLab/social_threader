// @ts-check
/**
 * @fileoverview Coordinates the UI views with the chunking service.
 */

import { TEXT_CONTENT, DEFAULT_LENGTHS, TOGGLE_IDENTIFIERS, LOG_MESSAGES, HTML_TEMPLATES } from "../constants.js";
import { templateHelpers } from "../utils/templates.js";

/** @type {number} */
const INPUT_RECHUNK_DELAY_MS = 100;
/** @type {number} */
const CUSTOM_RECHUNK_DELAY_MS = 1000;

/**
 * Central controller that orchestrates the chunking workflow and UI updates.
 */
export class ThreaderController {
    /**
     * @param {Object} params Constructor parameters.
     * @param {import("./inputPanel.js").InputPanel} params.inputPanel View managing the input textarea.
     * @param {import("./chunkListView.js").ChunkListView} params.chunkListView View managing rendered chunks.
     * @param {import("./formControls.js").FormControls} params.formControls View managing buttons and toggles.
     * @param {typeof import("../core/chunking.js").chunkingService} params.chunkingService Pure chunking utilities.
     * @param {typeof import("../utils/logging.js").loggingHelpers} params.loggingHelpers Logging helpers for diagnostics.
     */
    constructor({ inputPanel, chunkListView, formControls, chunkingService, loggingHelpers }) {
        this.inputPanel = inputPanel;
        this.chunkListView = chunkListView;
        this.formControls = formControls;
        this.chunkingService = chunkingService;
        this.loggingHelpers = loggingHelpers;

        /** @type {import("../types.d.js").ThreadingState} */
        this.state = {
            activeLength: DEFAULT_LENGTHS.TWITTER,
            breakOnSentences: false,
            enumerate: false,
            breakOnParagraphs: false,
            copySequenceNumber: 0
        };

        /** @type {import("../types.d.js").PastedImageData | null} */
        this.pastedImageData = null;

        this.autoRechunkEnabled = false;
        this.rechunkTimeoutId = null;
        this.customLengthTimeoutId = null;
    }

    /**
     * Initializes UI copy and event listeners.
     * @param {HTMLElement} titleElement Heading for the app title.
     * @param {HTMLElement} primaryDescriptionElement First descriptive paragraph element.
     * @param {HTMLElement} secondaryDescriptionElement Second descriptive paragraph element.
     * @param {HTMLElement} footerElement Footer element for static copy.
     * @returns {void}
     */
    initialize(titleElement, primaryDescriptionElement, secondaryDescriptionElement, footerElement) {
        this.inputPanel.initializeCopy(titleElement, primaryDescriptionElement, secondaryDescriptionElement);
        footerElement.innerHTML = TEXT_CONTENT.FOOTER_HTML;
        this.formControls.initializeCopy();
        this.formControls.setActivePreset(null);
        this.attachEventListeners();
    }

    /**
     * Wires event listeners for user interactions.
     * @returns {void}
     */
    attachEventListeners() {
        this.formControls.onPresetSelected((identifier, length) => {
            if (this.customLengthTimeoutId !== null) {
                window.clearTimeout(this.customLengthTimeoutId);
                this.customLengthTimeoutId = null;
            }
            this.formControls.setActivePreset(identifier);
            this.state.activeLength = length;
            this.executeChunking(length, true);
        });

        this.formControls.onCustomButtonClick((lengthValue) => {
            if (lengthValue === null) {
                this.inputPanel.showError(TEXT_CONTENT.ERROR_INVALID_CUSTOM);
                return;
            }
            this.formControls.setCustomActive();
            this.state.activeLength = lengthValue;
            this.inputPanel.clearError();
            const labelText = templateHelpers.interpolate(TEXT_CONTENT.CUSTOM_BUTTON_TEMPLATE, { VALUE: lengthValue });
            this.formControls.setCustomButtonLabel(labelText);
            this.executeChunking(lengthValue, true);
        });

        this.formControls.onCustomLengthInput((rawValue) => {
            const parsedValue = Number.parseInt(rawValue, 10);
            if (Number.isNaN(parsedValue) || parsedValue <= 0) {
                this.formControls.setCustomButtonLabel(TEXT_CONTENT.CUSTOM_BUTTON_DEFAULT);
                return;
            }
            const labelText = templateHelpers.interpolate(TEXT_CONTENT.CUSTOM_BUTTON_TEMPLATE, { VALUE: parsedValue });
            this.formControls.setCustomButtonLabel(labelText);
            if (this.formControls.isCustomActive()) {
                if (this.customLengthTimeoutId !== null) {
                    window.clearTimeout(this.customLengthTimeoutId);
                }
                this.customLengthTimeoutId = window.setTimeout(() => {
                    this.state.activeLength = parsedValue;
                    this.executeChunking(parsedValue, true);
                    this.customLengthTimeoutId = null;
                }, CUSTOM_RECHUNK_DELAY_MS);
            }
        });

        this.formControls.onToggleChange((identifier, checked) => {
            if (identifier === TOGGLE_IDENTIFIERS.PARAGRAPH) {
                this.state.breakOnParagraphs = checked;
            } else if (identifier === TOGGLE_IDENTIFIERS.SENTENCE) {
                this.state.breakOnSentences = checked;
            } else if (identifier === TOGGLE_IDENTIFIERS.ENUMERATION) {
                this.state.enumerate = checked;
            }
            this.rechunkWithCurrentState(false);
        });

        this.inputPanel.onInput((value) => {
            const statistics = this.chunkingService.calculateStatistics(value);
            this.inputPanel.updateStatistics(statistics);
            if (this.rechunkTimeoutId !== null) {
                window.clearTimeout(this.rechunkTimeoutId);
            }
            this.rechunkTimeoutId = window.setTimeout(() => {
                if (value.trim().length === 0) {
                    this.chunkListView.clear();
                    this.inputPanel.clearError();
                    this.state.copySequenceNumber = 0;
                    return;
                }
                this.rechunkWithCurrentState(false);
            }, INPUT_RECHUNK_DELAY_MS);
        });

        this.inputPanel.onImagePaste((imageBlob) => {
            this.handleImagePaste(imageBlob);
        });
    }

    /**
     * Re-chunks using the currently selected configuration.
     * @param {boolean} showErrorOnEmpty Whether to surface validation when the textarea is empty.
     * @returns {void}
     */
    rechunkWithCurrentState(showErrorOnEmpty) {
        if (!this.autoRechunkEnabled) {
            return;
        }
        this.executeChunking(this.state.activeLength, showErrorOnEmpty);
    }

    /**
     * Performs chunking with the specified maximum length.
     * @param {number} maximumLength Maximum characters per chunk.
     * @param {boolean} showErrorOnEmpty Whether to surface validation when the textarea is empty.
     * @returns {void}
     */
    executeChunking(maximumLength, showErrorOnEmpty) {
        const sourceText = this.inputPanel.getValue();
        this.state.copySequenceNumber = 0;
        this.autoRechunkEnabled = true;
        if (sourceText.trim().length === 0) {
            this.chunkListView.clear();
            if (showErrorOnEmpty) {
                this.inputPanel.showError(TEXT_CONTENT.ERROR_NO_TEXT);
            } else {
                this.inputPanel.clearError();
            }
            return;
        }

        this.inputPanel.clearError();
        const chunkOptions = {
            maximumLength,
            breakOnSentences: this.state.breakOnSentences,
            enumerate: this.state.enumerate,
            breakOnParagraphs: this.state.breakOnParagraphs
        };
        const chunks = this.chunkingService.getChunks(sourceText, chunkOptions);
        this.chunkListView.renderChunks(chunks, (context) => {
            this.handleCopyRequest(context.chunkText, context.containerElement, context.buttonElement);
        }, this.pastedImageData);
    }

    /**
     * Handles copy requests triggered from chunk buttons.
     * @param {string} chunkText Text to copy to the clipboard.
     * @param {HTMLDivElement} containerElement Container representing the chunk.
     * @param {HTMLButtonElement} buttonElement Button that initiated the copy request.
     * @returns {void}
     */
    handleCopyRequest(chunkText, containerElement, buttonElement) {
        const clipboardInterface = navigator.clipboard;
        if (!clipboardInterface) {
            this.loggingHelpers.reportCopyFailure(new Error(LOG_MESSAGES.CLIPBOARD_UNAVAILABLE));
            return;
        }

        const clipboardItemConstructor = window.ClipboardItem;
        const supportsClipboardItems = typeof clipboardInterface.write === "function" && typeof clipboardItemConstructor === "function";
        const imageData = this.pastedImageData;
        const imageSupported = supportsClipboardItems
            && imageData !== null
            && (typeof clipboardItemConstructor.supports !== "function"
                || clipboardItemConstructor.supports(imageData.blob.type));

        /** @returns {void} */
        const markSuccess = () => {
            this.state.copySequenceNumber += 1;
            this.chunkListView.markChunkAsCopied(containerElement, buttonElement, this.state.copySequenceNumber);
        };

        const attemptTextCopy = () => {
            if (typeof clipboardInterface.writeText === "function") {
                clipboardInterface.writeText(chunkText)
                    .then(markSuccess)
                    .catch((error) => {
                        this.loggingHelpers.reportCopyFailure(error);
                    });
                return;
            }

            this.loggingHelpers.reportCopyFailure(new Error(LOG_MESSAGES.CLIPBOARD_UNAVAILABLE));
        };

        if (imageSupported) {
            const sanitizedHtmlContent = templateHelpers
                .escapeHtml(chunkText)
                .replace(/\r?\n/g, "<br>");
            const htmlFragment = templateHelpers.interpolate(HTML_TEMPLATES.CLIPBOARD_PARAGRAPH, {
                CONTENT: sanitizedHtmlContent
            });

            const clipboardItems = [
                new clipboardItemConstructor({
                    "text/plain": new Blob([chunkText], { type: "text/plain" }),
                    "text/html": new Blob([htmlFragment], { type: "text/html" })
                }),
                new clipboardItemConstructor({
                    [imageData.blob.type]: imageData.blob
                })
            ];

            clipboardInterface.write(clipboardItems).then(markSuccess).catch((error) => {
                this.loggingHelpers.reportCopyFailure(error);
                attemptTextCopy();
            });
            return;
        }

        attemptTextCopy();
    }

    /**
     * Handles pasted image blobs from the input panel.
     * @param {Blob} imageBlob Raw image pasted from the clipboard.
     * @returns {void}
     */
    handleImagePaste(imageBlob) {
        if (this.pastedImageData !== null) {
            URL.revokeObjectURL(this.pastedImageData.objectUrl);
        }
        const objectUrl = URL.createObjectURL(imageBlob);
        this.pastedImageData = { blob: imageBlob, objectUrl };

        if (!this.autoRechunkEnabled) {
            return;
        }

        if (this.inputPanel.getValue().trim().length === 0) {
            return;
        }

        this.rechunkWithCurrentState(false);
    }
}
