// @ts-check
/** @fileoverview Dialog presentation around the shared, header-owned login control. */

import { TEXT_CONTENT, TRANSFORMATION_OPERATION_CONFIG } from "../constants.js";

/** Presents login for a selected AI action without handling authentication. */
export class TransformationLoginDialog {
    /**
     * @param {HTMLDialogElement} dialogElement Native dialog.
     * @param {HTMLElement} titleElement Dialog title.
     * @param {HTMLButtonElement} closeButton Cancel control.
     */
    constructor(dialogElement, titleElement, closeButton) {
        this.dialogElement = dialogElement;
        this.titleElement = titleElement;
        /** @type {(() => void) | null} */
        this.dismissCallback = null;
        closeButton.textContent = TEXT_CONTENT.TRANSFORMATION_LOGIN_CANCEL;
        closeButton.addEventListener("click", () => this.handleDismiss());
        dialogElement.addEventListener("cancel", (event) => {
            event.preventDefault();
            this.handleDismiss();
        });
    }

    /** @param {() => void} callback User dismissal handler. @returns {void} */
    onDismiss(callback) {
        this.dismissCallback = callback;
    }

    /** @param {import('../types.d.js').TransformationOperation} operation Selected action. @returns {void} */
    open(operation) {
        this.titleElement.textContent = TEXT_CONTENT.TRANSFORMATION_LOGIN_TITLE.replace(
            "{operation}", TRANSFORMATION_OPERATION_CONFIG[operation].label
        );
        if (!this.dialogElement.open) this.dialogElement.showModal();
    }

    /** Closes the presentation after authentication or draft changes. @returns {void} */
    close() {
        if (this.dialogElement.open) this.dialogElement.close();
    }

    /** Cancels the selected action before closing the dialog. @returns {void} */
    handleDismiss() {
        if (this.dismissCallback !== null) this.dismissCallback();
        this.close();
    }
}
