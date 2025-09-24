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

export const templateHelpers = Object.freeze({
    interpolate
});
