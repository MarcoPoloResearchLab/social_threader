// @ts-check
/**
 * @fileoverview Reconciles documented mpr-ui startup snapshots with lifecycle consumers.
 */

import { AUTH_LIFECYCLE_STATUS, LOG_MESSAGES } from "../constants.js";
import { loggingAdapter } from "../utils/logging.js";

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
    } catch (error) {
        loggingAdapter.reportError(LOG_MESSAGES.AUTH_SNAPSHOT_FAILURE, error);
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
    if (typeof snapshot !== "object" || snapshot === null || !("status" in snapshot)) {
        return AUTH_LIFECYCLE_STATUS.UNKNOWN;
    }
    if (snapshot.status === AUTH_LIFECYCLE_STATUS.AUTHENTICATED || snapshot.status === AUTH_LIFECYCLE_STATUS.UNAUTHENTICATED) {
        return snapshot.status;
    }
    return AUTH_LIFECYCLE_STATUS.UNKNOWN;
}
