// @ts-check
/**
 * @fileoverview Accessible toolbar for the closed thread-transformation catalog.
 */

import {
    TEXT_CONTENT,
    TRANSFORMATION_OPERATION_CONFIG,
    TRANSFORMATION_OPERATION_IDENTIFIERS
} from "../constants.js";

const OPERATION_ATTRIBUTE = "data-transformation-operation";
const STATUS_ATTRIBUTE = "data-transformation-status";

/**
 * Renders transformation operations and explains their current availability.
 */
export class TransformationToolbar {
    /**
     * @param {HTMLElement} rootElement Toolbar mount point.
     */
    constructor(rootElement) {
        this.rootElement = rootElement;
        /** @type {Map<string, HTMLButtonElement>} */
        this.operationButtons = new Map();
        /** @type {((operation: import('../types.d.js').TransformationOperation) => void) | null} */
        this.operationSelectedCallback = null;
        this.statusElement = document.createElement("p");
        this.render();
        this.setAvailability({
            authenticated: false,
            hasText: false,
            hasImages: false,
            requestActive: false
        });
    }

    /**
     * Registers the product-operation selection handler.
     * @param {(operation: import('../types.d.js').TransformationOperation) => void} callback Selection handler.
     * @returns {void}
     */
    onOperationSelected(callback) {
        this.operationSelectedCallback = callback;
    }

    /**
     * Applies the current authentication, draft, image, and request state.
     * @param {{ authenticated: boolean; hasText: boolean; hasImages: boolean; requestActive: boolean }} availability Current state.
     * @returns {void}
     */
    setAvailability(availability) {
        const controlsEnabled =
            availability.authenticated &&
            availability.hasText &&
            !availability.hasImages &&
            !availability.requestActive;
        this.operationButtons.forEach((buttonElement) => {
            buttonElement.disabled = !controlsEnabled;
            buttonElement.setAttribute("aria-disabled", String(!controlsEnabled));
        });
        this.rootElement.setAttribute("aria-busy", String(availability.requestActive));
        this.statusElement.textContent = availabilityMessage(availability);
    }

    /** @returns {void} */
    render() {
        this.rootElement.replaceChildren();
        this.rootElement.classList.add("transformationToolbar");
        this.rootElement.setAttribute("aria-label", TEXT_CONTENT.TRANSFORMATION_HEADING);

        const fragment = document.createDocumentFragment();
        const headingElement = document.createElement("h2");
        headingElement.className = "transformationToolbarTitle";
        headingElement.textContent = TEXT_CONTENT.TRANSFORMATION_HEADING;
        fragment.appendChild(headingElement);

        const buttonGroupElement = document.createElement("div");
        buttonGroupElement.className = "transformationButtonGroup";
        buttonGroupElement.setAttribute("role", "group");
        buttonGroupElement.setAttribute("aria-label", TEXT_CONTENT.TRANSFORMATION_HEADING);

        Object.values(TRANSFORMATION_OPERATION_IDENTIFIERS).forEach((operationValue) => {
            const operation = /** @type {import('../types.d.js').TransformationOperation} */ (operationValue);
            const operationConfig = TRANSFORMATION_OPERATION_CONFIG[operation];
            const buttonElement = document.createElement("button");
            buttonElement.type = "button";
            buttonElement.className = "transformationButton";
            buttonElement.textContent = operationConfig.label;
            buttonElement.title = operationConfig.description;
            buttonElement.setAttribute(OPERATION_ATTRIBUTE, operation);
            buttonElement.addEventListener("click", () => {
                if (!buttonElement.disabled && this.operationSelectedCallback !== null) {
                    this.operationSelectedCallback(operation);
                }
            });
            this.operationButtons.set(operation, buttonElement);
            buttonGroupElement.appendChild(buttonElement);
        });
        fragment.appendChild(buttonGroupElement);

        this.statusElement.className = "transformationStatus";
        this.statusElement.setAttribute(STATUS_ATTRIBUTE, "");
        this.statusElement.setAttribute("role", "status");
        this.statusElement.setAttribute("aria-live", "polite");
        fragment.appendChild(this.statusElement);

        const privacyElement = document.createElement("p");
        privacyElement.className = "transformationPrivacy";
        privacyElement.textContent = TEXT_CONTENT.TRANSFORMATION_PRIVACY;
        fragment.appendChild(privacyElement);
        this.rootElement.appendChild(fragment);
    }
}

/**
 * @param {{ authenticated: boolean; hasText: boolean; hasImages: boolean; requestActive: boolean }} availability Current state.
 * @returns {string}
 */
function availabilityMessage(availability) {
    if (availability.requestActive) {
        return TEXT_CONTENT.TRANSFORMATION_LOADING;
    }
    if (availability.hasImages) {
        return TEXT_CONTENT.TRANSFORMATION_IMAGES_UNSUPPORTED;
    }
    if (!availability.authenticated) {
        return TEXT_CONTENT.TRANSFORMATION_AUTH_REQUIRED;
    }
    if (!availability.hasText) {
        return TEXT_CONTENT.TRANSFORMATION_EMPTY_REQUIRED;
    }
    return TEXT_CONTENT.TRANSFORMATION_READY;
}
