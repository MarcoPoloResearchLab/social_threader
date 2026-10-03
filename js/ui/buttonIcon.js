// @ts-check
/** @fileoverview Shared decorative SVG renderer for transformation buttons. */

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/**
 * Creates a decorative icon that uses the button's current color.
 * @param {string} path SVG path for the selected button action.
 * @returns {SVGSVGElement} Icon excluded from the button's accessible name.
 */
export function createButtonIcon(path) {
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
    pathElement.setAttribute("d", path);
    iconElement.appendChild(pathElement);
    return iconElement;
}
