// @ts-check
/**
 * @fileoverview Renders computed chunks and handles copy interactions.
 */

import { TEXT_CONTENT } from "../constants.js";
import { templateHelpers } from "../utils/templates.js";

/**
 * Automatically resizes a textarea to fit its content.
 * @param {HTMLTextAreaElement} textAreaElement Textarea that should expand vertically.
 * @returns {void}
 */
function autoExpandTextarea(textAreaElement) {
    textAreaElement.style.height = "auto";
    textAreaElement.style.height = `${textAreaElement.scrollHeight + 2}px`;
}

/**
 * View responsible for rendering thread chunks.
 */
export class ChunkListView {
    /**
     * @param {HTMLElement} resultsContainer Container where chunk markup is rendered.
     * @param {typeof import("../core/chunking.js").chunkingService} chunkingService Service for computing statistics.
     */
    constructor(resultsContainer, chunkingService) {
        this.resultsContainer = resultsContainer;
        this.chunkingService = chunkingService;
        this.pendingAnimationFrame = null;
    }

    /**
     * Clears the results pane and cancels any scheduled render work.
     * @returns {void}
     */
    clear() {
        if (this.pendingAnimationFrame !== null) {
            window.cancelAnimationFrame(this.pendingAnimationFrame);
            this.pendingAnimationFrame = null;
        }
        this.resultsContainer.innerHTML = "";
    }

    /**
     * Renders the provided chunk texts.
     * @param {string[]} chunks Ordered list of chunk strings.
     * @param {(context: { chunkText: string; containerElement: HTMLDivElement; buttonElement: HTMLButtonElement }) => void} onCopyRequest Handler invoked when the user clicks the copy button.
     * @returns {void}
     */
    renderChunks(chunks, onCopyRequest) {
        this.clear();
        if (chunks.length === 0) {
            return;
        }

        this.pendingAnimationFrame = window.requestAnimationFrame(() => {
            this.pendingAnimationFrame = null;
            const threadWrapper = document.createElement("div");
            threadWrapper.className = "threadWrapper";

            chunks.forEach((chunkText) => {
                const containerElement = document.createElement("div");
                containerElement.className = "chunkContainer";

                const textAreaElement = document.createElement("textarea");
                textAreaElement.readOnly = true;
                textAreaElement.value = chunkText;

                const resizeObserver = new ResizeObserver(() => {
                    autoExpandTextarea(textAreaElement);
                });
                resizeObserver.observe(textAreaElement);

                autoExpandTextarea(textAreaElement);

                const statistics = this.chunkingService.calculateStatistics(chunkText);
                const statsElement = document.createElement("div");
                statsElement.className = "stats";
                statsElement.textContent = templateHelpers.interpolate(TEXT_CONTENT.STATS_TEMPLATE, {
                    characters: statistics.characters,
                    words: statistics.words,
                    sentences: statistics.sentences
                });

                const copyButtonElement = document.createElement("button");
                copyButtonElement.className = "copyButton";
                copyButtonElement.textContent = TEXT_CONTENT.COPY_BUTTON_LABEL;
                copyButtonElement.addEventListener("click", () => {
                    onCopyRequest({
                        chunkText,
                        containerElement,
                        buttonElement: copyButtonElement
                    });
                });

                const infoRow = document.createElement("div");
                infoRow.className = "chunkInfo";
                infoRow.append(statsElement, copyButtonElement);

                containerElement.append(textAreaElement, infoRow);
                threadWrapper.appendChild(containerElement);
            });

            this.resultsContainer.appendChild(threadWrapper);
        });
    }

    /**
     * Marks a chunk as copied and reverts the button state after a delay.
     * @param {HTMLDivElement} containerElement Container representing the chunk.
     * @param {HTMLButtonElement} buttonElement Button element used to trigger the copy action.
     * @param {number} copyOrder Sequence number representing the copy order.
     * @returns {void}
     */
    markChunkAsCopied(containerElement, buttonElement, copyOrder) {
        containerElement.setAttribute("data-copied-order", String(copyOrder));
        containerElement.classList.add("copied");
        buttonElement.textContent = TEXT_CONTENT.COPY_BUTTON_SUCCESS_LABEL;
        buttonElement.classList.add("success");
        buttonElement.disabled = true;

        window.setTimeout(() => {
            buttonElement.textContent = TEXT_CONTENT.COPY_BUTTON_LABEL;
            buttonElement.classList.remove("success");
            buttonElement.disabled = false;
        }, 2000);
    }
}
