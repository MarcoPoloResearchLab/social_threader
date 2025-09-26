// @ts-check
/**
 * @fileoverview View model for the left-hand input panel.
 */

import { TEXT_CONTENT, LOG_MESSAGES } from "../constants.js";
import { templateHelpers } from "../utils/templates.js";
import { richTextHelpers } from "../core/richText.js";

/** @type {number} */
const MINIMUM_FONT_SIZE = 14;
/** @type {number} */
const MAXIMUM_FONT_SIZE = 24;
/** @type {number} */
const FONT_INCREMENT = 0.05;
/** @type {string} */
const SINGLE_NEWLINE = "\n";
/** @type {string} */
const DOUBLE_NEWLINE = "\n\n";
const PLACEHOLDER_SEPARATOR_FLAG = Symbol("placeholderSeparatorFlag");

/**
 * Normalizes editor text content by replacing non-breaking spaces and Windows newlines.
 * @param {string} text Text content captured from the editor snapshot.
 * @returns {string} Normalized text safe for serialization.
 */
function normalizeEditorText(text) {
    return text.replace(/\u00A0/g, " ").replace(/\r\n/g, "\n");
}

/**
 * Determines whether text is empty or contains only newline characters once normalized.
 * @param {string} normalizedText Text that has already passed through normalizeEditorText.
 * @returns {boolean} True when the text contains no visible characters.
 */
function isEmptyOrNewlineOnly(normalizedText) {
    return normalizedText.replace(/\n/g, "").trim().length === 0;
}

/**
 * Retrieves the current selection range within the contenteditable element.
 * @param {HTMLElement} targetElement Editable element currently focused.
 * @returns {Range | null} Live range when a selection exists, otherwise null.
 */
function getActiveRange(targetElement) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return null;
    }

    const range = selection.getRangeAt(0);
    if (!targetElement.contains(range.startContainer) || !targetElement.contains(range.endContainer)) {
        return null;
    }

    return range;
}

/**
 * Inserts a node at the caret position within the editable element.
 * @param {HTMLElement} targetElement Editable container element.
 * @param {Node} nodeToInsert Node that should be inserted at the caret.
 * @returns {void}
 */
function insertNodeAtCaret(targetElement, nodeToInsert) {
    const activeRange = getActiveRange(targetElement);
    if (!activeRange) {
        targetElement.appendChild(nodeToInsert);
        return;
    }

    activeRange.deleteContents();
    activeRange.insertNode(nodeToInsert);

    const newRange = document.createRange();
    newRange.setStartAfter(nodeToInsert);
    newRange.collapse(true);
    const selection = window.getSelection();
    if (selection) {
        selection.removeAllRanges();
        selection.addRange(newRange);
    }
}

/**
 * Converts a File object into a data URL using FileReader.
 * @param {File} file Image file captured from the clipboard.
 * @returns {Promise<string>} Promise resolving with the file encoded as a data URL.
 */
function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.onload = () => {
            const result = typeof fileReader.result === "string" ? fileReader.result : null;
            if (result === null) {
                reject(new Error(LOG_MESSAGES.IMAGE_READ_FAILURE));
                return;
            }
            resolve(result);
        };
        fileReader.onerror = () => {
            reject(new Error(LOG_MESSAGES.IMAGE_READ_ERROR));
        };
        fileReader.readAsDataURL(file);
    });
}

/**
 * Creates an image element that preserves responsiveness within the editor.
 * @param {string} dataUrl Data URL representation of the pasted image.
 * @returns {HTMLImageElement} Configured image element ready for insertion.
 */
function createEditorImageElement(dataUrl) {
    const imageElement = document.createElement("img");
    imageElement.src = dataUrl;
    imageElement.alt = TEXT_CONTENT.PASTED_IMAGE_ALT;
    imageElement.draggable = false;
    imageElement.style.maxWidth = "100%";
    imageElement.style.height = "auto";
    return imageElement;
}

/**
 * Removes active content nodes and inline event handlers from the snapshot tree.
 * @param {HTMLElement} rootElement Cloned editor element prepared for snapshot analysis.
 * @returns {void}
 */
function sanitizeSnapshotTree(rootElement) {
    const disallowedSelectors = "script, style, link, meta, iframe, object, embed";
    rootElement.querySelectorAll(disallowedSelectors).forEach((node) => {
        node.remove();
    });

    rootElement.querySelectorAll("*").forEach((element) => {
        Array.from(element.attributes).forEach((attribute) => {
            if (attribute.name.toLowerCase().startsWith("on")) {
                element.removeAttribute(attribute.name);
            }
        });
    });
}

/**
 * Dispatches an input event so listeners can react to programmatic changes.
 * @param {HTMLElement} targetElement Editable container element.
 * @returns {void}
 */
function emitSyntheticInputEvent(targetElement) {
    const inputEvent = new Event("input", { bubbles: true });
    targetElement.dispatchEvent(inputEvent);
}

/**
 * Parses HTML clipboard content and returns sanitized text nodes safe for insertion.
 * @param {string} htmlContent HTML string extracted from the clipboard.
 * @returns {Node[]} Ordered collection of nodes safe to insert into the editor.
 */
function extractNonImageClipboardNodes(htmlContent) {
    const parser = new DOMParser();
    const parsedDocument = parser.parseFromString(htmlContent, "text/html");
    const sanitizedNodes = [];
    const bodyElement = parsedDocument.body;

    if (!bodyElement) {
        return sanitizedNodes;
    }

    const imageElements = Array.from(bodyElement.querySelectorAll("img"));
    imageElements.forEach((imageElement) => {
        imageElement.remove();
    });

    const sanitizedText = (bodyElement.innerText || "")
        .replace(/\u00A0/g, " ")
        .replace(/\r\n/g, "\n")
        .replace(/^\n+/, "");

    if (sanitizedText.length === 0) {
        return sanitizedNodes;
    }

    const textLines = sanitizedText.split("\n");
    textLines.forEach((line, index) => {
        sanitizedNodes.push(document.createTextNode(line));
        if (index < textLines.length - 1) {
            sanitizedNodes.push(document.createElement("br"));
        }
    });

    return sanitizedNodes;
}

/**
 * Manages the user input editor, statistics display, and error feedback.
 */
export class InputPanel {
    /**
     * @param {HTMLDivElement} editorElement Editable element used to accept source content.
     * @param {HTMLElement} statsElement Element displaying live statistics for the input.
     * @param {HTMLElement} errorElement Element responsible for showing validation feedback.
     */
    constructor(editorElement, statsElement, errorElement) {
        this.editorElement = editorElement;
        this.statsElement = statsElement;
        this.errorElement = errorElement;

        this.initializeImageHandling();
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
        this.editorElement.dataset.placeholder = TEXT_CONTENT.EDITOR_PLACEHOLDER;
        this.editorElement.innerHTML = "";
        this.statsElement.textContent = TEXT_CONTENT.INPUT_STATS_EMPTY;
    }

    /**
     * Creates a serializable snapshot of the editor contents.
     * @returns {import("../types.d.js").RichTextDocument} Snapshot containing placeholder text and associated metadata.
     */
    getDocumentSnapshot() {
        const clonedEditor = /** @type {HTMLDivElement} */ (this.editorElement.cloneNode(true));
        const imageRecords = [];
        const imageElements = Array.from(clonedEditor.querySelectorAll("img"));

        imageElements.forEach((imageElement, index) => {
            const placeholderToken = richTextHelpers.createPlaceholderToken(index);
            const dataUrl = imageElement.getAttribute("src") || "";
            const altText = imageElement.getAttribute("alt") || TEXT_CONTENT.PASTED_IMAGE_ALT;
            imageRecords.push({ placeholderToken, dataUrl, altText });

            const placeholderNode = document.createTextNode(placeholderToken);
            imageElement.replaceWith(placeholderNode);
        });

        sanitizeSnapshotTree(clonedEditor);

        const inertDocument = document.implementation.createHTMLDocument("input-snapshot");
        const inertEditor = /** @type {HTMLDivElement} */ (inertDocument.importNode(clonedEditor, true));
        inertDocument.body.appendChild(inertEditor);

        /** @type {(string | symbol)[]} */
        const placeholderSegments = [];
        inertEditor.childNodes.forEach((childNode) => {
            if (childNode instanceof window.Text) {
                const textContent = childNode.textContent || "";
                const normalizedText = normalizeEditorText(textContent);
                if (normalizedText.trim().length === 0) {
                    return;
                }
                placeholderSegments.push(normalizedText);
                return;
            }

            if (childNode instanceof HTMLElement) {
                const element = childNode;
                const normalizedInnerText = normalizeEditorText(element.innerText);
                if (isEmptyOrNewlineOnly(normalizedInnerText)) {
                    placeholderSegments.push(PLACEHOLDER_SEPARATOR_FLAG);
                    return;
                }
                placeholderSegments.push(normalizedInnerText);
            }
        });

        let normalizedPlaceholderText = "";
        let hasWrittenText = false;
        let pendingSeparatorCount = 0;
        placeholderSegments.forEach((segment) => {
            if (segment === PLACEHOLDER_SEPARATOR_FLAG) {
                pendingSeparatorCount += 1;
                return;
            }

            const segmentText = /** @type {string} */ (segment);
            if (hasWrittenText) {
                if (pendingSeparatorCount === 0) {
                    normalizedPlaceholderText += DOUBLE_NEWLINE;
                } else if (pendingSeparatorCount === 1) {
                    normalizedPlaceholderText += SINGLE_NEWLINE;
                } else {
                    normalizedPlaceholderText += DOUBLE_NEWLINE;
                }
            }
            normalizedPlaceholderText += segmentText;
            hasWrittenText = true;
            pendingSeparatorCount = 0;
        });
        const plainText = richTextHelpers.extractPlainText(normalizedPlaceholderText, imageRecords);

        return {
            placeholderText: normalizedPlaceholderText,
            plainText,
            images: imageRecords
        };
    }

    /**
     * Registers a change listener for textarea input events.
     * @param {(documentSnapshot: import("../types.d.js").RichTextDocument) => void} callback Callback invoked when content changes.
     * @returns {void}
     */
    onInput(callback) {
        this.editorElement.addEventListener("input", () => {
            callback(this.getDocumentSnapshot());
        });
    }

    /**
     * Updates the statistics summary shown beneath the textarea.
     * @param {import("../types.d.js").ChunkStatistics} statistics Derived statistics for the input text.
     * @returns {void}
     */
    updateStatistics(statistics) {
        this.statsElement.textContent = templateHelpers.interpolate(TEXT_CONTENT.INPUT_STATS_TEMPLATE, {
            characters: statistics.characters,
            words: statistics.words,
            sentences: statistics.sentences,
            paragraphs: statistics.paragraphs
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
        const textContent = this.editorElement.textContent || "";
        const textLength = textContent.length;
        let newFontSize = MINIMUM_FONT_SIZE + textLength * FONT_INCREMENT;
        if (newFontSize > MAXIMUM_FONT_SIZE) {
            newFontSize = MAXIMUM_FONT_SIZE;
        }
        this.editorElement.style.fontSize = `${newFontSize}px`;
    }

    /**
     * Sets up handlers to process pasted or dropped images within the editor.
     * @returns {void}
     */
    initializeImageHandling() {
        this.editorElement.addEventListener("paste", (pasteEvent) => {
            const clipboardData = pasteEvent.clipboardData;
            if (!clipboardData) {
                return;
            }

            const imageItems = Array.from(clipboardData.items || []).filter(
                (item) => item.kind === "file" && item.type.startsWith("image/")
            );

            if (imageItems.length === 0) {
                return;
            }

            const clipboardGetData =
                typeof clipboardData.getData === "function" ? clipboardData.getData.bind(clipboardData) : null;
            const htmlContent = clipboardGetData ? clipboardGetData("text/html") : "";
            const plainTextContent = clipboardGetData ? clipboardGetData("text/plain") : "";
            pasteEvent.preventDefault();

            /** @type {Array<() => Promise<void>>} */
            const insertionSteps = [];

            if (htmlContent) {
                const htmlNodes = extractNonImageClipboardNodes(htmlContent);
                if (htmlNodes.length > 0) {
                    insertionSteps.push(() => {
                        htmlNodes.forEach((node) => {
                            insertNodeAtCaret(this.editorElement, node);
                        });
                        return Promise.resolve();
                    });
                }
            }

            if (insertionSteps.length === 0 && plainTextContent) {
                insertionSteps.push(() => {
                    insertNodeAtCaret(this.editorElement, document.createTextNode(plainTextContent));
                    return Promise.resolve();
                });
            }

            imageItems.forEach((item) => {
                const file = item.getAsFile();
                if (!file) {
                    return;
                }
                insertionSteps.push(() =>
                    readFileAsDataUrl(file)
                        .then((dataUrl) => {
                            const imageElement = createEditorImageElement(dataUrl);
                            insertNodeAtCaret(this.editorElement, imageElement);
                        })
                        .catch(() => {
                            // Silently ignore failures; text content is preserved when available.
                        })
                );
            });

            let sequence = Promise.resolve();
            insertionSteps.forEach((step) => {
                sequence = sequence.then(() => step());
            });
            sequence.finally(() => {
                emitSyntheticInputEvent(this.editorElement);
            });
        });

        this.editorElement.addEventListener("dragover", (dragEvent) => {
            if (dragEvent.dataTransfer) {
                dragEvent.preventDefault();
            }
        });

        this.editorElement.addEventListener("drop", (dropEvent) => {
            const dataTransfer = dropEvent.dataTransfer;
            if (!dataTransfer) {
                return;
            }

            const files = Array.from(dataTransfer.files);
            const imageFiles = files.filter((file) => file.type.startsWith("image/"));
            if (imageFiles.length === 0) {
                return;
            }

            dropEvent.preventDefault();
            imageFiles.forEach((file) => {
                readFileAsDataUrl(file)
                    .then((dataUrl) => {
                        const imageElement = createEditorImageElement(dataUrl);
                        insertNodeAtCaret(this.editorElement, imageElement);
                        emitSyntheticInputEvent(this.editorElement);
                    })
                    .catch(() => {
                        // Silently ignore failures to avoid interrupting user workflow.
                    });
            });
        });
    }
}
