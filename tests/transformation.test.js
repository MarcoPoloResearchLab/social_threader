// @ts-check
/**
 * @fileoverview Public browser contract tests for authenticated thread transformations.
 */

import { InputPanel } from "../js/ui/inputPanel.js";
import { TransformationToolbar } from "../js/ui/transformationToolbar.js";
import { TransformationPreview } from "../js/ui/transformationPreview.js";
import { TransformationCoordinator } from "../js/core/transformationCoordinator.js";
import { GatewayError } from "../js/core/gateway.js";
import {
    AUTH_EVENT_NAMES,
    TEXT_CONTENT,
    TRANSFORMATION_OPERATION_IDENTIFIERS,
    TRANSFORMATION_ERROR_MESSAGES
} from "../js/constants.js";
import { assertDeepEqual, assertEqual } from "./assert.js";

export const SOURCE_TEXT = "A useful original thread.";
const REVISED_TEXT = "A stronger revised thread.";
const IMAGE_DATA_URL = "data:image/png;base64,AAECAwQFBgcICQ==";
const ASYNC_SETTLEMENT_DELAY_MS = 0;

class DeferredGateway {
    constructor() {
        /** @type {Array<{ operation: string; text: string; requestId: string; signal: AbortSignal }>} */
        this.requests = [];
        /** @type {Array<{ resolve: (value: import('../js/types.d.js').TransformationResponse) => void; reject: (reason?: unknown) => void }>} */
        this.pending = [];
    }

    /**
     * @param {{ operation: string; text: string; requestId: string; signal: AbortSignal }} request
     * @returns {Promise<import('../js/types.d.js').TransformationResponse>}
     */
    transform(request) {
        this.requests.push(request);
        return new Promise((resolve, reject) => {
            const handleAbort = () => {
                const cancellationError = new Error("request canceled");
                cancellationError.name = "AbortError";
                reject(cancellationError);
            };
            request.signal.addEventListener("abort", handleAbort, { once: true });
            this.pending.push({ resolve, reject });
        });
    }

    /**
     * @param {number} index
     * @param {string} text
     * @returns {void}
     */
    resolve(index, text = REVISED_TEXT) {
        const request = this.requests[index];
        this.pending[index].resolve({
            operation: request.operation,
            text,
            request_id: request.requestId,
            template_version: `${request.operation}.v1`
        });
    }

    /**
     * @param {number} index
     * @param {string} code
     * @param {number} status
     * @returns {void}
     */
    reject(index, code, status) {
        this.pending[index].reject(new GatewayError(code, status));
    }
}

/**
 * @returns {{
 *   inputPanel: InputPanel;
 *   editorElement: HTMLDivElement;
 *   toolbarElement: HTMLElement;
 *   previewElement: HTMLElement;
 *   toolbar: TransformationToolbar;
 *   preview: TransformationPreview;
 *   gateway: DeferredGateway;
 *   coordinator: TransformationCoordinator;
 * }}
 */
export function createCoordinatorFixture() {
    document.body.innerHTML = "";
    const toolbarElement = document.createElement("section");
    const editorElement = document.createElement("div");
    const statisticsElement = document.createElement("div");
    const errorElement = document.createElement("div");
    const previewElement = document.createElement("section");
    editorElement.contentEditable = "true";
    document.body.append(toolbarElement, editorElement, statisticsElement, errorElement, previewElement);

    const inputPanel = new InputPanel(editorElement, statisticsElement, errorElement);
    inputPanel.initializeCopy();
    const toolbar = new TransformationToolbar(toolbarElement);
    const preview = new TransformationPreview(previewElement);
    const gateway = new DeferredGateway();
    let requestSequence = 0;
    const coordinator = new TransformationCoordinator({
        inputPanel,
        toolbar,
        preview,
        gateway,
        lifecycleTarget: document,
        requestIdFactory() {
            requestSequence += 1;
            return `browser-request-${requestSequence.toString().padStart(4, "0")}`;
        }
    });
    coordinator.initialize();
    return {
        inputPanel,
        editorElement,
        toolbarElement,
        previewElement,
        toolbar,
        preview,
        gateway,
        coordinator
    };
}

/**
 * @param {HTMLDivElement} editorElement
 * @param {string} text
 * @returns {void}
 */
export function enterText(editorElement, text) {
    editorElement.textContent = text;
    editorElement.dispatchEvent(new Event("input", { bubbles: true }));
}

/** @returns {void} */
function reportAuthenticated() {
    document.dispatchEvent(new CustomEvent(AUTH_EVENT_NAMES.AUTHENTICATED));
}

/** @returns {void} */
function reportUnauthenticated() {
    document.dispatchEvent(new CustomEvent(AUTH_EVENT_NAMES.UNAUTHENTICATED));
}

/**
 * @param {HTMLElement} toolbarElement
 * @param {string} operation
 * @returns {HTMLButtonElement}
 */
export function getOperationButton(toolbarElement, operation) {
    const buttonElement = toolbarElement.querySelector(`[data-transformation-operation="${operation}"]`);
    if (!(buttonElement instanceof HTMLButtonElement)) {
        throw new Error(`Missing transformation button: ${operation}`);
    }
    return buttonElement;
}

/**
 * @param {HTMLElement} previewElement
 * @param {string} action
 * @returns {HTMLButtonElement}
 */
function getPreviewButton(previewElement, action) {
    const buttonElement = previewElement.querySelector(`[data-transformation-action="${action}"]`);
    if (!(buttonElement instanceof HTMLButtonElement)) {
        throw new Error(`Missing preview button: ${action}`);
    }
    return buttonElement;
}

/** @returns {Promise<void>} */
function settleAsyncWork() {
    return new Promise((resolve) => window.setTimeout(resolve, ASYNC_SETTLEMENT_DELAY_MS));
}

/**
 * @param {(name: string, fn: () => (void | Promise<void>)) => Promise<void>} runTest
 * @returns {Promise<void>}
 */
export async function runTransformationTests(runTest) {
    await runTest("coordinator waits for auth, submits once, previews as text, applies, and undoes", async () => {
        const fixture = createCoordinatorFixture();
        enterText(fixture.editorElement, SOURCE_TEXT);
        getOperationButton(fixture.toolbarElement, "polish").click();
        assertEqual(fixture.gateway.requests.length, 0, "No protected request should occur before authentication");

        reportAuthenticated();
        getOperationButton(fixture.toolbarElement, "polish").click();
        getOperationButton(fixture.toolbarElement, "polish").click();
        assertEqual(fixture.gateway.requests.length, 1, "Duplicate clicks should not create paid requests");
        assertEqual(getOperationButton(fixture.toolbarElement, "expand").disabled, true, "All operations should disable while active");

        fixture.gateway.resolve(0, "Safe <img src=x onerror=alert(1)> text");
        await settleAsyncWork();
        const previewTextElement = fixture.previewElement.querySelector("[data-transformation-preview-text]");
        assertEqual(previewTextElement?.textContent, "Safe <img src=x onerror=alert(1)> text", "Preview should render model output as text");
        assertEqual(fixture.previewElement.querySelector("img"), null, "Preview should not create model-provided markup");
        assertEqual(fixture.inputPanel.getDocumentSnapshot().plainText, SOURCE_TEXT, "Preview should not overwrite the source");

        let inputEventCount = 0;
        fixture.inputPanel.onInput(() => {
            inputEventCount += 1;
        });
        getPreviewButton(fixture.previewElement, "apply").click();
        assertEqual(fixture.inputPanel.getDocumentSnapshot().plainText, "Safe <img src=x onerror=alert(1)> text", "Apply should use the public input operation");
        assertEqual(inputEventCount, 1, "Apply should dispatch the normal input lifecycle once");
        getPreviewButton(fixture.previewElement, "undo").click();
        assertEqual(fixture.inputPanel.getDocumentSnapshot().plainText, SOURCE_TEXT, "Undo should restore the replaced source");
        assertEqual(inputEventCount, 2, "Undo should dispatch the input lifecycle once");
    });

    await runTest("coordinator marks concurrent edits stale and requires explicit apply", async () => {
        const fixture = createCoordinatorFixture();
        enterText(fixture.editorElement, SOURCE_TEXT);
        reportAuthenticated();
        getOperationButton(fixture.toolbarElement, "expand").click();
        enterText(fixture.editorElement, "A newer draft typed during the request.");
        fixture.gateway.resolve(0, REVISED_TEXT);
        await settleAsyncWork();

        assertEqual(fixture.inputPanel.getDocumentSnapshot().plainText, "A newer draft typed during the request.", "Stale result should not replace newer text");
        assertEqual(fixture.previewElement.getAttribute("data-transformation-stale"), "true", "Preview should identify a stale source revision");
        getPreviewButton(fixture.previewElement, "apply").click();
        assertEqual(fixture.inputPanel.getDocumentSnapshot().plainText, REVISED_TEXT, "Explicit Apply should accept a stale result");
        getPreviewButton(fixture.previewElement, "undo").click();
        assertEqual(fixture.inputPanel.getDocumentSnapshot().plainText, "A newer draft typed during the request.", "Undo should restore the text replaced by stale Apply");
    });

    await runTest("a later manual edit expires one-step undo without replacing newer work", async () => {
        const fixture = createCoordinatorFixture();
        enterText(fixture.editorElement, SOURCE_TEXT);
        reportAuthenticated();
        getOperationButton(fixture.toolbarElement, "polish").click();
        fixture.gateway.resolve(0);
        await settleAsyncWork();
        getPreviewButton(fixture.previewElement, "apply").click();

        enterText(fixture.editorElement, "A manual edit after Apply.");
        assertEqual(fixture.previewElement.hidden, true, "A later edit should expire the one-step Undo surface");
        getPreviewButton(fixture.previewElement, "undo").click();
        assertEqual(
            fixture.inputPanel.getDocumentSnapshot().plainText,
            "A manual edit after Apply.",
            "Expired Undo should not replace a newer manual edit"
        );
    });

    await runTest("coordinator supports discard, explicit try again, and stable API errors", async () => {
        const fixture = createCoordinatorFixture();
        enterText(fixture.editorElement, SOURCE_TEXT);
        reportAuthenticated();
        getOperationButton(fixture.toolbarElement, "punch_up").click();
        fixture.gateway.resolve(0);
        await settleAsyncWork();
        getPreviewButton(fixture.previewElement, "discard").click();
        assertEqual(fixture.previewElement.hidden, true, "Discard should clear the preview");
        assertEqual(fixture.inputPanel.getDocumentSnapshot().plainText, SOURCE_TEXT, "Discard should preserve the source");

        getOperationButton(fixture.toolbarElement, "punch_up").click();
        fixture.gateway.resolve(1);
        await settleAsyncWork();
        getPreviewButton(fixture.previewElement, "retry").click();
        assertEqual(fixture.gateway.requests.length, 3, "Try again should create one explicit new request");
        assertEqual(fixture.gateway.requests[2].operation, "punch_up", "Try again should retain the selected operation");
        assertEqual(fixture.gateway.requests[2].requestId === fixture.gateway.requests[1].requestId, false, "Try again should use a new idempotency key");
        fixture.gateway.reject(2, "rate_limited", 429);
        await settleAsyncWork();
        assertEqual(
            fixture.previewElement.querySelector("[data-transformation-error]")?.textContent,
            TRANSFORMATION_ERROR_MESSAGES.rate_limited,
            "Stable API code should map to browser-owned copy"
        );
    });

    await runTest("coordinator renders browser-owned validation, rate, and upstream error copy", async () => {
        const errorCases = [
            { code: "input_too_large", status: 413 },
            { code: "rate_limited", status: 429 },
            { code: "upstream_failure", status: 502 }
        ];

        for (const errorCase of errorCases) {
            const fixture = createCoordinatorFixture();
            enterText(fixture.editorElement, SOURCE_TEXT);
            reportAuthenticated();
            getOperationButton(fixture.toolbarElement, "polish").click();
            fixture.gateway.reject(0, errorCase.code, errorCase.status);
            await settleAsyncWork();
            assertEqual(
                fixture.previewElement.querySelector("[data-transformation-error]")?.textContent,
                TRANSFORMATION_ERROR_MESSAGES[errorCase.code],
                `${errorCase.code} should use browser-owned copy`
            );
        }
    });

    await runTest("API 401 remains an application error and does not replace authenticated lifecycle state", async () => {
        const fixture = createCoordinatorFixture();
        enterText(fixture.editorElement, SOURCE_TEXT);
        reportAuthenticated();
        getOperationButton(fixture.toolbarElement, "polish").click();
        fixture.gateway.reject(0, "authentication_required", 401);
        await settleAsyncWork();

        assertEqual(
            fixture.previewElement.querySelector("[data-transformation-error]")?.textContent,
            TRANSFORMATION_ERROR_MESSAGES.authentication_required,
            "API 401 should surface browser-owned integration copy"
        );
        assertEqual(
            getOperationButton(fixture.toolbarElement, "polish").disabled,
            false,
            "API 401 should not reinterpret the mpr-ui authenticated lifecycle"
        );

        getOperationButton(fixture.toolbarElement, "expand").click();
        assertEqual(fixture.gateway.requests.length, 2, "The settled authenticated lifecycle should remain usable");
    });

    await runTest("logout cancels protected work and clears AI state without erasing the draft", async () => {
        const fixture = createCoordinatorFixture();
        enterText(fixture.editorElement, SOURCE_TEXT);
        reportAuthenticated();
        getOperationButton(fixture.toolbarElement, "polish").click();
        const activeSignal = fixture.gateway.requests[0].signal;
        reportUnauthenticated();
        await settleAsyncWork();
        assertEqual(activeSignal.aborted, true, "Logout should cancel the active request");
        assertEqual(fixture.previewElement.hidden, true, "Logout should clear transformation preview state");
        assertEqual(fixture.inputPanel.getDocumentSnapshot().plainText, SOURCE_TEXT, "Logout should preserve the local draft");
        assertEqual(getOperationButton(fixture.toolbarElement, "polish").disabled, true, "Logout should disable protected controls");
    });

    await runTest("images disable every operation and remain byte-for-byte unchanged", async () => {
        const fixture = createCoordinatorFixture();
        fixture.editorElement.innerHTML = `Draft text<img src="${IMAGE_DATA_URL}" alt="test image">`;
        fixture.editorElement.dispatchEvent(new Event("input", { bubbles: true }));
        reportAuthenticated();
        const beforeSnapshot = fixture.inputPanel.getDocumentSnapshot();
        Object.values(TRANSFORMATION_OPERATION_IDENTIFIERS).forEach((operation) => {
            getOperationButton(fixture.toolbarElement, operation).click();
        });
        const afterSnapshot = fixture.inputPanel.getDocumentSnapshot();
        assertEqual(fixture.gateway.requests.length, 0, "Image drafts should never reach the text-only API");
        assertDeepEqual(afterSnapshot.images, beforeSnapshot.images, "Image records should remain byte-for-byte unchanged");
        assertEqual(afterSnapshot.images[0].dataUrl, IMAGE_DATA_URL, "Image data URL bytes should remain exact");
        assertEqual(
            fixture.toolbarElement.querySelector("[data-transformation-status]")?.textContent,
            TEXT_CONTENT.TRANSFORMATION_IMAGES_UNSUPPORTED,
            "Toolbar should explain text-only support"
        );

        const activeFixture = createCoordinatorFixture();
        enterText(activeFixture.editorElement, SOURCE_TEXT);
        reportAuthenticated();
        getOperationButton(activeFixture.toolbarElement, "polish").click();
        activeFixture.editorElement.innerHTML = `A newer draft<img src="${IMAGE_DATA_URL}" alt="test image">`;
        activeFixture.editorElement.dispatchEvent(new Event("input", { bubbles: true }));
        const activeImageSnapshot = activeFixture.inputPanel.getDocumentSnapshot();
        activeFixture.gateway.resolve(0);
        await settleAsyncWork();

        assertEqual(
            getPreviewButton(activeFixture.previewElement, "apply").disabled,
            true,
            "An image added during a request should disable Apply"
        );
        assertEqual(
            getPreviewButton(activeFixture.previewElement, "retry").disabled,
            true,
            "An image added during a request should disable Try again"
        );
        getPreviewButton(activeFixture.previewElement, "apply").click();
        getPreviewButton(activeFixture.previewElement, "retry").click();
        getPreviewButton(activeFixture.previewElement, "discard").click();
        const finalImageSnapshot = activeFixture.inputPanel.getDocumentSnapshot();
        assertEqual(activeFixture.gateway.requests.length, 1, "An image should block explicit retry after a result");
        assertDeepEqual(finalImageSnapshot.images, activeImageSnapshot.images, "Preview actions should preserve image bytes and positions");
        assertEqual(finalImageSnapshot.placeholderText, activeImageSnapshot.placeholderText, "Preview actions should preserve image placement");
    });
}
