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
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const OPERATION_ICON_PATHS = Object.freeze({
    [TRANSFORMATION_OPERATION_IDENTIFIERS.POLISH]: "M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z",
    [TRANSFORMATION_OPERATION_IDENTIFIERS.EXPAND]: "M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7",
    [TRANSFORMATION_OPERATION_IDENTIFIERS.PUNCH_UP]: "m13 2-9 12h7l-1 8 10-12h-7Z"
});

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
        this.rootElement.hidden = !availability.hasText;
        const controlsEnabled =
            availability.hasText &&
            !availability.hasImages &&
            !availability.requestActive;
        this.operationButtons.forEach((buttonElement) => {
            buttonElement.disabled = !controlsEnabled;
            buttonElement.setAttribute("aria-disabled", String(!controlsEnabled));
        });
        this.rootElement.setAttribute("aria-busy", String(availability.requestActive));
        this.statusElement.textContent = availabilityMessage(availability);
        this.statusElement.hidden = this.statusElement.textContent.length === 0;
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
            const labelElement = document.createElement("span");
            labelElement.textContent = operationConfig.label;
            buttonElement.append(createOperationIcon(operation), labelElement);
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

        this.rootElement.appendChild(fragment);
    }
}

/**
 * @param {import('../types.d.js').TransformationOperation} operation Button operation.
 * @returns {SVGSVGElement} Decorative icon with the button's current color.
 */
function createOperationIcon(operation) {
    const iconElement = document.createElementNS(SVG_NAMESPACE, "svg");
    iconElement.classList.add("transformationButtonIcon");
    iconElement.setAttribute("viewBox", "0 0 24 24");
    iconElement.setAttribute("aria-hidden", "true");
    iconElement.setAttribute("focusable", "false");
    iconElement.setAttribute("fill", "none");
    iconElement.setAttribute("stroke", "currentColor");
    iconElement.setAttribute("stroke-width", "1.8");
    iconElement.setAttribute("stroke-linecap", "round");
    iconElement.setAttribute("stroke-linejoin", "round");
    const pathElement = document.createElementNS(SVG_NAMESPACE, "path");
    pathElement.setAttribute("d", OPERATION_ICON_PATHS[operation]);
    iconElement.appendChild(pathElement);
    return iconElement;
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
    if (!availability.hasText) {
        return TEXT_CONTENT.TRANSFORMATION_EMPTY_REQUIRED;
    }
    return "";
}
