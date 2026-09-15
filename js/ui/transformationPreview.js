// @ts-check
/**
 * @fileoverview Plain-text transformation preview and explicit result actions.
 */

import {
    TEXT_CONTENT,
    TRANSFORMATION_ACTION_IDENTIFIERS
} from "../constants.js";

const PREVIEW_TEXT_ATTRIBUTE = "data-transformation-preview-text";
const ERROR_ATTRIBUTE = "data-transformation-error";
const STALE_ATTRIBUTE = "data-transformation-stale";
const ACTION_ATTRIBUTE = "data-transformation-action";

/**
 * Renders model results as plain text and exposes explicit result actions.
 */
export class TransformationPreview {
    /**
     * @param {HTMLElement} rootElement Preview mount point.
     */
    constructor(rootElement) {
        this.rootElement = rootElement;
        this.previewTextElement = document.createElement("pre");
        this.staleElement = document.createElement("p");
        this.errorElement = document.createElement("p");
        this.resultActionsElement = document.createElement("div");
        this.undoElement = document.createElement("div");
        /** @type {Map<string, HTMLButtonElement>} */
        this.actionButtons = new Map();
        /** @type {Map<string, () => void>} */
        this.actionCallbacks = new Map();
        this.render();
        this.clear();
    }

    /** @param {() => void} callback Apply action handler. @returns {void} */
    onApply(callback) {
        this.actionCallbacks.set(TRANSFORMATION_ACTION_IDENTIFIERS.APPLY, callback);
    }

    /** @param {() => void} callback Discard action handler. @returns {void} */
    onDiscard(callback) {
        this.actionCallbacks.set(TRANSFORMATION_ACTION_IDENTIFIERS.DISCARD, callback);
    }

    /** @param {() => void} callback Retry action handler. @returns {void} */
    onRetry(callback) {
        this.actionCallbacks.set(TRANSFORMATION_ACTION_IDENTIFIERS.RETRY, callback);
    }

    /** @param {() => void} callback Undo action handler. @returns {void} */
    onUndo(callback) {
        this.actionCallbacks.set(TRANSFORMATION_ACTION_IDENTIFIERS.UNDO, callback);
    }

    /**
     * Shows one validated result without changing the editor.
     * @param {import('../types.d.js').TransformationResponse} response Validated API result.
     * @param {boolean} stale Whether the editor changed after request start.
     * @returns {void}
     */
    showResult(response, stale) {
        this.rootElement.hidden = false;
        this.rootElement.dataset.transformationState = "result";
        this.previewTextElement.textContent = response.text;
        this.previewTextElement.hidden = false;
        this.errorElement.textContent = "";
        this.errorElement.hidden = true;
        this.resultActionsElement.hidden = false;
        this.undoElement.hidden = true;
        this.setStale(stale);
    }

    /**
     * Updates stale-result copy after a later editor revision.
     * @param {boolean} stale Whether the visible result uses an older source revision.
     * @returns {void}
     */
    setStale(stale) {
        this.rootElement.setAttribute(STALE_ATTRIBUTE, String(stale));
        this.staleElement.textContent = stale ? TEXT_CONTENT.TRANSFORMATION_STALE_RESULT : "";
        this.staleElement.hidden = !stale;
    }

    /**
     * Prevents Apply and Try again when a later editor revision contains unsupported images.
     * @param {boolean} enabled Whether text-only result actions can use the current draft.
     * @returns {void}
     */
    setTextActionsEnabled(enabled) {
        [
            TRANSFORMATION_ACTION_IDENTIFIERS.APPLY,
            TRANSFORMATION_ACTION_IDENTIFIERS.RETRY
        ].forEach((action) => {
            const actionButton = this.actionButtons.get(action);
            if (actionButton) {
                actionButton.disabled = !enabled;
                actionButton.setAttribute("aria-disabled", String(!enabled));
            }
        });
    }

    /**
     * Shows one browser-owned error message.
     * @param {string} message User-facing error copy from constants.
     * @returns {void}
     */
    showError(message) {
        this.rootElement.hidden = false;
        this.rootElement.dataset.transformationState = "error";
        this.previewTextElement.textContent = "";
        this.previewTextElement.hidden = true;
        this.staleElement.hidden = true;
        this.rootElement.setAttribute(STALE_ATTRIBUTE, "false");
        this.errorElement.textContent = message;
        this.errorElement.hidden = false;
        this.resultActionsElement.hidden = true;
        this.undoElement.hidden = true;
    }

    /** Shows the one-step undo action after Apply. @returns {void} */
    showUndo() {
        this.rootElement.hidden = false;
        this.rootElement.dataset.transformationState = "applied";
        this.previewTextElement.textContent = "";
        this.previewTextElement.hidden = true;
        this.staleElement.hidden = true;
        this.errorElement.textContent = "";
        this.errorElement.hidden = true;
        this.resultActionsElement.hidden = true;
        this.undoElement.hidden = false;
    }

    /** Clears all preview-owned state. @returns {void} */
    clear() {
        this.rootElement.hidden = true;
        this.rootElement.dataset.transformationState = "empty";
        this.rootElement.setAttribute(STALE_ATTRIBUTE, "false");
        this.previewTextElement.textContent = "";
        this.errorElement.textContent = "";
        this.staleElement.textContent = "";
        this.previewTextElement.hidden = true;
        this.errorElement.hidden = true;
        this.staleElement.hidden = true;
        this.resultActionsElement.hidden = true;
        this.undoElement.hidden = true;
    }

    /** @returns {void} */
    render() {
        this.rootElement.replaceChildren();
        this.rootElement.classList.add("transformationPreview");
        this.rootElement.setAttribute("aria-label", TEXT_CONTENT.TRANSFORMATION_PREVIEW_TITLE);
        this.rootElement.setAttribute("aria-live", "polite");

        const headingElement = document.createElement("h2");
        headingElement.className = "transformationPreviewTitle";
        headingElement.textContent = TEXT_CONTENT.TRANSFORMATION_PREVIEW_TITLE;
        this.rootElement.appendChild(headingElement);

        this.staleElement.className = "transformationStaleNotice";
        this.rootElement.appendChild(this.staleElement);

        this.previewTextElement.className = "transformationPreviewText";
        this.previewTextElement.setAttribute(PREVIEW_TEXT_ATTRIBUTE, "");
        this.previewTextElement.setAttribute("aria-label", TEXT_CONTENT.TRANSFORMATION_RESULT_LABEL);
        this.rootElement.appendChild(this.previewTextElement);

        this.errorElement.className = "transformationError";
        this.errorElement.setAttribute(ERROR_ATTRIBUTE, "");
        this.errorElement.setAttribute("role", "alert");
        this.errorElement.setAttribute("aria-label", TEXT_CONTENT.TRANSFORMATION_ERROR_LABEL);
        this.rootElement.appendChild(this.errorElement);

        this.resultActionsElement.className = "transformationPreviewActions";
        this.resultActionsElement.append(
            this.createActionButton(TRANSFORMATION_ACTION_IDENTIFIERS.APPLY, TEXT_CONTENT.TRANSFORMATION_APPLY_LABEL),
            this.createActionButton(TRANSFORMATION_ACTION_IDENTIFIERS.DISCARD, TEXT_CONTENT.TRANSFORMATION_DISCARD_LABEL),
            this.createActionButton(TRANSFORMATION_ACTION_IDENTIFIERS.RETRY, TEXT_CONTENT.TRANSFORMATION_RETRY_LABEL)
        );
        this.rootElement.appendChild(this.resultActionsElement);

        const appliedStatusElement = document.createElement("span");
        appliedStatusElement.textContent = TEXT_CONTENT.TRANSFORMATION_APPLIED;
        this.undoElement.className = "transformationUndo";
        this.undoElement.append(
            appliedStatusElement,
            this.createActionButton(TRANSFORMATION_ACTION_IDENTIFIERS.UNDO, TEXT_CONTENT.TRANSFORMATION_UNDO_LABEL)
        );
        this.rootElement.appendChild(this.undoElement);
    }

    /**
     * @param {string} action Action identifier.
     * @param {string} label User-facing label.
     * @returns {HTMLButtonElement}
     */
    createActionButton(action, label) {
        const buttonElement = document.createElement("button");
        buttonElement.type = "button";
        buttonElement.textContent = label;
        buttonElement.setAttribute(ACTION_ATTRIBUTE, action);
        buttonElement.addEventListener("click", () => {
            const callback = this.actionCallbacks.get(action);
            if (callback) {
                callback();
            }
        });
        this.actionButtons.set(action, buttonElement);
        return buttonElement;
    }
}
