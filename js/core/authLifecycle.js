// @ts-check
/**
 * @fileoverview Reconciles documented mpr-ui startup snapshots with lifecycle consumers.
 */

import { AUTH_LIFECYCLE_STATUS } from "../constants.js";

const AUTH_PROFILE_KEYS = Object.freeze([
    "user_email",
    "email",
    "user_display_name",
    "display",
    "user_id",
    "user_avatar_url",
    "avatar_url"
]);

/**
 * Reconciles an already-settled mpr-ui lifecycle without reading component internals.
 * Normal authenticated and unauthenticated events remain the primary lifecycle path.
 * @param {Object} input Reconciliation dependencies.
 * @param {unknown} input.namespace Current public MPRUI namespace.
 * @param {string | Element} input.target Explicit mpr-ui auth surface target.
 * @param {() => void} input.handleAuthenticated Documented authenticated handler.
 * @param {() => void} input.handleUnauthenticated Documented unauthenticated handler.
 * @returns {Promise<void>}
 */
export async function reconcileMprUiAuthLifecycle(input) {
    if (!isMprUiSnapshotNamespace(input.namespace)) {
        return;
    }
    try {
        await input.namespace.whenAutoOrchestrationReady();
        const snapshot = await input.namespace.resolveAuthProfileSnapshot(input.target);
        const snapshotStatus = readSnapshotStatus(snapshot);
        if (snapshotStatus === AUTH_LIFECYCLE_STATUS.AUTHENTICATED) {
            input.handleAuthenticated();
        } else if (snapshotStatus === AUTH_LIFECYCLE_STATUS.UNAUTHENTICATED) {
            input.handleUnauthenticated();
        }
    } catch {
        // Document lifecycle events remain authoritative when optional snapshot reconciliation fails.
    }
}

/**
 * @param {unknown} namespace Candidate public MPRUI namespace.
 * @returns {namespace is { whenAutoOrchestrationReady: () => Promise<unknown>; resolveAuthProfileSnapshot: (target: string | Element) => unknown }}
 */
function isMprUiSnapshotNamespace(namespace) {
    return typeof namespace === "object" &&
        namespace !== null &&
        "whenAutoOrchestrationReady" in namespace &&
        typeof namespace.whenAutoOrchestrationReady === "function" &&
        "resolveAuthProfileSnapshot" in namespace &&
        typeof namespace.resolveAuthProfileSnapshot === "function";
}

/**
 * @param {unknown} snapshot Documented mpr-ui auth snapshot.
 * @returns {string}
 */
function readSnapshotStatus(snapshot) {
    if (typeof snapshot !== "object" || snapshot === null) {
        return AUTH_LIFECYCLE_STATUS.UNKNOWN;
    }
    if (
        ("status" in snapshot && snapshot.status === AUTH_LIFECYCLE_STATUS.AUTHENTICATED) ||
        ("authenticated" in snapshot && snapshot.authenticated === true)
    ) {
        return AUTH_LIFECYCLE_STATUS.AUTHENTICATED;
    }
    if (
        ("status" in snapshot && snapshot.status === AUTH_LIFECYCLE_STATUS.UNAUTHENTICATED) ||
        ("authenticated" in snapshot && snapshot.authenticated === false)
    ) {
        return AUTH_LIFECYCLE_STATUS.UNAUTHENTICATED;
    }
    if (
        ("profile" in snapshot && looksLikeProfile(snapshot.profile)) ||
        looksLikeProfile(snapshot)
    ) {
        return AUTH_LIFECYCLE_STATUS.AUTHENTICATED;
    }
    return AUTH_LIFECYCLE_STATUS.UNKNOWN;
}

/**
 * @param {unknown} value Documented profile-shaped snapshot value.
 * @returns {boolean}
 */
function looksLikeProfile(value) {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const profileRecord = /** @type {Record<string, unknown>} */ (value);
    return AUTH_PROFILE_KEYS.some((profileKey) => {
        const profileValue = profileRecord[profileKey];
        return typeof profileValue === "string" && profileValue.trim() !== "";
    });
}
