// @ts-check
/**
 * @fileoverview Tests covering InputPanel document snapshot serialization.
 */

import { TEXT_CONTENT } from "../js/constants.js";
import { templateHelpers } from "../js/utils/templates.js";
import { InputPanel } from "../js/ui/inputPanel.js";
import { assertEqual } from "./assert.js";

const SNAPSHOT_ASSERTION_MESSAGES = Object.freeze({
    placeholderMismatch: "Snapshot placeholder text should match expected newline separated paragraphs",
    plainTextMismatch: "Snapshot plain text should match expected newline separated paragraphs",
    serializedLengthMismatch: "Serialized placeholder text should match the expected character length",
    plainTextLengthMismatch: "Snapshot plain text should match the expected character length",
    statisticsTextMismatch:
        "Statistics summary should match expected template output when globalThis.Node constructor is removed"
});

const PARAGRAPH_TEXT_CONTENT = Object.freeze({
    firstParagraph: "Paragraph #1.",
    secondParagraph: "Paragraph #2.",
    thirdParagraph: "Paragraph #3.",
    inlineEmphasisLeadingText: "Intro with ",
    inlineEmphasisTrailingText: " highlighted conclusion.",
    inlineStrongLeadingText: "Leading ",
    inlineStrongTrailingText: " and trailing content.",
    inlineLinkTrailingText: " enriched paragraph content."
});

const SOFT_BREAK_TEXT_CONTENT = Object.freeze({
    firstLine: "Soft line breaks remain within paragraphs.",
    secondLine: "Soft line breaks should not create new paragraphs."
});

const NODE_REMOVAL_EXPECTED_STATISTICS = Object.freeze({
    characters: 43,
    words: 6,
    sentences: 3,
    paragraphs: 3
});

const EXPECTED_STATISTICS_TEXT = Object.freeze({
    nodeConstructorRemoved: templateHelpers.interpolate(
        TEXT_CONTENT.INPUT_STATS_TEMPLATE,
        NODE_REMOVAL_EXPECTED_STATISTICS
    )
});

const INLINE_ELEMENT_TEXT = Object.freeze({
    emphasizedWord: "emphasis",
    strongWord: "strong text",
    linkLabel: "Link"
});

const INLINE_ELEMENT_URLS = Object.freeze({
    exampleLink: "https://example.com"
});

const EDITOR_SEPARATOR_REGRESSION_TEXT = Object.freeze({
    firstParagraph: "Puppeteer ensures reliable browser coverage.",
    secondParagraph: "Browser automation validates paragraph counts.",
    expectedLength: 92
});

const EXPECTED_SNAPSHOT_TEXT = Object.freeze({
    sequentialParagraphs: "Paragraph #1.\n\nParagraph #2.\n\nParagraph #3.",
    inlineEmphasis: "Intro with emphasis highlighted conclusion.",
    mixedInlineElements: "Leading strong text and trailing content.\n\nLink enriched paragraph content.",
    softLineBreakParagraph: `${SOFT_BREAK_TEXT_CONTENT.firstLine}\n${SOFT_BREAK_TEXT_CONTENT.secondLine}`,
    doubleSpacerParagraphs: `${EDITOR_SEPARATOR_REGRESSION_TEXT.firstParagraph}\n\n\n\n${EDITOR_SEPARATOR_REGRESSION_TEXT.secondParagraph}`
});

/**
 * Appends a paragraph container with an optional list of child nodes, ensuring
 * the trailing break matches typical contenteditable output.
 * @param {HTMLDivElement} targetEditorElement Editor element being populated.
 * @param {Node[]} paragraphChildren Ordered list of nodes to place inside the paragraph div.
 * @returns {void}
 */
function appendParagraphWithChildren(targetEditorElement, paragraphChildren) {
    const paragraphElement = document.createElement("div");
    paragraphChildren.forEach((childNode) => {
        paragraphElement.appendChild(childNode);
    });
    paragraphElement.appendChild(document.createElement("br"));
    targetEditorElement.appendChild(paragraphElement);
}

/**
 * Appends an empty paragraph represented by a div containing only a break node.
 * @param {HTMLDivElement} targetEditorElement Editor element being populated.
 * @returns {void}
 */
function appendEmptyParagraph(targetEditorElement) {
    const paragraphElement = document.createElement("div");
    paragraphElement.appendChild(document.createElement("br"));
    targetEditorElement.appendChild(paragraphElement);
}

/**
 * Overrides cloneNode to return a lightweight markup snapshot, forcing fallback serialization paths.
 * @param {HTMLDivElement} editorElement Editor element whose clone behavior should be modified.
 * @returns {() => void} Cleanup function restoring the original cloneNode implementation.
 */
function overrideCloneNodeWithMarkupSnapshot(editorElement) {
    const originalCloneNode = editorElement.cloneNode.bind(editorElement);
    editorElement.cloneNode = () => {
        const serializedMarkup = editorElement.innerHTML;
        const serializedText = editorElement.textContent || "";
        return {
            innerHTML: serializedMarkup,
            textContent: serializedText,
            childNodes: [],
            children: [],
            querySelectorAll() {
                return [];
            }
        };
    };
    return () => {
        editorElement.cloneNode = originalCloneNode;
    };
}

/**
 * Executes each builder step to populate the editor element with test content.
 * @param {HTMLDivElement} targetEditorElement Editor element receiving constructed nodes.
 * @param {Array<(targetEditorElement: HTMLDivElement) => void>} builderSteps Ordered builder callbacks.
 * @returns {void}
 */
function populateEditorFromSteps(targetEditorElement, builderSteps) {
    builderSteps.forEach((builderStep) => {
        builderStep(targetEditorElement);
    });
}

const SEQUENTIAL_PARAGRAPH_BUILDER_STEPS = Object.freeze([
    /**
     * @param {HTMLDivElement} targetEditorElement
     */
    (targetEditorElement) => {
        appendParagraphWithChildren(targetEditorElement, [
            document.createTextNode(PARAGRAPH_TEXT_CONTENT.firstParagraph)
        ]);
    },
    /**
     * @param {HTMLDivElement} targetEditorElement
     */
    (targetEditorElement) => {
        appendParagraphWithChildren(targetEditorElement, [
            document.createTextNode(PARAGRAPH_TEXT_CONTENT.secondParagraph)
        ]);
    },
    /**
     * @param {HTMLDivElement} targetEditorElement
     */
    (targetEditorElement) => {
        appendParagraphWithChildren(targetEditorElement, [
            document.createTextNode(PARAGRAPH_TEXT_CONTENT.thirdParagraph)
        ]);
    },
    appendEmptyParagraph
]);

const DOUBLE_SPACER_PARAGRAPH_BUILDER_STEPS = Object.freeze([
    /**
     * @param {HTMLDivElement} targetEditorElement
     */
    (targetEditorElement) => {
        appendParagraphWithChildren(targetEditorElement, [
            document.createTextNode(EDITOR_SEPARATOR_REGRESSION_TEXT.firstParagraph)
        ]);
    },
    appendEmptyParagraph,
    appendEmptyParagraph,
    /**
     * @param {HTMLDivElement} targetEditorElement
     */
    (targetEditorElement) => {
        appendParagraphWithChildren(targetEditorElement, [
            document.createTextNode(EDITOR_SEPARATOR_REGRESSION_TEXT.secondParagraph)
        ]);
    },
    appendEmptyParagraph
]);

/**
 * Creates a consistent DOM fixture for InputPanel tests.
 * @returns {{ inputPanel: InputPanel, editorElement: HTMLDivElement, statsElement: HTMLElement, cleanup: () => void }}
 */
function createInputPanelFixture() {
    const fixtureContainer = document.createElement("div");
    const editorElement = document.createElement("div");
    editorElement.setAttribute("contenteditable", "true");
    const statsElement = document.createElement("div");
    const errorElement = document.createElement("div");

    fixtureContainer.appendChild(editorElement);
    fixtureContainer.appendChild(statsElement);
    fixtureContainer.appendChild(errorElement);
    document.body.appendChild(fixtureContainer);

    const inputPanel = new InputPanel(editorElement, statsElement, errorElement);

    const cleanup = () => {
        fixtureContainer.remove();
    };

    return { inputPanel, editorElement, statsElement, cleanup };
}

/**
 * @typedef {Object} DocumentCaseDefinition
 * @property {string} name
 * @property {string} expectedText
 * @property {Array<(targetEditorElement: HTMLDivElement) => void>} builderSteps
 * @property {number=} expectedLength
 * @property {import("../js/types.d.js").ChunkStatistics=} expectedStatistics
 * @property {string=} expectedStatisticsText
 */

/** @type {DocumentCaseDefinition[]} */
const DOCUMENT_CASES = [
    {
        name: "captures newline separated paragraphs for plain text content",
        expectedText: EXPECTED_SNAPSHOT_TEXT.sequentialParagraphs,
        builderSteps: SEQUENTIAL_PARAGRAPH_BUILDER_STEPS
    },
    {
        name: "expands spacer divs to paragraph separators",
        expectedText: `${EDITOR_SEPARATOR_REGRESSION_TEXT.firstParagraph}\n\n${EDITOR_SEPARATOR_REGRESSION_TEXT.secondParagraph}`,
        expectedLength: EDITOR_SEPARATOR_REGRESSION_TEXT.expectedLength,
        builderSteps: [
            /**
             * @param {HTMLDivElement} targetEditorElement
             */
            (targetEditorElement) => {
                appendParagraphWithChildren(targetEditorElement, [
                    document.createTextNode(EDITOR_SEPARATOR_REGRESSION_TEXT.firstParagraph)
                ]);
            },
            appendEmptyParagraph,
            /**
             * @param {HTMLDivElement} targetEditorElement
             */
            (targetEditorElement) => {
                appendParagraphWithChildren(targetEditorElement, [
                    document.createTextNode(EDITOR_SEPARATOR_REGRESSION_TEXT.secondParagraph)
                ]);
            },
            appendEmptyParagraph
        ]
    },
    {
        name: "preserves soft line breaks within paragraph boundaries",
        expectedText: EXPECTED_SNAPSHOT_TEXT.softLineBreakParagraph,
        builderSteps: [
            /**
             * @param {HTMLDivElement} targetEditorElement
             */
            (targetEditorElement) => {
                appendParagraphWithChildren(targetEditorElement, [
                    document.createTextNode(SOFT_BREAK_TEXT_CONTENT.firstLine),
                    document.createElement("br"),
                    document.createTextNode(SOFT_BREAK_TEXT_CONTENT.secondLine)
                ]);
            },
            appendEmptyParagraph
        ]
    },
    {
        name: "captures inline formatting within paragraph boundaries",
        expectedText: EXPECTED_SNAPSHOT_TEXT.inlineEmphasis,
        builderSteps: [
            /**
             * @param {HTMLDivElement} targetEditorElement
             */
            (targetEditorElement) => {
                const emphasizedElement = document.createElement("em");
                emphasizedElement.textContent = INLINE_ELEMENT_TEXT.emphasizedWord;
                appendParagraphWithChildren(targetEditorElement, [
                    document.createTextNode(PARAGRAPH_TEXT_CONTENT.inlineEmphasisLeadingText),
                    emphasizedElement,
                    document.createTextNode(PARAGRAPH_TEXT_CONTENT.inlineEmphasisTrailingText)
                ]);
            },
            appendEmptyParagraph
        ]
    },
    {
        name: "preserves multiple paragraphs containing inline elements",
        expectedText: EXPECTED_SNAPSHOT_TEXT.mixedInlineElements,
        builderSteps: [
            /**
             * @param {HTMLDivElement} targetEditorElement
             */
            (targetEditorElement) => {
                const strongElement = document.createElement("strong");
                strongElement.textContent = INLINE_ELEMENT_TEXT.strongWord;
                appendParagraphWithChildren(targetEditorElement, [
                    document.createTextNode(PARAGRAPH_TEXT_CONTENT.inlineStrongLeadingText),
                    strongElement,
                    document.createTextNode(PARAGRAPH_TEXT_CONTENT.inlineStrongTrailingText)
                ]);
            },
            /**
             * @param {HTMLDivElement} targetEditorElement
             */
            (targetEditorElement) => {
                const linkElement = document.createElement("a");
                linkElement.href = INLINE_ELEMENT_URLS.exampleLink;
                linkElement.textContent = INLINE_ELEMENT_TEXT.linkLabel;
                appendParagraphWithChildren(targetEditorElement, [
                    linkElement,
                    document.createTextNode(PARAGRAPH_TEXT_CONTENT.inlineLinkTrailingText)
                ]);
            },
            appendEmptyParagraph
        ]
    }
];

/**
 * @typedef {Object} NodeConstructorRegressionCaseDefinition
 * @property {string} name Test case description.
 * @property {Array<(targetEditorElement: HTMLDivElement) => void>} builderSteps Ordered builder callbacks.
 * @property {string} expectedPlaceholderText Expected serialized placeholder output.
 * @property {string} expectedPlainText Expected plain text output after placeholder normalization.
 * @property {import("../js/types.d.js").ChunkStatistics=} expectedStatistics Optional statistics used for assertions.
 * @property {string=} expectedStatisticsText Optional formatted statistics text.
 * @property {(editorElement: HTMLDivElement) => (void | (() => void))=} applyCloneOverride Optional hook to override cloneNode behavior.
 */

/** @type {NodeConstructorRegressionCaseDefinition[]} */
const NODE_CONSTRUCTOR_REGRESSION_CASES = Object.freeze([
    {
        name: "maintains placeholder serialization when globalThis.Node constructor is removed",
        builderSteps: SEQUENTIAL_PARAGRAPH_BUILDER_STEPS,
        expectedPlaceholderText: EXPECTED_SNAPSHOT_TEXT.sequentialParagraphs,
        expectedPlainText: EXPECTED_SNAPSHOT_TEXT.sequentialParagraphs,
        expectedStatistics: NODE_REMOVAL_EXPECTED_STATISTICS,
        expectedStatisticsText: EXPECTED_STATISTICS_TEXT.nodeConstructorRemoved
    },
    {
        name: "reconstructs paragraph separators with consecutive empty paragraphs when globalThis.Node constructor is removed",
        builderSteps: DOUBLE_SPACER_PARAGRAPH_BUILDER_STEPS,
        expectedPlaceholderText: EXPECTED_SNAPSHOT_TEXT.doubleSpacerParagraphs,
        expectedPlainText: EXPECTED_SNAPSHOT_TEXT.doubleSpacerParagraphs
    },
    {
        name: "restores double newline separators from serialized markup when globalThis.Node constructor is removed",
        builderSteps: DOUBLE_SPACER_PARAGRAPH_BUILDER_STEPS,
        expectedPlaceholderText: EXPECTED_SNAPSHOT_TEXT.doubleSpacerParagraphs,
        expectedPlainText: EXPECTED_SNAPSHOT_TEXT.doubleSpacerParagraphs,
        applyCloneOverride: overrideCloneNodeWithMarkupSnapshot
    }
]);

/**
 * Runs InputPanel serialization tests.
 * @param {(name: string, fn: () => (void | Promise<void>)) => Promise<void>} runTest Test harness callback.
 * @returns {Promise<void>}
 */
export async function runInputPanelTests(runTest) {
    for (const documentCase of DOCUMENT_CASES) {
        await runTest(documentCase.name, () => {
            const fixture = createInputPanelFixture();
            const { inputPanel, editorElement, statsElement, cleanup } = fixture;
            try {
                populateEditorFromSteps(editorElement, documentCase.builderSteps);
                const snapshot = inputPanel.getDocumentSnapshot();
                assertEqual(
                    snapshot.placeholderText,
                    documentCase.expectedText,
                    SNAPSHOT_ASSERTION_MESSAGES.placeholderMismatch
                );
                assertEqual(
                    snapshot.plainText,
                    documentCase.expectedText,
                    SNAPSHOT_ASSERTION_MESSAGES.plainTextMismatch
                );
                if (typeof documentCase.expectedLength === "number") {
                    assertEqual(
                        snapshot.placeholderText.length,
                        documentCase.expectedLength,
                        SNAPSHOT_ASSERTION_MESSAGES.serializedLengthMismatch
                    );
                    assertEqual(
                        snapshot.plainText.length,
                        documentCase.expectedLength,
                        SNAPSHOT_ASSERTION_MESSAGES.plainTextLengthMismatch
                    );
                }
                if (
                    documentCase.expectedStatistics &&
                    typeof documentCase.expectedStatisticsText === "string"
                ) {
                    inputPanel.updateStatistics(documentCase.expectedStatistics);
                    assertEqual(
                        statsElement.textContent,
                        documentCase.expectedStatisticsText,
                        SNAPSHOT_ASSERTION_MESSAGES.statisticsTextMismatch
                    );
                }
            } finally {
                cleanup();
            }
        });
    }

    for (const regressionCase of NODE_CONSTRUCTOR_REGRESSION_CASES) {
        await runTest(regressionCase.name, () => {
            const fixture = createInputPanelFixture();
            const { inputPanel, editorElement, statsElement, cleanup } = fixture;
            const originalNodeConstructor = globalThis.Node;
            let restoreCloneOverride = null;
            try {
                populateEditorFromSteps(editorElement, regressionCase.builderSteps);
                if (typeof regressionCase.applyCloneOverride === "function") {
                    const cleanupCallback = regressionCase.applyCloneOverride(editorElement);
                    if (typeof cleanupCallback === "function") {
                        restoreCloneOverride = cleanupCallback;
                    }
                }
                delete globalThis.Node;
                const snapshot = inputPanel.getDocumentSnapshot();
                assertEqual(
                    snapshot.placeholderText,
                    regressionCase.expectedPlaceholderText,
                    SNAPSHOT_ASSERTION_MESSAGES.placeholderMismatch
                );
                assertEqual(
                    snapshot.plainText,
                    regressionCase.expectedPlainText,
                    SNAPSHOT_ASSERTION_MESSAGES.plainTextMismatch
                );
                if (
                    regressionCase.expectedStatistics &&
                    typeof regressionCase.expectedStatisticsText === "string"
                ) {
                    inputPanel.updateStatistics(regressionCase.expectedStatistics);
                    assertEqual(
                        statsElement.textContent,
                        regressionCase.expectedStatisticsText,
                        SNAPSHOT_ASSERTION_MESSAGES.statisticsTextMismatch
                    );
                }
            } finally {
                if (restoreCloneOverride) {
                    restoreCloneOverride();
                }
                if (typeof originalNodeConstructor === "undefined") {
                    delete globalThis.Node;
                } else {
                    globalThis.Node = originalNodeConstructor;
                }
                cleanup();
            }
        });
    }
}
