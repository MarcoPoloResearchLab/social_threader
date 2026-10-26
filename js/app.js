// @ts-check
/**
 * @fileoverview Composition root that wires together the Social Threader application.
 */

import { chunkingService } from "./core/chunking.js";
import { InputPanel } from "./ui/inputPanel.js";
import { ChunkListView } from "./ui/chunkListView.js";
import { FormControls } from "./ui/formControls.js";
import { ThreaderController } from "./ui/controller.js";
import { renderPlatformIntroduction } from "./ui/platformControls.js";
import { TransformationToolbar } from "./ui/transformationToolbar.js";
import { TransformationPreview } from "./ui/transformationPreview.js";
import { TransformationLoginDialog } from "./ui/transformationLoginDialog.js";
import { TransformationCoordinator } from "./core/transformationCoordinator.js";
import { createTransformationGateway, loadApplicationProfile } from "./core/gateway.js";
import { reconcileMprUiAuthLifecycle } from "./core/authLifecycle.js";
import { loggingHelpers } from "./utils/logging.js";
import {
    PRESET_IDENTIFIERS,
    TOGGLE_IDENTIFIERS,
    TEXT_CONTENT
} from "./constants.js";

/**
 * Ensures that a required DOM element exists.
 * @template {HTMLElement} T
 * @param {T | null} element DOM element reference.
 * @param {string} identifier Identifier used for error reporting.
 * @returns {T}
 */
function assertElement(element, identifier) {
    if (element === null) {
        throw new Error(`Missing required element: ${identifier}`);
    }
    return element;
}

/**
 * Creates a gateway that resolves the public API profile before its first protected request.
 * @returns {{ transform: (request: import("./types.d.js").TransformationGatewayRequest) => Promise<import("./types.d.js").TransformationResponse> }}
 */
function createProfiledTransformationGateway() {
    /** @type {Promise<{ transform: (request: import("./types.d.js").TransformationGatewayRequest) => Promise<import("./types.d.js").TransformationResponse> }> | null} */
    let gatewayPromise = null;
    return Object.freeze({
        transform(request) {
            if (gatewayPromise === null) {
                gatewayPromise = loadApplicationProfile({ currentOrigin: window.location.origin })
                    .then((applicationProfile) => createTransformationGateway({
                        apiOrigin: applicationProfile.apiOrigin
                    }))
                    .catch((profileError) => {
                        gatewayPromise = null;
                        throw profileError;
                    });
            }
            return gatewayPromise.then((gateway) => gateway.transform(request));
        }
    });
}

/** @type {boolean} */
let bootstrapHasInitialized = false;

/**
 * Bootstraps the UI after DOM content is ready.
 * @returns {void}
 */
function bootstrap() {
    if (bootstrapHasInitialized) {
        return;
    }
    bootstrapHasInitialized = true;
    renderPlatformIntroduction(assertElement(document.getElementById("platformIntroduction"), "platformIntroduction"));
    const editorElement = /** @type {HTMLDivElement} */ (
        assertElement(document.getElementById("sourceText"), "sourceText")
    );
    const statsElement = assertElement(document.getElementById("inputStats"), "inputStats");
    const errorElement = assertElement(document.getElementById("inputError"), "inputError");
    const resultsElement = assertElement(document.getElementById("results"), "results");
    const transformationToolbarElement = assertElement(
        document.getElementById("transformationToolbar"),
        "transformationToolbar"
    );
    const transformationPreviewElement = assertElement(
        document.getElementById("transformationPreview"),
        "transformationPreview"
    );
    const presetButtons = {
        [PRESET_IDENTIFIERS.THREADS]: assertElement(document.getElementById("presetThreads"), "presetThreads"),
        [PRESET_IDENTIFIERS.BLUESKY]: assertElement(document.getElementById("presetBluesky"), "presetBluesky"),
        [PRESET_IDENTIFIERS.TWITTER]: assertElement(document.getElementById("presetTwitter"), "presetTwitter")
    };

    const customButtonElement = assertElement(document.getElementById("customButton"), "customButton");
    const customInputElement = assertElement(document.getElementById("customLength"), "customLength");

    const toggleInputs = {
        [TOGGLE_IDENTIFIERS.PARAGRAPH]: assertElement(document.getElementById("paragraphToggle"), "paragraphToggle"),
        [TOGGLE_IDENTIFIERS.SENTENCE]: assertElement(document.getElementById("sentenceToggle"), "sentenceToggle"),
        [TOGGLE_IDENTIFIERS.ENUMERATION]: assertElement(document.getElementById("enumerationToggle"), "enumerationToggle")
    };

    const toggleLabels = {
        [TOGGLE_IDENTIFIERS.PARAGRAPH]: assertElement(document.getElementById("paragraphToggleLabel"), "paragraphToggleLabel"),
        [TOGGLE_IDENTIFIERS.SENTENCE]: assertElement(document.getElementById("sentenceToggleLabel"), "sentenceToggleLabel"),
        [TOGGLE_IDENTIFIERS.ENUMERATION]: assertElement(document.getElementById("enumerationToggleLabel"), "enumerationToggleLabel")
    };

    const inputPanel = new InputPanel(editorElement, statsElement, errorElement);
    const chunkListView = new ChunkListView(resultsElement, chunkingService);
    const formControls = new FormControls(presetButtons, customButtonElement, customInputElement, toggleInputs, toggleLabels);
    const transformationToolbar = new TransformationToolbar(transformationToolbarElement);
    const transformationPreview = new TransformationPreview(transformationPreviewElement);
    const loginDialog = new TransformationLoginDialog(
        /** @type {HTMLDialogElement} */ (assertElement(document.getElementById("transformationLoginDialog"), "transformationLoginDialog")),
        assertElement(document.getElementById("transformationLoginTitle"), "transformationLoginTitle"),
        /** @type {HTMLButtonElement} */ (assertElement(document.getElementById("transformationLoginClose"), "transformationLoginClose"))
    );

    const controller = new ThreaderController({
        inputPanel,
        chunkListView,
        formControls,
        chunkingService,
        loggingHelpers
    });

    const transformationCoordinator = new TransformationCoordinator({
        inputPanel,
        toolbar: transformationToolbar,
        preview: transformationPreview,
        loginDialog,
        gateway: createProfiledTransformationGateway(),
        lifecycleTarget: document
    });

    controller.initialize();
    transformationCoordinator.initialize();
    void reconcileMprUiAuthLifecycle({
        namespace: /** @type {Window & typeof globalThis & { MPRUI?: unknown }} */ (window).MPRUI,
        target: "#socialThreaderHeader",
        handleAuthenticated: () => transformationCoordinator.handleAuthenticatedLifecycle(),
        handleUnauthenticated: () => transformationCoordinator.handleUnauthenticatedLifecycle()
    });
}

document.addEventListener("DOMContentLoaded", bootstrap);

if (document.readyState !== "loading") {
    bootstrap();
}
