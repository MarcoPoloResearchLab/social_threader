// @ts-check
/**
 * @fileoverview Minimal assertion helpers for browser-based tests.
 */

/**
 * Throws when the provided values are not strictly equal.
 * @template T
 * @param {T} actual Actual value encountered.
 * @param {T} expected Expected value for comparison.
 * @param {string} message Description of the assertion.
 * @returns {void}
 */
export function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message} (expected: ${expected}, actual: ${actual})`);
    }
}

/**
 * Throws when the provided values are not deeply equal using JSON serialization.
 * @param {unknown} actual Actual value encountered.
 * @param {unknown} expected Expected value for comparison.
 * @param {string} message Description of the assertion.
 * @returns {void}
 */
export function assertDeepEqual(actual, expected, message) {
    const actualString = JSON.stringify(actual);
    const expectedString = JSON.stringify(expected);
    if (actualString !== expectedString) {
        throw new Error(`${message} (expected: ${expectedString}, actual: ${actualString})`);
    }
}

/**
 * Throws when the provided function does not raise an error.
 * @param {() => void} fn Function expected to throw.
 * @param {string} message Description of the assertion.
 * @returns {void}
 */
export function assertThrows(fn, message) {
    let threw = false;
    try {
        fn();
    } catch (error) {
        threw = true;
    }
    if (!threw) {
        throw new Error(`${message} (expected an exception)`);
    }
}
