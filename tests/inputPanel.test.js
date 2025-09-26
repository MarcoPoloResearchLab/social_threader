// @ts-check
/**
 * @fileoverview Tests covering InputPanel document snapshot serialization.
 */

import { InputPanel } from "../js/ui/inputPanel.js";
import { assertEqual } from "./assert.js";

const SNAPSHOT_ASSERTION_MESSAGES = Object.freeze({
    placeholderMismatch: "Snapshot placeholder text should match expected newline separated paragraphs",
    plainTextMismatch: "Snapshot plain text should match expected newline separated paragraphs"
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

const EXPECTED_SNAPSHOT_TEXT = Object.freeze({
    sequentialParagraphs: "Paragraph #1.\nParagraph #2.\nParagraph #3.",
    inlineEmphasis: "Intro with emphasis highlighted conclusion.",
    mixedInlineElements: "Leading strong text and trailing content.\nLink enriched paragraph content."
});

const INLINE_ELEMENT_TEXT = Object.freeze({
    emphasizedWord: "emphasis",
    strongWord: "strong text",
    linkLabel: "Link"
});

const INLINE_ELEMENT_URLS = Object.freeze({
    exampleLink: "https://example.com"
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
 * Creates a consistent DOM fixture for InputPanel tests.
 * @returns {{ inputPanel: InputPanel, editorElement: HTMLDivElement, cleanup: () => void }}
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

    return { inputPanel, editorElement, cleanup };
}

const DOCUMENT_CASES = [
    {
        name: "captures newline separated paragraphs for plain text content",
        expectedText: EXPECTED_SNAPSHOT_TEXT.sequentialParagraphs,
        builderSteps: [
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
 * Runs InputPanel serialization tests.
 * @param {(name: string, fn: () => (void | Promise<void>)) => Promise<void>} runTest Test harness callback.
 * @returns {Promise<void>}
 */
export async function runInputPanelTests(runTest) {
    for (const documentCase of DOCUMENT_CASES) {
        await runTest(documentCase.name, () => {
            const { inputPanel, editorElement, cleanup } = createInputPanelFixture();
            try {
                documentCase.builderSteps.forEach((builderStep) => {
                    builderStep(editorElement);
                });
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
            } finally {
                cleanup();
            }
        });
    }
}
