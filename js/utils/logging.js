// @ts-check
/**
 * @fileoverview Provides a thin wrapper around console logging to centralize diagnostics.
 */

import { LOG_MESSAGES } from "../constants.js";

/**
 * Logging adapter that scopes console output and ensures consistent formatting.
 */
class LoggingAdapter {
    /**
     * @param {string} prefix Namespace label used to prepend log statements.
     */
    constructor(prefix) {
        this.prefix = prefix;
    }

    /**
     * Reports unexpected errors.
     * @param {string} message Descriptive message sourced from constants.
     * @param {unknown} error Underlying error instance or value.
     * @returns {void}
     */
    reportError(message, error) {
        // eslint-disable-next-line no-console
        console.error(`${this.prefix} ${message}`, error);
    }
}

export const loggingAdapter = new LoggingAdapter("[SocialThreader]");

/**
 * Exposes pre-baked helpers for the different error situations the UI handles.
 */
export const loggingHelpers = Object.freeze({
    /**
     * Logs copy-to-clipboard failures.
     * @param {unknown} error Underlying error instance or value.
     * @returns {void}
     */
    reportCopyFailure(error) {
        loggingAdapter.reportError(LOG_MESSAGES.COPY_FAILURE, error);
    }
});
