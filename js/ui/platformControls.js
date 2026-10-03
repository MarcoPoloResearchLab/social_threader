// @ts-check
/** @fileoverview Browser platform presentation over the shared chunk-length presets. */

import {
    PLATFORM_CONFIG,
    PLATFORM_INTRODUCTION,
    PLATFORM_INTRODUCTION_END,
    PLATFORM_PRESET_PRESENTATIONS,
    PRESET_CONFIG,
    TEXT_CONTENT
} from "../constants.js";
import { templateHelpers } from "../utils/templates.js";

/**
 * @typedef {Object} PlatformPresetView
 * @property {string} identifier Shared preset identifier for behavior.
 * @property {HTMLButtonElement} buttonElement Platform selection control.
 * @property {HTMLElement} labelElement Visible label mount point.
 * @property {string} label Platform name and preset length.
 */

/**
 * Renders the named platforms as independent homepage links.
 * @param {HTMLElement} rootElement Introduction paragraph.
 * @returns {void}
 */
export function renderPlatformIntroduction(rootElement) {
    const fragment = document.createDocumentFragment();
    PLATFORM_INTRODUCTION.forEach(({ text, platform }) => {
        const definition = PLATFORM_CONFIG[platform];
        const linkElement = createExternalLink(definition.homepage);
        linkElement.textContent = definition.name;
        linkElement.dataset.platform = platform;
        fragment.append(document.createTextNode(text), linkElement);
    });
    fragment.append(document.createTextNode(PLATFORM_INTRODUCTION_END));
    rootElement.replaceChildren(fragment);
}

/**
 * Builds platform rows while retaining one selection state per shared preset.
 * @param {Record<string, HTMLButtonElement>} presetButtons Existing preset controls.
 * @returns {PlatformPresetView[]} Platform views for the form-control lifecycle.
 */
export function createPlatformPresetViews(presetButtons) {
    const presentedPresets = new Set();
    /** @type {HTMLElement | null} */
    let previousRow = null;
    return PLATFORM_PRESET_PRESENTATIONS.map(({ platform, preset }) => {
        const definition = PLATFORM_CONFIG[platform];
        const originalButton = presetButtons[preset];
        const additionalPresentation = presentedPresets.has(preset);
        const buttonElement = additionalPresentation ? document.createElement("button") : originalButton;
        buttonElement.type = "button";
        const rowElement = document.createElement("div");
        rowElement.className = "platformPresetRow";
        rowElement.dataset.platform = platform;
        if (additionalPresentation && previousRow !== null) {
            previousRow.after(rowElement);
        } else {
            originalButton.before(rowElement);
        }
        presentedPresets.add(preset);
        previousRow = rowElement;

        const iconElement = document.createElement("img");
        iconElement.className = "platformPresetIcon";
        iconElement.src = definition.icon;
        iconElement.alt = "";
        iconElement.setAttribute("aria-hidden", "true");
        const labelElement = document.createElement("span");
        buttonElement.replaceChildren(iconElement, labelElement);

        const helpElement = createExternalLink(definition.documentation);
        helpElement.className = "platformPresetHelp";
        helpElement.textContent = TEXT_CONTENT.PLATFORM_HELP_SYMBOL;
        helpElement.title = templateHelpers.interpolate(TEXT_CONTENT.PLATFORM_HELP_LABEL, { platform: definition.name });
        helpElement.setAttribute("aria-label", helpElement.title);
        rowElement.append(buttonElement, helpElement);
        return {
            identifier: preset,
            buttonElement,
            labelElement,
            label: templateHelpers.interpolate(TEXT_CONTENT.PLATFORM_PRESET_LABEL, {
                platform: definition.name,
                length: PRESET_CONFIG[preset].length
            })
        };
    });
}

/**
 * @param {string} href Platform homepage or documentation URL.
 * @returns {HTMLAnchorElement} Independent new-tab navigation control.
 */
function createExternalLink(href) {
    const linkElement = document.createElement("a");
    linkElement.href = href;
    linkElement.target = "_blank";
    linkElement.rel = "noopener noreferrer";
    return linkElement;
}
