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
import { templateHelpers } from "../js/utils/templates.js";
import {
    PRESET_IDENTIFIERS,
    TOGGLE_IDENTIFIERS,
    DEFAULT_LENGTHS,
    TEXT_CONTENT,
    CLASS_NAMES
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

const nativeClipboardItemConstructor =
    typeof window.ClipboardItem === "function" ? window.ClipboardItem : null;

/**
 * ClipboardItem override used to expose payloads for assertions while still
 * delegating to the native implementation when available.
 */
class ClipboardItemStub extends (nativeClipboardItemConstructor ?? class {}) {
    /**
     * @param {Record<string, Blob>} itemData
     */
    constructor(itemData) {
        super(itemData);
        this.items = itemData;
    }

    /**
     * @returns {boolean}
     */
    static supports() {
        if (nativeClipboardItemConstructor && typeof nativeClipboardItemConstructor.supports === "function") {
            return nativeClipboardItemConstructor.supports();
        }
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
 * Converts the rendered statistics string into numeric values for assertions.
 * @param {string} statisticsText Text content produced by the statistics template.
 * @returns {{ characters: number, words: number, sentences: number, paragraphs: number }} Parsed statistics values.
 */
function parseStatisticsText(statisticsText) {
    const parsedValues = {
        characters: 0,
        words: 0,
        sentences: 0,
        paragraphs: 0
    };

    statisticsText.split(" | ").forEach((segment) => {
        const [rawLabel, rawValue] = segment.split(": ");
        if (!rawLabel || !rawValue) {
            return;
        }
        const normalizedLabel = rawLabel.trim().toLowerCase();
        const numericValue = Number.parseInt(rawValue.trim(), 10);
        if (Number.isNaN(numericValue)) {
            return;
        }
        if (normalizedLabel === "characters") {
            parsedValues.characters = numericValue;
        } else if (normalizedLabel === "words") {
            parsedValues.words = numericValue;
        } else if (normalizedLabel === "sentences") {
            parsedValues.sentences = numericValue;
        } else if (normalizedLabel === "paragraphs") {
            parsedValues.paragraphs = numericValue;
        }
    });

    return parsedValues;
}

/**
 * @typedef {string | { tagName: string, text: string }} ParagraphChildDefinition
 */

/**
 * @typedef {{ children?: ParagraphChildDefinition[], isBlank?: boolean }} ContenteditableParagraphConfiguration
 */

/**
 * Builds the contenteditable paragraph structure the browser generates for Enter-separated paragraphs.
 * @param {HTMLDivElement} editorElement Editable element that should receive the generated structure.
 * @param {ContenteditableParagraphConfiguration[]} paragraphConfigurations Ordered configuration describing each paragraph.
 * @returns {void}
 */
function populateEditorWithParagraphStructure(editorElement, paragraphConfigurations) {
    while (editorElement.firstChild) {
        editorElement.removeChild(editorElement.firstChild);
    }

    paragraphConfigurations.forEach((paragraphConfiguration) => {
        const paragraphElement = document.createElement("div");
        if (paragraphConfiguration.isBlank) {
            paragraphElement.appendChild(document.createElement("br"));
        } else {
            const childDefinitions = paragraphConfiguration.children ?? [];
            childDefinitions.forEach((childDefinition) => {
                if (typeof childDefinition === "string") {
                    paragraphElement.append(childDefinition);
                } else {
                    const inlineElement = document.createElement(childDefinition.tagName);
                    inlineElement.textContent = childDefinition.text;
                    paragraphElement.appendChild(inlineElement);
                }
            });
        }
        editorElement.appendChild(paragraphElement);
    });
}

/**
 * Creates a paragraph statistics fixture with expectations derived up front.
 * @param {string} description Human-readable description of the paragraph structure.
 * @param {ContenteditableParagraphConfiguration[]} paragraphConfigurations Ordered configuration describing each paragraph.
 * @param {boolean} expectedToggleDisabled Whether the paragraph toggle is expected to be disabled.
 * @returns {{ description: string, paragraphConfigurations: ContenteditableParagraphConfiguration[], expectedToggleDisabled: boolean, expectedStatistics: import("../js/types.d.js").ChunkStatistics }} Fixture containing expectations.
 */
function createParagraphStatisticsFixture(
    description,
    paragraphConfigurations,
    expectedToggleDisabled,
    expectedStatistics
) {
    return {
        description,
        paragraphConfigurations,
        expectedToggleDisabled,
        expectedStatistics
    };
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
                            buttonElement.classList.contains(CLASS_NAMES.ACTIVE),
                            false,
                            "preset buttons should start inactive"
                        );
                    }
                    assertEqual(
                        elements.customButton.classList.contains(CLASS_NAMES.ACTIVE),
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
            name: "preset button toggles off to clear the thread",
            async execute() {
                const { elements, cleanup } = setupControllerFixture();
                try {
                    const sampleText = Array.from({ length: 8 }, () => "Toggle behavior sample sentence.").join(" ");
                    elements.editorElement.textContent = sampleText;
                    elements.editorElement.dispatchEvent(new Event("input"));
                    elements.presetTwitter.click();
                    await waitForAnimationFrame();

                    let renderedChunks = elements.resultsElement.querySelectorAll(".chunkContainer");
                    assertEqual(renderedChunks.length > 0, true, "chunks should render when preset activates");
                    assertEqual(
                        elements.presetTwitter.classList.contains(CLASS_NAMES.ACTIVE),
                        true,
                        "preset button should be marked active after selection"
                    );

                    elements.presetTwitter.click();
                    await waitForAnimationFrame();
                    renderedChunks = elements.resultsElement.querySelectorAll(".chunkContainer");
                    assertEqual(renderedChunks.length, 0, "chunks should clear when preset is toggled off");
                    assertEqual(
                        elements.presetTwitter.classList.contains(CLASS_NAMES.ACTIVE),
                        false,
                        "preset button should not remain active after toggling off"
                    );

                    elements.editorElement.textContent = `${sampleText} Additional content after toggle.`;
                    elements.editorElement.dispatchEvent(new Event("input"));
                    await new Promise((resolve) => setTimeout(resolve, 150));
                    await waitForAnimationFrame();
                    renderedChunks = elements.resultsElement.querySelectorAll(".chunkContainer");
                    assertEqual(
                        renderedChunks.length,
                        0,
                        "chunks should remain cleared until a preset is reselected"
                    );
                } finally {
                    cleanup();
                }
            }
        },
        {
            name: "contenteditable paragraphs update statistics and toggle availability",
            async execute() {
                const { elements, cleanup } = setupControllerFixture();
                try {
                    const paragraphStatisticsFixtures = [
                        createParagraphStatisticsFixture(
                            "multi-paragraph copy updates every statistic",
                            [
                                { children: ["Sentences wrong. Paragraphs wrong."] },
                                { children: ["Words wrong everywhere."] }
                            ],
                            false,
                            { characters: 59, words: 7, sentences: 3, paragraphs: 2 }
                        ),
                        createParagraphStatisticsFixture(
                            "abbreviations and decimals do not inflate statistics",
                            [
                                {
                                    children: [
                                        "Dr. Rivera met approx. 30 volunteers at 5.5 p.m. for training."
                                    ]
                                },
                                {
                                    children: [
                                        "Everyone said, \"Progress is slow... but steady!\" Did it improve?"
                                    ]
                                },
                                {
                                    children: [
                                        "Next check-in is scheduled for Jan. 3rd, 2025."
                                    ]
                                }
                            ],
                            false,
                            { characters: 175, words: 29, sentences: 4, paragraphs: 3 }
                        ),
                        createParagraphStatisticsFixture(
                            "single paragraph keeps toggle disabled",
                            [{ children: ["Single paragraph only."] }],
                            true,
                            { characters: 22, words: 3, sentences: 1, paragraphs: 1 }
                        ),
                        createParagraphStatisticsFixture(
                            "multiple paragraphs enable toggle",
                            [
                                { children: ["First paragraph."] },
                                { children: ["Second paragraph."] }
                            ],
                            false,
                            { characters: 35, words: 4, sentences: 2, paragraphs: 2 }
                        ),
                        createParagraphStatisticsFixture(
                            "inline formatting paragraphs preserve counts",
                            [
                                { children: ["Paragraph ", { tagName: "strong", text: "#1" }, "."] },
                                { children: ["Paragraph ", { tagName: "em", text: "#2" }, "."] },
                                { children: ["Paragraph ", { tagName: "strong", text: "#3" }, "."] }
                            ],
                            false,
                            { characters: 42, words: 6, sentences: 3, paragraphs: 3 }
                        ),
                        createParagraphStatisticsFixture(
                            "trailing blank paragraph is ignored",
                            [
                                { children: ["Paragraph #1."] },
                                { children: ["Paragraph #2."] },
                                { children: ["Paragraph #3."] },
                                { isBlank: true }
                            ],
                            false,
                            { characters: 42, words: 6, sentences: 3, paragraphs: 3 }
                        )
                    ];

                    for (const fixtureDefinition of paragraphStatisticsFixtures) {
                        populateEditorWithParagraphStructure(
                            elements.editorElement,
                            fixtureDefinition.paragraphConfigurations
                        );
                        elements.editorElement.dispatchEvent(new Event("input"));
                        await waitForAnimationFrame();
                        await waitForAnimationFrame();

                        const displayedStatistics = parseStatisticsText(elements.statsElement.textContent || "");

                        assertEqual(
                            displayedStatistics.characters,
                            fixtureDefinition.expectedStatistics.characters,
                            `${fixtureDefinition.description} should display the expected character count`
                        );
                        assertEqual(
                            displayedStatistics.words,
                            fixtureDefinition.expectedStatistics.words,
                            `${fixtureDefinition.description} should display the expected word count`
                        );
                        assertEqual(
                            displayedStatistics.sentences,
                            fixtureDefinition.expectedStatistics.sentences,
                            `${fixtureDefinition.description} should display the expected sentence count`
                        );
                        assertEqual(
                            displayedStatistics.paragraphs,
                            fixtureDefinition.expectedStatistics.paragraphs,
                            `${fixtureDefinition.description} should display the expected paragraph count`
                        );
                        assertEqual(
                            elements.paragraphToggle.disabled,
                            fixtureDefinition.expectedToggleDisabled,
                            `${fixtureDefinition.description} should ${
                                fixtureDefinition.expectedToggleDisabled ? "keep" : "make"
                            } the paragraph toggle ${
                                fixtureDefinition.expectedToggleDisabled ? "disabled" : "enabled"
                            }`
                        );
                    }
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

                    const chunkContainers = Array.from(
                        elements.resultsElement.querySelectorAll(".chunkContainer")
                    );
                    const textContainer = chunkContainers.find((container) =>
                        !container.classList.contains("imageChunk")
                    );
                    const imageContainer = chunkContainers.find((container) =>
                        container.classList.contains("imageChunk")
                    );

                    if (!textContainer || !imageContainer) {
                        throw new Error("Expected both text and image chunks to be rendered");
                    }

                    const textCopyButton = /** @type {HTMLButtonElement} */ (
                        textContainer.querySelector(".copyButton")
                    );
                    textCopyButton.click();
                    await Promise.resolve();

                    assertEqual(clipboardWriteCalls.length, 1, "clipboard write should be invoked once");
                    let clipboardItems = clipboardWriteCalls[0];
                    assertEqual(Array.isArray(clipboardItems), true, "clipboard payload should be an array");
                    assertEqual(clipboardItems.length, 1, "clipboard payload should contain a single item");
                    let clipboardItem = /** @type {{ items: Record<string, Blob> }} */ (clipboardItems[0]);
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
                    let plainTextBlob = clipboardItem.items["text/plain"];
                    let plainTextContent = await plainTextBlob.text();
                    assertEqual(
                        plainTextContent.includes(TEXT_CONTENT.IMAGE_PLAIN_TEXT_PLACEHOLDER),
                        false,
                        "text chunk plain text should not inject an image placeholder"
                    );
                    let htmlBlob = clipboardItem.items["text/html"];
                    let htmlContent = await htmlBlob.text();
                    assertEqual(/<img/i.test(htmlContent), false, "text chunk HTML should not inline the image");

                    clipboardWriteCalls.length = 0;

                    const imageCopyButton = /** @type {HTMLButtonElement} */ (
                        imageContainer.querySelector(".copyButton")
                    );
                    imageCopyButton.click();
                    await Promise.resolve();

                    assertEqual(clipboardWriteCalls.length, 1, "image chunk copy should trigger clipboard write");
                    clipboardItems = clipboardWriteCalls[0];
                    assertEqual(clipboardItems.length, 1, "clipboard payload should contain a single item");
                    clipboardItem = /** @type {{ items: Record<string, Blob> }} */ (clipboardItems[0]);
                    assertEqual(
                        Object.prototype.hasOwnProperty.call(clipboardItem.items, "text/plain"),
                        true,
                        "image clipboard item should include plain text"
                    );
                    assertEqual(
                        Object.prototype.hasOwnProperty.call(clipboardItem.items, "text/html"),
                        true,
                        "image clipboard item should include HTML"
                    );
                    plainTextBlob = clipboardItem.items["text/plain"];
                    plainTextContent = await plainTextBlob.text();
                    assertEqual(plainTextContent.length, 0, "image clipboard plain text should be empty");
                    assertEqual(
                        Object.prototype.hasOwnProperty.call(clipboardItem.items, "image/png"),
                        true,
                        "image clipboard item should embed the PNG payload"
                    );
                    const pastedImageBlob = clipboardItem.items["image/png"];
                    const pastedImageBuffer = await pastedImageBlob.arrayBuffer();
                    const decodedImage = new TextDecoder().decode(new Uint8Array(pastedImageBuffer));
                    assertEqual(decodedImage, "fake", "image clipboard blob should match the original data");
                    htmlBlob = clipboardItem.items["text/html"];
                    htmlContent = await htmlBlob.text();
                    assertEqual(/<img/i.test(htmlContent), true, "copied HTML should include the pasted image");
                } finally {
                    window.FileReader = originalFileReader;
                    navigator.clipboard.write = originalClipboardWrite;
                    cleanup();
                }
            }
        },
        {
            name: "image-only paste renders image chunks without requiring text",
            async execute() {
                const { elements, cleanup } = setupControllerFixture();
                const originalFileReader = window.FileReader;

                try {
                    class FileReaderStub {
                        constructor() {
                            /** @type {((this: FileReaderStub, ev: Event) => void) | null} */
                            this.onload = null;
                            /** @type {string | null} */
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
                    elements.presetTwitter.click();
                    await waitForAnimationFrame();

                    const chunkContainers = Array.from(
                        elements.resultsElement.querySelectorAll(".chunkContainer")
                    );
                    assertEqual(
                        chunkContainers.length,
                        1,
                        "image-only paste should render a single chunk for the pasted image"
                    );
                    const imageContainer = chunkContainers[0];
                    assertEqual(
                        imageContainer.classList.contains("imageChunk"),
                        true,
                        "image-only paste should mark the rendered chunk as an image"
                    );
                    const renderedImage = imageContainer.querySelector("img");
                    assertEqual(
                        renderedImage instanceof HTMLImageElement,
                        true,
                        "image-only paste should render an image preview"
                    );
                    assertEqual(
                        elements.errorElement.textContent,
                        "",
                        "image-only paste should not trigger the missing text error"
                    );
                } finally {
                    window.FileReader = originalFileReader;
                    cleanup();
                }
            }
        }
    ];

    for (const testCase of cases) {
        await runTest(testCase.name, () => testCase.execute());
    }
}
