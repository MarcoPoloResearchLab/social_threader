// @ts-check
/**
 * @fileoverview Public toolbar and restored-auth browser contract tests for thread transformations.
 */

import { TransformationToolbar } from "../js/ui/transformationToolbar.js";
import { reconcileMprUiAuthLifecycle } from "../js/core/authLifecycle.js";
import {
    TEXT_CONTENT,
    TRANSFORMATION_OPERATION_CONFIG,
    TRANSFORMATION_OPERATION_IDENTIFIERS
} from "../js/constants.js";
import { assertDeepEqual, assertEqual } from "./assert.js";
import {
    SOURCE_TEXT,
    createCoordinatorFixture,
    enterText,
    getOperationButton
} from "./transformation.test.js";

/**
 * @param {(name: string, fn: () => (void | Promise<void>)) => Promise<void>} runTest
 * @returns {Promise<void>}
 */
export async function runTransformationToolbarTests(runTest) {
    await runTest("transformation toolbar exposes a closed three-operation availability matrix", () => {
        document.body.innerHTML = "";
        const toolbarElement = document.createElement("section");
        document.body.appendChild(toolbarElement);
        const toolbar = new TransformationToolbar(toolbarElement);
        const selectedOperations = [];
        toolbar.onOperationSelected((operation) => selectedOperations.push(operation));

        const operationValues = Object.values(TRANSFORMATION_OPERATION_IDENTIFIERS);
        assertDeepEqual(
            Array.from(toolbarElement.querySelectorAll("[data-transformation-operation]"))
                .map((element) => element.getAttribute("data-transformation-operation")),
            operationValues,
            "Toolbar operation order should match the closed catalog"
        );

        const matrixCases = [
            { authenticated: false, hasText: false, hasImages: false, requestActive: false, enabled: false, status: TEXT_CONTENT.TRANSFORMATION_AUTH_REQUIRED },
            { authenticated: true, hasText: false, hasImages: false, requestActive: false, enabled: false, status: TEXT_CONTENT.TRANSFORMATION_EMPTY_REQUIRED },
            { authenticated: true, hasText: true, hasImages: true, requestActive: false, enabled: false, status: TEXT_CONTENT.TRANSFORMATION_IMAGES_UNSUPPORTED },
            { authenticated: true, hasText: true, hasImages: false, requestActive: true, enabled: false, status: TEXT_CONTENT.TRANSFORMATION_LOADING },
            { authenticated: true, hasText: true, hasImages: false, requestActive: false, enabled: true, status: TEXT_CONTENT.TRANSFORMATION_READY }
        ];

        matrixCases.forEach((matrixCase) => {
            toolbar.setAvailability(matrixCase);
            operationValues.forEach((operation) => {
                assertEqual(
                    getOperationButton(toolbarElement, operation).disabled,
                    !matrixCase.enabled,
                    `Button availability should match ${matrixCase.status}`
                );
            });
            assertEqual(
                toolbarElement.querySelector("[data-transformation-status]")?.textContent,
                matrixCase.status,
                "Toolbar status should explain availability"
            );
        });

        operationValues.forEach((operation) => getOperationButton(toolbarElement, operation).click());
        assertDeepEqual(selectedOperations, operationValues, "Each enabled button should emit its exact operation once");
        operationValues.forEach((operation) => {
            const operationConfig = TRANSFORMATION_OPERATION_CONFIG[operation];
            assertEqual(getOperationButton(toolbarElement, operation).textContent, operationConfig.label, "Button label should come from constants");
        });
    });

    await runTest("documented mpr-ui snapshot reconciles an authenticated startup before later events", async () => {
        const fixture = createCoordinatorFixture();
        enterText(fixture.editorElement, SOURCE_TEXT);
        let reconciliationOrder = "";
        await reconcileMprUiAuthLifecycle({
            namespace: {
                async whenAutoOrchestrationReady() {
                    reconciliationOrder += "ready;";
                },
                resolveAuthProfileSnapshot(target) {
                    reconciliationOrder += `snapshot:${String(target)};`;
                    return { status: "authenticated", profile: { user_id: "safe-test-user" } };
                }
            },
            target: "#socialThreaderHeader",
            handleAuthenticated: () => fixture.coordinator.handleAuthenticatedLifecycle(),
            handleUnauthenticated: () => fixture.coordinator.handleUnauthenticatedLifecycle()
        });

        assertEqual(
            reconciliationOrder,
            "ready;snapshot:#socialThreaderHeader;",
            "Snapshot reconciliation should wait for public mpr-ui orchestration"
        );
        assertEqual(
            getOperationButton(fixture.toolbarElement, "polish").disabled,
            false,
            "A documented authenticated snapshot should reconcile restored lifecycle state"
        );
        assertEqual(fixture.gateway.requests.length, 0, "Startup reconciliation should not probe the protected API");
    });
}
