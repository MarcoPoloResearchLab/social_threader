// @ts-check
/**
 * @fileoverview Utility helpers for performing lightweight string interpolation.
 */

/**
 * Replaces placeholders in the form of `{key}` with provided values.
 * @param {string} templateString Template string containing tokens.
 * @param {Record<string, string | number>} replacements Values used to replace placeholders.
 * @returns {string} Interpolated string with placeholders substituted.
 */
function interpolate(templateString, replacements) {
    return Object.keys(replacements).reduce((accumulated, key) => {
        const token = `{${key}}`;
        return accumulated.split(token).join(String(replacements[key]));
    }, templateString);
}

/**
 * Escapes HTML-special characters to prevent markup injection.
 * @param {string} untrustedString Raw string that may contain HTML characters.
 * @returns {string} Sanitized string safe for HTML insertion.
 */
function escapeHtml(untrustedString) {
    return untrustedString
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export const templateHelpers = Object.freeze({
    interpolate,
    escapeHtml
});
