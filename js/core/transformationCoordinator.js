// @ts-check
/**
 * @fileoverview Coordinates auth-gated transformation requests and editor revisions.
 */

import {
    API_ERROR_CODES,
    AUTH_EVENT_NAMES,
    TRANSFORMATION_ERROR_MESSAGES
} from "../constants.js";
import { GatewayError } from "./gateway.js";

/**
 * Owns the browser transformation workflow without owning authentication or transport details.
 */
export class TransformationCoordinator {
    /**
     * @param {Object} input Coordinator dependencies.
     * @param {import('../ui/inputPanel.js').InputPanel} input.inputPanel Public editor boundary.
     * @param {import('../ui/transformationToolbar.js').TransformationToolbar} input.toolbar Toolbar view.
     * @param {import('../ui/transformationPreview.js').TransformationPreview} input.preview Preview view.
     * @param {{ transform: (request: import('../types.d.js').TransformationGatewayRequest) => Promise<import('../types.d.js').TransformationResponse> }} input.gateway Application API gateway.
     * @param {EventTarget} input.lifecycleTarget Target that emits documented mpr-ui auth events.
     * @param {() => string} [input.requestIdFactory] Non-secret request identifier factory.
     */
    constructor({ inputPanel, toolbar, preview, gateway, lifecycleTarget, requestIdFactory = createRequestID }) {
        this.inputPanel = inputPanel;
        this.toolbar = toolbar;
        this.preview = preview;
        this.gateway = gateway;
        this.lifecycleTarget = lifecycleTarget;
        this.requestIdFactory = requestIdFactory;

        this.authLifecycleHasAuthenticated = false;
        this.editorRevision = 0;
        this.currentDocument = this.inputPanel.getDocumentSnapshot();
        /** @type {{ controller: AbortController; revision: number; operation: import('../types.d.js').TransformationOperation } | null} */
        this.activeRequest = null;
        /** @type {{ response: import('../types.d.js').TransformationResponse; revision: number; operation: import('../types.d.js').TransformationOperation } | null} */
        this.visibleResult = null;
        /** @type {string | null} */
        this.undoText = null;
        this.initialized = false;
    }

    /** Registers editor, toolbar, preview, and documented auth lifecycle handlers. @returns {void} */
    initialize() {
        if (this.initialized) {
            return;
        }
        this.initialized = true;
        this.inputPanel.onInput((documentSnapshot) => {
            this.handleEditorInput(documentSnapshot);
        });
        this.toolbar.onOperationSelected((operation) => {
            this.handleOperationSelected(operation);
        });
        this.preview.onApply(() => this.handleApply());
        this.preview.onDiscard(() => this.handleDiscard());
        this.preview.onRetry(() => this.handleRetry());
        this.preview.onUndo(() => this.handleUndo());
        this.lifecycleTarget.addEventListener(AUTH_EVENT_NAMES.AUTHENTICATED, () => {
            this.handleAuthenticatedLifecycle();
        });
        this.lifecycleTarget.addEventListener(AUTH_EVENT_NAMES.UNAUTHENTICATED, () => {
            this.handleUnauthenticatedLifecycle();
        });
        this.updateToolbarAvailability();
    }

    /**
     * Adopts a new public editor snapshot and increments its monotonic revision.
     * @param {import('../types.d.js').RichTextDocument} documentSnapshot Current editor snapshot.
     * @returns {void}
     */
    handleEditorInput(documentSnapshot) {
        this.editorRevision += 1;
        this.currentDocument = documentSnapshot;
        if (this.undoText !== null) {
            this.undoText = null;
            this.preview.clear();
        }
        if (this.visibleResult !== null) {
            this.preview.setStale(this.visibleResult.revision !== this.editorRevision);
            this.preview.setTextActionsEnabled(documentSnapshot.images.length === 0);
        }
        this.updateToolbarAvailability();
    }

    /** Records the documented authenticated lifecycle for protected-control availability. @returns {void} */
    handleAuthenticatedLifecycle() {
        this.authLifecycleHasAuthenticated = true;
        this.updateToolbarAvailability();
    }

    /** Cancels protected work and clears AI state after the documented unauthenticated lifecycle. @returns {void} */
    handleUnauthenticatedLifecycle() {
        this.authLifecycleHasAuthenticated = false;
        if (this.activeRequest !== null) {
            this.activeRequest.controller.abort();
            this.activeRequest = null;
        }
        this.visibleResult = null;
        this.undoText = null;
        this.preview.clear();
        this.updateToolbarAvailability();
    }

    /**
     * Starts exactly one user-requested transformation when every product gate is open.
     * @param {import('../types.d.js').TransformationOperation} operation Selected operation.
     * @returns {void}
     */
    handleOperationSelected(operation) {
        if (!this.canStartTransformation()) {
            return;
        }
        void this.startTransformation(operation);
    }

    /**
     * @param {import('../types.d.js').TransformationOperation} operation Selected operation.
     * @returns {Promise<void>}
     */
    async startTransformation(operation) {
        const requestController = new AbortController();
        const sourceRevision = this.editorRevision;
        const sourceText = this.currentDocument.plainText;
        const activeRequest = {
            controller: requestController,
            revision: sourceRevision,
            operation
        };
        this.activeRequest = activeRequest;
        this.visibleResult = null;
        this.preview.clear();
        this.updateToolbarAvailability();

        try {
            const response = await this.gateway.transform({
                operation,
                text: sourceText,
                requestId: this.requestIdFactory(),
                signal: requestController.signal
            });
            if (this.activeRequest !== activeRequest || requestController.signal.aborted) {
                return;
            }
            this.visibleResult = {
                response,
                revision: sourceRevision,
                operation
            };
            const resultIsStale = sourceRevision !== this.editorRevision;
            this.preview.showResult(response, resultIsStale);
            this.preview.setTextActionsEnabled(this.currentDocument.images.length === 0);
        } catch (error) {
            if (this.activeRequest !== activeRequest || isAbortError(error)) {
                return;
            }
            this.preview.showError(resolveGatewayMessage(error));
        } finally {
            if (this.activeRequest === activeRequest) {
                this.activeRequest = null;
                this.updateToolbarAvailability();
            }
        }
    }

    /** Replaces the current text only after explicit Apply. @returns {void} */
    handleApply() {
        if (this.visibleResult === null || this.currentDocument.images.length > 0) {
            return;
        }
        const replacementText = this.visibleResult.response.text;
        const replacedSourceText = this.currentDocument.plainText;
        this.undoText = null;
        this.visibleResult = null;
        this.inputPanel.replacePlainText(replacementText);
        this.undoText = replacedSourceText;
        this.preview.showUndo();
    }

    /** Clears the suggestion without changing the source. @returns {void} */
    handleDiscard() {
        this.visibleResult = null;
        this.preview.clear();
    }

    /** Starts one new paid request only after an explicit Try again action. @returns {void} */
    handleRetry() {
        if (this.visibleResult === null) {
            return;
        }
        const retryOperation = this.visibleResult.operation;
        this.visibleResult = null;
        this.preview.clear();
        this.handleOperationSelected(retryOperation);
    }

    /** Restores the one source value replaced by the latest Apply. @returns {void} */
    handleUndo() {
        if (this.undoText === null) {
            return;
        }
        const sourceText = this.undoText;
        this.undoText = null;
        this.inputPanel.replacePlainText(sourceText);
        this.preview.clear();
    }

    /** @returns {boolean} */
    canStartTransformation() {
        return (
            this.authLifecycleHasAuthenticated &&
            this.activeRequest === null &&
            this.currentDocument.plainText.trim().length > 0 &&
            this.currentDocument.images.length === 0
        );
    }

    /** Applies the current product gates to every toolbar operation. @returns {void} */
    updateToolbarAvailability() {
        this.toolbar.setAvailability({
            authenticated: this.authLifecycleHasAuthenticated,
            hasText: this.currentDocument.plainText.trim().length > 0,
            hasImages: this.currentDocument.images.length > 0,
            requestActive: this.activeRequest !== null
        });
    }
}

/** @returns {string} */
function createRequestID() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
    }
    const timestamp = Date.now().toString(36);
    const randomSegment = Math.random().toString(36).slice(2);
    return `thread-${timestamp}-${randomSegment}`;
}

/**
 * @param {unknown} error Gateway boundary error.
 * @returns {string}
 */
function resolveGatewayMessage(error) {
    if (error instanceof GatewayError) {
        return TRANSFORMATION_ERROR_MESSAGES[error.code] ??
            TRANSFORMATION_ERROR_MESSAGES[API_ERROR_CODES.UPSTREAM_FAILURE];
    }
    return TRANSFORMATION_ERROR_MESSAGES[API_ERROR_CODES.NETWORK_FAILURE];
}

/**
 * @param {unknown} error Async request error.
 * @returns {boolean}
 */
function isAbortError(error) {
    return error instanceof Error && error.name === "AbortError";
}
