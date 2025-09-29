// @ts-check
/**
 * @fileoverview Renders computed chunks and handles copy interactions.
 */

import { TEXT_CONTENT } from "../constants.js";
import { templateHelpers } from "../utils/templates.js";

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
     * Renders the provided chunk contents.
     * @param {import("../types.d.js").ChunkContent[]} chunks Ordered list of chunk content objects.
     * @param {(context: { chunk: import("../types.d.js").ChunkContent; containerElement: HTMLDivElement; buttonElement: HTMLButtonElement }) => void} onCopyRequest Handler invoked when the user clicks the copy button.
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

            chunks.forEach((chunkContent) => {
                const containerElement = document.createElement("div");
                containerElement.className = "chunkContainer";

                if (chunkContent.variant === "image") {
                    containerElement.classList.add("imageChunk");
                }

                const contentElement = document.createElement("div");
                contentElement.className = "chunkContent";
                contentElement.innerHTML = chunkContent.htmlContent;

                const copyButtonElement = document.createElement("button");
                copyButtonElement.className = "copyButton";
                copyButtonElement.textContent = TEXT_CONTENT.COPY_BUTTON_LABEL;
                copyButtonElement.addEventListener("click", () => {
                    onCopyRequest({
                        chunk: chunkContent,
                        containerElement,
                        buttonElement: copyButtonElement
                    });
                });

                const infoRow = document.createElement("div");
                infoRow.className = "chunkInfo";

                if (chunkContent.variant !== "image") {
                    const statisticsSource =
                        typeof chunkContent.statisticsText === "string"
                            ? chunkContent.statisticsText
                            : chunkContent.plainText;
                    const statistics = this.chunkingService.calculateStatistics(statisticsSource);
                    const statsElement = document.createElement("div");
                    statsElement.className = "stats";
                    statsElement.textContent = templateHelpers.interpolate(TEXT_CONTENT.CHUNK_STATS_TEMPLATE, {
                        characters: statistics.characters,
                        words: statistics.words,
                        sentences: statistics.sentences
                    });
                    infoRow.append(statsElement);
                } else {
                    infoRow.classList.add("imageOnly");
                }

                infoRow.append(copyButtonElement);

                containerElement.appendChild(contentElement);
                containerElement.appendChild(infoRow);
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

    /**
     * Marks a chunk as having encountered a copy error.
     * @param {HTMLDivElement} containerElement Container representing the chunk.
     * @param {HTMLButtonElement} buttonElement Button element used to trigger the copy action.
     * @returns {void}
     */
    markChunkCopyError(containerElement, buttonElement) {
        containerElement.removeAttribute("data-copied-order");
        containerElement.classList.remove("copied");
        containerElement.classList.add("copyError");
        buttonElement.textContent = TEXT_CONTENT.COPY_BUTTON_IMAGE_UNSUPPORTED_LABEL;
        buttonElement.classList.remove("success");
        buttonElement.classList.add("error");
        buttonElement.disabled = true;
    }
}
