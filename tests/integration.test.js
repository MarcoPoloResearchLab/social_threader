// @ts-check
/**
 * @fileoverview Black-box integration tests for the Social Threader UI components.
 */

import { InputPanel } from "../js/ui/inputPanel.js";
import { ChunkListView } from "../js/ui/chunkListView.js";
import { FormControls } from "../js/ui/formControls.js";
import { ThreaderController } from "../js/ui/controller.js";
import { chunkingService } from "../js/core/chunking.js";
import { loggingHelpers } from "../js/utils/logging.js";
import {
    PRESET_IDENTIFIERS,
    TOGGLE_IDENTIFIERS,
    DEFAULT_LENGTHS,
    TEXT_CONTENT
} from "../js/constants.js";
import { assertEqual } from "./assert.js";

if (!("ResizeObserver" in window)) {
    class ResizeObserverStub {
        /**
         * @param {(entries: unknown[]) => void} callback
         */
        constructor(callback) {
            this.callback = callback;
        }

        /** @returns {void} */
        observe() {
            this.callback([], this);
        }

        /** @returns {void} */
        unobserve() {}

        /** @returns {void} */
        disconnect() {}
    }
    // @ts-ignore
    window.ResizeObserver = ResizeObserverStub;
}

if (!navigator.clipboard) {
    Object.defineProperty(navigator, "clipboard", {
        value: {},
        configurable: true
    });
}

if (typeof navigator.clipboard.writeText !== "function") {
    navigator.clipboard.writeText = () => Promise.resolve();
}

if (typeof navigator.clipboard.write !== "function") {
    navigator.clipboard.write = () => Promise.resolve();
}

class ClipboardItemStub {
    /**
     * @param {Record<string, Blob>} itemData
     */
    constructor(itemData) {
        this.items = itemData;
    }

    /** @returns {boolean} */
    static supports() {
        return true;
    }
}

Object.defineProperty(window, "ClipboardItem", {
    value: ClipboardItemStub,
    configurable: true,
    writable: true
});

/**
 * @returns {Promise<void>}
 */
function waitForAnimationFrame() {
    return new Promise((resolve) => {
        window.requestAnimationFrame(() => resolve());
    });
}

/**
 * Sets up a minimal DOM fixture and controller instance for integration testing.
 * @returns {{ elements: Record<string, HTMLElement>, cleanup: () => void }}
 */
function setupControllerFixture() {
    const fixture = document.createElement("div");
    fixture.id = "test-fixture";
    fixture.innerHTML = `
        <h2 id="appTitle"></h2>
        <p id="primaryDescription"></p>
        <p id="secondaryDescription"></p>
        <div id="sourceText" class="richTextInput" contenteditable="true"></div>
        <div id="inputStats"></div>
        <div id="inputError"></div>
        <div id="results"></div>
        <div id="footerText"></div>
        <button id="presetThreads"></button>
        <button id="presetBluesky"></button>
        <button id="presetTwitter"></button>
        <button id="customButton"></button>
        <input id="customLength" type="number" />
        <input id="paragraphToggle" type="checkbox" />
        <label id="paragraphToggleLabel"></label>
        <input id="sentenceToggle" type="checkbox" />
        <label id="sentenceToggleLabel"></label>
        <input id="enumerationToggle" type="checkbox" />
        <label id="enumerationToggleLabel"></label>
    `;
    document.body.appendChild(fixture);

    const elements = {
        titleElement: /** @type {HTMLElement} */ (fixture.querySelector("#appTitle")),
        primaryDescription: /** @type {HTMLElement} */ (fixture.querySelector("#primaryDescription")),
        secondaryDescription: /** @type {HTMLElement} */ (fixture.querySelector("#secondaryDescription")),
        editorElement: /** @type {HTMLDivElement} */ (fixture.querySelector("#sourceText")),
        statsElement: /** @type {HTMLElement} */ (fixture.querySelector("#inputStats")),
        errorElement: /** @type {HTMLElement} */ (fixture.querySelector("#inputError")),
        resultsElement: /** @type {HTMLElement} */ (fixture.querySelector("#results")),
        footerElement: /** @type {HTMLElement} */ (fixture.querySelector("#footerText")),
        presetThreads: /** @type {HTMLButtonElement} */ (fixture.querySelector("#presetThreads")),
        presetBluesky: /** @type {HTMLButtonElement} */ (fixture.querySelector("#presetBluesky")),
        presetTwitter: /** @type {HTMLButtonElement} */ (fixture.querySelector("#presetTwitter")),
        customButton: /** @type {HTMLButtonElement} */ (fixture.querySelector("#customButton")),
        customLength: /** @type {HTMLInputElement} */ (fixture.querySelector("#customLength")),
        paragraphToggle: /** @type {HTMLInputElement} */ (fixture.querySelector("#paragraphToggle")),
        sentenceToggle: /** @type {HTMLInputElement} */ (fixture.querySelector("#sentenceToggle")),
        enumerationToggle: /** @type {HTMLInputElement} */ (fixture.querySelector("#enumerationToggle")),
        paragraphLabel: /** @type {HTMLLabelElement} */ (fixture.querySelector("#paragraphToggleLabel")),
        sentenceLabel: /** @type {HTMLLabelElement} */ (fixture.querySelector("#sentenceToggleLabel")),
        enumerationLabel: /** @type {HTMLLabelElement} */ (fixture.querySelector("#enumerationToggleLabel"))
    };

    const inputPanel = new InputPanel(elements.editorElement, elements.statsElement, elements.errorElement);
    const chunkListView = new ChunkListView(elements.resultsElement, chunkingService);
    const formControls = new FormControls(
        {
            [PRESET_IDENTIFIERS.THREADS]: elements.presetThreads,
            [PRESET_IDENTIFIERS.BLUESKY]: elements.presetBluesky,
            [PRESET_IDENTIFIERS.TWITTER]: elements.presetTwitter
        },
        elements.customButton,
        elements.customLength,
        {
            [TOGGLE_IDENTIFIERS.PARAGRAPH]: elements.paragraphToggle,
            [TOGGLE_IDENTIFIERS.SENTENCE]: elements.sentenceToggle,
            [TOGGLE_IDENTIFIERS.ENUMERATION]: elements.enumerationToggle
        },
        {
            [TOGGLE_IDENTIFIERS.PARAGRAPH]: elements.paragraphLabel,
            [TOGGLE_IDENTIFIERS.SENTENCE]: elements.sentenceLabel,
            [TOGGLE_IDENTIFIERS.ENUMERATION]: elements.enumerationLabel
        }
    );

    const controller = new ThreaderController({
        inputPanel,
        chunkListView,
        formControls,
        chunkingService,
        loggingHelpers
    });

    controller.initialize(
        elements.titleElement,
        elements.primaryDescription,
        elements.secondaryDescription,
        elements.footerElement
    );

    return {
        elements,
        cleanup() {
            fixture.remove();
        }
    };
}

/**
 * Runs integration tests using the provided harness.
 * @param {(name: string, fn: () => (void | Promise<void>)) => Promise<void>} runTest
 */
export async function runIntegrationTests(runTest) {
    const cases = [
        {
            name: "does not select a preset on initialization",
            async execute() {
                const { elements, cleanup } = setupControllerFixture();
                try {
                    const presetButtons = [
                        elements.presetThreads,
                        elements.presetBluesky,
                        elements.presetTwitter
                    ];
                    for (const buttonElement of presetButtons) {
                        assertEqual(
                            buttonElement.classList.contains("active"),
                            false,
                            "preset buttons should start inactive"
                        );
                    }
                    assertEqual(
                        elements.customButton.classList.contains("active"),
                        false,
                        "custom button should start inactive"
                    );
                } finally {
                    cleanup();
                }
            }
        },
        {
            name: "preset button chunks the text and renders results",
            async execute() {
                const { elements, cleanup } = setupControllerFixture();
                try {
                    const sampleText = Array.from({ length: 12 }, () => "The quick brown fox jumps over the lazy dog.").join(" ");
                    elements.editorElement.textContent = sampleText;
                    elements.editorElement.dispatchEvent(new Event("input"));
                    elements.presetTwitter.click();
                    await waitForAnimationFrame();
                    const expectedChunks = chunkingService.getChunks(sampleText, {
                        maximumLength: DEFAULT_LENGTHS.TWITTER,
                        breakOnSentences: false,
                        enumerate: false,
                        breakOnParagraphs: false
                    });
                    const renderedChunks = elements.resultsElement.querySelectorAll(".chunkContainer");
                    assertEqual(renderedChunks.length, expectedChunks.length, "rendered chunk count should match service output");
                } finally {
                    cleanup();
                }
            }
        },
        {
            name: "enumeration toggle appends ordering metadata",
            async execute() {
                const { elements, cleanup } = setupControllerFixture();
                try {
                    const sampleText = "Alpha bravo charlie delta echo foxtrot golf";
                    elements.editorElement.textContent = sampleText;
                    elements.editorElement.dispatchEvent(new Event("input"));
                    elements.presetBluesky.click();
                    await waitForAnimationFrame();
                    elements.enumerationToggle.checked = true;
                    elements.enumerationToggle.dispatchEvent(new Event("change"));
                    await waitForAnimationFrame();
                    const contentElement = /** @type {HTMLDivElement} */ (
                        elements.resultsElement.querySelector(".chunkContent")
                    );
                    const enumeratedChunks = chunkingService.getChunks(sampleText, {
                        maximumLength: DEFAULT_LENGTHS.BLUESKY,
                        breakOnSentences: false,
                        enumerate: true,
                        breakOnParagraphs: false
                    });
                    assertEqual(
                        contentElement.textContent,
                        enumeratedChunks[0],
                        "first chunk should include enumeration metadata"
                    );
                } finally {
                    cleanup();
                }
            }
        },
        {
            name: "custom length input updates the button label and chunk output",
            async execute() {
                const { elements, cleanup } = setupControllerFixture();
                try {
                    const sampleText = "One two three four five six seven eight nine ten eleven twelve.";
                    elements.editorElement.textContent = sampleText;
                    elements.editorElement.dispatchEvent(new Event("input"));
                    elements.customButton.click();
                    await waitForAnimationFrame();
                    elements.customLength.value = "60";
                    elements.customLength.dispatchEvent(new Event("input"));
                    await new Promise((resolve) => setTimeout(resolve, 1100));
                    await waitForAnimationFrame();
                    const expectedLabel = TEXT_CONTENT.CUSTOM_BUTTON_TEMPLATE.replace("{VALUE}", "60");
                    assertEqual(elements.customButton.textContent, expectedLabel, "custom button label should reflect the new value");
                    const expectedChunks = chunkingService.getChunks(sampleText, {
                        maximumLength: 60,
                        breakOnSentences: false,
                        enumerate: false,
                        breakOnParagraphs: false
                    });
                    const renderedChunks = elements.resultsElement.querySelectorAll(".chunkContainer");
                    assertEqual(renderedChunks.length, expectedChunks.length, "custom chunk count should match service output");
                } finally {
                    cleanup();
                }
            }
        },
        {
            name: "pasted image is rendered with chunks and copied alongside text",
            async execute() {
                const { elements, cleanup } = setupControllerFixture();
                const originalClipboardWrite = navigator.clipboard.write;
                /** @type {unknown[][]} */
                const clipboardWriteCalls = [];
                navigator.clipboard.write = (items) => {
                    clipboardWriteCalls.push(items);
                    return Promise.resolve();
                };

                const originalFileReader = window.FileReader;

                try {
                    const sampleText = "Sample text for clipboard.";
                    elements.editorElement.textContent = sampleText;
                    elements.editorElement.dispatchEvent(new Event("input"));
                    elements.presetTwitter.click();
                    await waitForAnimationFrame();

                    class FileReaderStub {
                        constructor() {
                            /** @type {((this: FileReaderStub, ev: Event) => void) | null} */
                            this.onload = null;
                            /** @type {((this: FileReaderStub, ev: ProgressEvent<FileReader>) => void) | null} */
                            this.onerror = null;
                            this.result = null;
                        }

                        /**
                         * @param {Blob} blob
                         * @returns {void}
                         */
                        readAsDataURL(blob) {
                            this.result = `data:${blob.type};base64,ZmFrZQ==`;
                            if (typeof this.onload === "function") {
                                this.onload.call(this, new Event("load"));
                            }
                        }
                    }
                    // @ts-ignore
                    window.FileReader = FileReaderStub;

                    const imageBlob = new Blob(["fake"], { type: "image/png" });
                    const pasteEvent = new Event("paste");
                    Object.defineProperty(pasteEvent, "clipboardData", {
                        value: {
                            items: [
                                {
                                    kind: "file",
                                    type: "image/png",
                                    getAsFile() {
                                        return imageBlob;
                                    }
                                }
                            ]
                        }
                    });
                    elements.editorElement.dispatchEvent(pasteEvent);
                    await new Promise((resolve) => setTimeout(resolve, 150));
                    await waitForAnimationFrame();

                    const renderedImage = elements.resultsElement.querySelector(".chunkContent img");
                    assertEqual(
                        renderedImage instanceof HTMLImageElement,
                        true,
                        "chunk should include the pasted image preview"
                    );

                    const copyButton = /** @type {HTMLButtonElement} */ (
                        elements.resultsElement.querySelector(".copyButton")
                    );
                    copyButton.click();
                    await Promise.resolve();

                    assertEqual(clipboardWriteCalls.length, 1, "clipboard write should be invoked once");
                    const clipboardItems = clipboardWriteCalls[0];
                    assertEqual(Array.isArray(clipboardItems), true, "clipboard payload should be an array");
                    assertEqual(clipboardItems.length, 1, "clipboard payload should contain a single item");
                    const clipboardItem = /** @type {{ items: Record<string, Blob> }} */ (clipboardItems[0]);
                    assertEqual(
                        Object.prototype.hasOwnProperty.call(clipboardItem.items, "text/plain"),
                        true,
                        "text clipboard item should contain plain text"
                    );
                    assertEqual(
                        Object.prototype.hasOwnProperty.call(clipboardItem.items, "text/html"),
                        true,
                        "text clipboard item should contain HTML"
                    );
                    const htmlBlob = clipboardItem.items["text/html"];
                    const htmlContent = await htmlBlob.text();
                    assertEqual(/<img/i.test(htmlContent), true, "copied HTML should include the pasted image");
                } finally {
                    window.FileReader = originalFileReader;
                    navigator.clipboard.write = originalClipboardWrite;
                    cleanup();
                }
            }
        }
    ];

    for (const testCase of cases) {
        await runTest(testCase.name, () => testCase.execute());
    }
}
