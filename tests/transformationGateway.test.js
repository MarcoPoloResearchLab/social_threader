// @ts-check
/**
 * @fileoverview Black-box browser tests for the Social Threader application API gateway.
 */

import {
    GatewayError,
    createTransformationGateway,
    loadApplicationProfile
} from "../js/core/gateway.js";
import {
    TRANSFORMATION_LIMITS,
    TRANSFORMATION_OPERATION_IDENTIFIERS
} from "../js/constants.js";
import { assertDeepEqual, assertEqual } from "./assert.js";

const SOURCE_TEXT = "A useful original thread.";
const REVISED_TEXT = "A stronger revised thread.";

/**
 * @param {(name: string, fn: () => (void | Promise<void>)) => Promise<void>} runTest
 * @returns {Promise<void>}
 */
export async function runTransformationGatewayTests(runTest) {
    await runTest("gateway sends one credentialed closed request and validates the response", async () => {
        const capturedRequests = [];
        const fetchImplementation = async (url, options) => {
            capturedRequests.push({ url, options });
            return {
                ok: true,
                status: 200,
                headers: { get: () => "application/json; charset=utf-8" },
                json: async () => ({
                    operation: "polish",
                    text: REVISED_TEXT,
                    request_id: "gateway-request-001",
                    template_version: "polish.v1"
                })
            };
        };
        const gateway = createTransformationGateway({
            apiOrigin: "https://threader-api.mprlab.com",
            fetchImplementation
        });
        const abortController = new AbortController();
        const response = await gateway.transform({
            operation: TRANSFORMATION_OPERATION_IDENTIFIERS.POLISH,
            text: SOURCE_TEXT,
            requestId: "gateway-request-001",
            signal: abortController.signal
        });

        assertEqual(capturedRequests.length, 1, "Gateway should make one request");
        assertEqual(capturedRequests[0].url, "https://threader-api.mprlab.com/v1/thread-transformations", "Gateway should use the application API route");
        assertEqual(capturedRequests[0].options.method, "POST", "Gateway should use POST");
        assertEqual(capturedRequests[0].options.credentials, "include", "Gateway should include the TAuth cookie");
        assertEqual(capturedRequests[0].options.signal, abortController.signal, "Gateway should propagate cancellation");
        assertDeepEqual(
            JSON.parse(capturedRequests[0].options.body),
            { operation: "polish", text: SOURCE_TEXT, request_id: "gateway-request-001" },
            "Gateway should send only the closed application contract"
        );
        assertEqual(response.text, REVISED_TEXT, "Gateway should return validated plain text");
    });

    await runTest("browser profile loader selects only the exact current origin", async () => {
        const fetchImplementation = async () => ({
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({
                schema_version: 1,
                environments: [
                    { name: "local", origins: ["http://localhost:4173"], api_origin: "" },
                    { name: "hosted", origins: ["https://threader.mprlab.com"], api_origin: "https://threader-api.mprlab.com" }
                ]
            })
        });
        const hostedProfile = await loadApplicationProfile({
            currentOrigin: "https://threader.mprlab.com",
            fetchImplementation
        });
        assertDeepEqual(
            hostedProfile,
            { name: "hosted", apiOrigin: "https://threader-api.mprlab.com" },
            "Profile loader should return the exact hosted API origin"
        );

        let mismatchCode = "";
        try {
            await loadApplicationProfile({ currentOrigin: "https://preview.example", fetchImplementation });
        } catch (error) {
            mismatchCode = error instanceof GatewayError ? error.code : "unexpected";
        }
        assertEqual(mismatchCode, "invalid_response", "Unknown browser origins should fail closed");
    });

    await runTest("gateway rejects API errors, blank responses, and oversized responses", async () => {
        const cases = [
            {
                name: "rate limit",
                fetchImplementation: async () => ({
                    ok: false,
                    status: 429,
                    headers: { get: () => "application/json" },
                    json: async () => ({ error: { code: "rate_limited", message: "ignored" } })
                }),
                expectedCode: "rate_limited"
            },
            {
                name: "authentication failure",
                fetchImplementation: async () => ({
                    ok: false,
                    status: 401,
                    headers: { get: () => "application/json" },
                    json: async () => ({ error: { code: "authentication_required", message: "ignored" } })
                }),
                expectedCode: "authentication_required"
            },
            {
                name: "upstream failure",
                fetchImplementation: async () => ({
                    ok: false,
                    status: 502,
                    headers: { get: () => "application/json" },
                    json: async () => ({ error: { code: "upstream_failure", message: "ignored" } })
                }),
                expectedCode: "upstream_failure"
            },
            {
                name: "oversized input",
                fetchImplementation: async () => ({
                    ok: false,
                    status: 413,
                    headers: { get: () => "application/json" },
                    json: async () => ({ error: { code: "input_too_large", message: "ignored" } })
                }),
                expectedCode: "input_too_large"
            },
            {
                name: "blank",
                fetchImplementation: async () => ({
                    ok: true,
                    status: 200,
                    headers: { get: () => "application/json" },
                    json: async () => ({ operation: "polish", text: " ", request_id: "gateway-invalid-001", template_version: "polish.v1" })
                }),
                expectedCode: "invalid_response"
            },
            {
                name: "oversized",
                fetchImplementation: async () => ({
                    ok: true,
                    status: 200,
                    headers: { get: () => "application/json" },
                    json: async () => ({ operation: "polish", text: "x".repeat(TRANSFORMATION_LIMITS.MAX_RESPONSE_CHARACTERS + 1), request_id: "gateway-invalid-001", template_version: "polish.v1" })
                }),
                expectedCode: "invalid_response"
            }
        ];

        for (const testCase of cases) {
            const gateway = createTransformationGateway({ apiOrigin: "", fetchImplementation: testCase.fetchImplementation });
            let receivedCode = "";
            try {
                await gateway.transform({
                    operation: "polish",
                    text: SOURCE_TEXT,
                    requestId: "gateway-invalid-001",
                    signal: new AbortController().signal
                });
            } catch (error) {
                receivedCode = error instanceof GatewayError ? error.code : "unexpected";
            }
            assertEqual(receivedCode, testCase.expectedCode, `${testCase.name} should produce a stable gateway code`);
        }
    });
}
