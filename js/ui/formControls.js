// @ts-check
/**
 * @fileoverview View model for preset buttons, custom input, and toggle controls.
 */

import {
    TEXT_CONTENT,
    TOGGLE_LABELS,
    PRESET_IDENTIFIERS,
    PRESET_CONFIG,
    DEFAULT_LENGTHS,
    ATTRIBUTE_NAMES,
    CLASS_NAMES
} from "../constants.js";

/**
 * @typedef {Object} PresetToggleDetails
 * @property {string} identifier Identifier associated with the preset button that was toggled.
 * @property {boolean} isActive Indicates whether the preset is now active.
 * @property {number | null} length Character length represented by the preset when active.
 */

/**
 * Handles form control interactions and exposes semantic events for the controller.
 */
export class FormControls {
    /**
     * @param {Record<string, HTMLButtonElement>} presetButtons Mapping of preset identifiers to button elements.
     * @param {HTMLButtonElement} customButtonElement Button for triggering custom chunk lengths.
     * @param {HTMLInputElement} customInputElement Numeric input specifying the custom length.
     * @param {Record<string, HTMLInputElement>} toggleInputs Mapping of toggle identifiers to checkbox inputs.
     * @param {Record<string, HTMLLabelElement>} toggleLabels Mapping of toggle identifiers to label elements.
     */
    constructor(presetButtons, customButtonElement, customInputElement, toggleInputs, toggleLabels) {
        this.presetButtons = presetButtons;
        this.customButtonElement = customButtonElement;
        this.customInputElement = customInputElement;
        this.toggleInputs = toggleInputs;
        this.toggleLabels = toggleLabels;
        /** @type {string | null} */
        this.activePresetIdentifier = null;
    }

    /**
     * Applies default copy, placeholder text, and preset labels.
     * @returns {void}
     */
    initializeCopy() {
        Object.keys(this.presetButtons).forEach((identifier) => {
            const presetDefinition = PRESET_CONFIG[identifier];
            if (presetDefinition) {
                this.presetButtons[identifier].textContent = presetDefinition.label;
            }
        });
        this.customButtonElement.textContent = TEXT_CONTENT.CUSTOM_BUTTON_DEFAULT;
        this.customInputElement.value = String(DEFAULT_LENGTHS.CUSTOM);
        this.customInputElement.placeholder = TEXT_CONTENT.CUSTOM_INPUT_PLACEHOLDER;
        Object.keys(this.toggleLabels).forEach((identifier) => {
            const labelText = TOGGLE_LABELS[identifier];
            if (labelText) {
                this.toggleLabels[identifier].textContent = labelText;
            }
        });
    }

    /**
     * Attaches handlers for preset button toggling.
     * @param {(details: PresetToggleDetails) => void} callback Callback receiving selection change details.
     * @returns {void}
     */
    onPresetToggled(callback) {
        Object.keys(this.presetButtons).forEach((identifier) => {
            const buttonElement = this.presetButtons[identifier];
            buttonElement.addEventListener("click", () => {
                if (this.activePresetIdentifier === identifier) {
                    callback({ identifier, isActive: false, length: null });
                    return;
                }

                const presetDefinition = PRESET_CONFIG[identifier];
                if (!presetDefinition) {
                    return;
                }

                callback({
                    identifier,
                    isActive: true,
                    length: presetDefinition.length
                });
            });
        });
    }

    /**
     * Ensures that the appropriate preset button is marked as active.
     * @param {string | null} identifier Preset identifier that should appear selected. Null clears all.
     * @returns {void}
     */
    setActivePreset(identifier) {
        this.activePresetIdentifier = identifier;
        Object.keys(this.presetButtons).forEach((presetIdentifier) => {
            const buttonElement = this.presetButtons[presetIdentifier];
            if (identifier !== null && presetIdentifier === identifier) {
                buttonElement.classList.add(CLASS_NAMES.ACTIVE);
            } else {
                buttonElement.classList.remove(CLASS_NAMES.ACTIVE);
            }
        });
        this.customButtonElement.classList.remove(CLASS_NAMES.ACTIVE);
    }

    /**
     * Marks the custom button as the active selection.
     * @returns {void}
     */
    setCustomActive() {
        Object.values(this.presetButtons).forEach((buttonElement) => {
            buttonElement.classList.remove(CLASS_NAMES.ACTIVE);
        });
        this.activePresetIdentifier = null;
        this.customButtonElement.classList.add(CLASS_NAMES.ACTIVE);
    }

    /**
     * Indicates whether the custom button is currently active.
     * @returns {boolean}
     */
    isCustomActive() {
        return this.customButtonElement.classList.contains(CLASS_NAMES.ACTIVE);
    }

    /**
     * Clears any preset selection and removes active styling.
     * @returns {void}
     */
    clearPresetSelection() {
        this.setActivePreset(null);
    }

    /**
     * Updates the custom button label.
     * @param {string} labelText Label text to display.
     * @returns {void}
     */
    setCustomButtonLabel(labelText) {
        this.customButtonElement.textContent = labelText;
    }

    /**
     * Registers a handler for the custom button click.
     * @param {(lengthValue: number | null) => void} callback Callback invoked with the parsed custom length.
     * @returns {void}
     */
    onCustomButtonClick(callback) {
        this.customButtonElement.addEventListener("click", () => {
            const parsedValue = this.parseCustomValue();
            callback(parsedValue);
        });
    }

    /**
     * Registers a handler for changes to the custom length input field.
     * @param {(rawValue: string) => void} callback Callback invoked when the input value changes.
     * @returns {void}
     */
    onCustomLengthInput(callback) {
        this.customInputElement.addEventListener("input", () => {
            callback(this.customInputElement.value);
        });
    }

    /**
     * Registers toggle change listeners.
     * @param {(identifier: string, checked: boolean) => void} callback Callback receiving the toggle identifier and checked state.
     * @returns {void}
     */
    onToggleChange(callback) {
        Object.keys(this.toggleInputs).forEach((identifier) => {
            const toggleElement = this.toggleInputs[identifier];
            toggleElement.addEventListener("change", () => {
                callback(identifier, toggleElement.checked);
            });
        });
    }

    /**
     * Updates the checked state of a toggle.
     * @param {string} identifier Toggle identifier.
     * @param {boolean} checked Whether the toggle should be checked.
     * @returns {void}
     */
    setToggleState(identifier, checked) {
        if (this.toggleInputs[identifier]) {
            this.toggleInputs[identifier].checked = checked;
        }
    }

    /**
     * Enables or disables a toggle based on the current editor statistics.
     * @param {string} identifier Toggle identifier to update.
     * @param {boolean} isEnabled Whether the toggle should be interactive.
     * @returns {void}
     */
    setToggleAvailability(identifier, isEnabled) {
        const toggleElement = this.toggleInputs[identifier];
        if (!toggleElement) {
            return;
        }

        toggleElement.disabled = !isEnabled;
        if (!isEnabled) {
            toggleElement.checked = false;
        }

        const associatedLabel = this.toggleLabels[identifier];
        if (associatedLabel) {
            if (isEnabled) {
                associatedLabel.removeAttribute(ATTRIBUTE_NAMES.ARIA_DISABLED);
                associatedLabel.classList.remove(CLASS_NAMES.DISABLED);
            } else {
                associatedLabel.setAttribute(ATTRIBUTE_NAMES.ARIA_DISABLED, String(true));
                associatedLabel.classList.add(CLASS_NAMES.DISABLED);
            }
        }
    }

    /**
     * Parses the custom length input field.
     * @returns {number | null} Parsed numeric value or null when invalid.
     */
    parseCustomValue() {
        const parsedValue = Number.parseInt(this.customInputElement.value, 10);
        if (Number.isNaN(parsedValue) || parsedValue <= 0) {
            return null;
        }
        return parsedValue;
    }
}

