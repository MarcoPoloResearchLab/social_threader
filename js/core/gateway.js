// @ts-check
/**
 * @fileoverview Sole browser transport adapter for the Social Threader application API.
 */

import {
    API_ERROR_CODES,
    API_PATHS,
    HTTP_VALUES,
    TRANSFORMATION_LIMITS,
    TRANSFORMATION_OPERATION_IDENTIFIERS
} from "../constants.js";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const SUCCESS_RESPONSE_KEYS = Object.freeze([
    "operation",
    "request_id",
    "template_version",
    "text"
]);

/**
 * Stable gateway failure that carries only an application code and HTTP status.
 */
export class GatewayError extends Error {
    /**
     * @param {string} code Stable application error code.
     * @param {number} status HTTP status, or zero for a network boundary failure.
     */
    constructor(code, status) {
        super(`Social Threader API failure: ${code}`);
        this.name = "GatewayError";
        this.code = code;
        this.status = status;
    }
}

/**
 * Creates the mockable application API gateway.
 * @param {{ apiOrigin: string; fetchImplementation?: typeof fetch }} input Gateway dependencies.
 * @returns {{ transform: (request: import('../types.d.js').TransformationGatewayRequest) => Promise<import('../types.d.js').TransformationResponse> }}
 */
export function createTransformationGateway(input) {
    const fetchImplementation = input.fetchImplementation ?? window.fetch.bind(window);
    if (typeof fetchImplementation !== "function") {
        throw new Error("createTransformationGateway requires fetch");
    }
    const endpoint = buildTransformationEndpoint(input.apiOrigin);

    return Object.freeze({
        async transform(request) {
            validateGatewayRequest(request);
            let httpResponse;
            try {
                httpResponse = await fetchImplementation(endpoint, {
                    method: HTTP_VALUES.POST,
                    credentials: HTTP_VALUES.INCLUDE_CREDENTIALS,
                    headers: {
                        [HTTP_VALUES.CONTENT_TYPE_HEADER]: HTTP_VALUES.APPLICATION_JSON
                    },
                    body: JSON.stringify({
                        operation: request.operation,
                        text: request.text,
                        request_id: request.requestId
                    }),
                    signal: request.signal
                });
            } catch (error) {
                if (isAbortError(error)) {
                    throw error;
                }
                throw new GatewayError(API_ERROR_CODES.NETWORK_FAILURE, 0);
            }

            const responsePayload = await decodeJSONResponse(httpResponse);
            if (!httpResponse.ok) {
                const errorCode = readErrorCode(responsePayload);
                throw new GatewayError(errorCode, httpResponse.status);
            }
            return validateSuccessResponse(responsePayload, request);
        }
    });
}

/**
 * Loads the exact browser-safe application profile for the current frontend origin.
 * @param {{ currentOrigin: string; fetchImplementation?: typeof fetch }} input Profile dependencies.
 * @returns {Promise<Readonly<{ name: string; apiOrigin: string }>>}
 */
export async function loadApplicationProfile(input) {
    const fetchImplementation = input.fetchImplementation ?? window.fetch.bind(window);
    let httpResponse;
    try {
        httpResponse = await fetchImplementation(API_PATHS.APPLICATION_CONFIG, {
            method: HTTP_VALUES.GET,
            credentials: HTTP_VALUES.SAME_ORIGIN_CREDENTIALS
        });
    } catch {
        throw new GatewayError(API_ERROR_CODES.NETWORK_FAILURE, 0);
    }
    if (!httpResponse.ok) {
        throw new GatewayError(API_ERROR_CODES.INVALID_RESPONSE, httpResponse.status);
    }
    const responsePayload = await decodeJSONResponse(httpResponse);
    if (!isPlainObject(responsePayload) || responsePayload.schema_version !== 1 || !Array.isArray(responsePayload.environments)) {
        throw new GatewayError(API_ERROR_CODES.INVALID_RESPONSE, httpResponse.status);
    }
    const selectedEnvironment = responsePayload.environments.find((environment) => {
        return isPlainObject(environment) &&
            Array.isArray(environment.origins) &&
            environment.origins.includes(input.currentOrigin);
    });
    if (
        !isPlainObject(selectedEnvironment) ||
        typeof selectedEnvironment.name !== "string" ||
        typeof selectedEnvironment.api_origin !== "string"
    ) {
        throw new GatewayError(API_ERROR_CODES.INVALID_RESPONSE, httpResponse.status);
    }
    buildTransformationEndpoint(selectedEnvironment.api_origin);
    return Object.freeze({
        name: selectedEnvironment.name,
        apiOrigin: selectedEnvironment.api_origin
    });
}

/**
 * @param {string} apiOrigin Configured API origin, or blank for the current origin.
 * @returns {string}
 */
function buildTransformationEndpoint(apiOrigin) {
    const trimmedOrigin = typeof apiOrigin === "string" ? apiOrigin.trim() : "";
    if (trimmedOrigin === "") {
        return API_PATHS.THREAD_TRANSFORMATIONS;
    }
    let parsedOrigin;
    try {
        parsedOrigin = new URL(trimmedOrigin);
    } catch {
        throw new Error("Transformation API origin is invalid");
    }
    if (
        (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") ||
        parsedOrigin.pathname !== "/" ||
        parsedOrigin.search !== "" ||
        parsedOrigin.hash !== ""
    ) {
        throw new Error("Transformation API origin is invalid");
    }
    return `${parsedOrigin.origin}${API_PATHS.THREAD_TRANSFORMATIONS}`;
}

/**
 * @param {import('../types.d.js').TransformationGatewayRequest} request Browser request input.
 * @returns {void}
 */
function validateGatewayRequest(request) {
    if (!Object.values(TRANSFORMATION_OPERATION_IDENTIFIERS).includes(request.operation)) {
        throw new GatewayError(API_ERROR_CODES.INVALID_REQUEST, 0);
    }
    if (typeof request.text !== "string" || request.text.trim().length === 0) {
        throw new GatewayError(API_ERROR_CODES.INVALID_REQUEST, 0);
    }
    if (
        typeof request.requestId !== "string" ||
        request.requestId.length < TRANSFORMATION_LIMITS.MINIMUM_REQUEST_ID_LENGTH ||
        request.requestId.length > TRANSFORMATION_LIMITS.MAXIMUM_REQUEST_ID_LENGTH ||
        !REQUEST_ID_PATTERN.test(request.requestId)
    ) {
        throw new GatewayError(API_ERROR_CODES.INVALID_REQUEST, 0);
    }
    if (!(request.signal instanceof AbortSignal)) {
        throw new GatewayError(API_ERROR_CODES.INVALID_REQUEST, 0);
    }
}

/**
 * @param {{ headers: { get: (name: string) => string | null }; json: () => Promise<unknown> }} httpResponse Fetch response.
 * @returns {Promise<unknown>}
 */
async function decodeJSONResponse(httpResponse) {
    const contentType = httpResponse.headers.get(HTTP_VALUES.CONTENT_TYPE_HEADER);
    if (typeof contentType !== "string" || !contentType.toLowerCase().startsWith(HTTP_VALUES.APPLICATION_JSON)) {
        throw new GatewayError(API_ERROR_CODES.INVALID_RESPONSE, 0);
    }
    try {
        return await httpResponse.json();
    } catch {
        throw new GatewayError(API_ERROR_CODES.INVALID_RESPONSE, 0);
    }
}

/**
 * @param {unknown} responsePayload Error response payload.
 * @returns {string}
 */
function readErrorCode(responsePayload) {
    if (!isPlainObject(responsePayload) || !isPlainObject(responsePayload.error)) {
        return API_ERROR_CODES.INVALID_RESPONSE;
    }
    const errorCode = responsePayload.error.code;
    return typeof errorCode === "string" && errorCode.trim().length > 0
        ? errorCode
        : API_ERROR_CODES.INVALID_RESPONSE;
}

/**
 * @param {unknown} responsePayload Success payload from the API.
 * @param {import('../types.d.js').TransformationGatewayRequest} request Original browser request.
 * @returns {import('../types.d.js').TransformationResponse}
 */
function validateSuccessResponse(responsePayload, request) {
    if (!isPlainObject(responsePayload)) {
        throw new GatewayError(API_ERROR_CODES.INVALID_RESPONSE, 0);
    }
    const responseKeys = Object.keys(responsePayload).sort();
    if (JSON.stringify(responseKeys) !== JSON.stringify(SUCCESS_RESPONSE_KEYS)) {
        throw new GatewayError(API_ERROR_CODES.INVALID_RESPONSE, 0);
    }
    if (responsePayload.operation !== request.operation || responsePayload.request_id !== request.requestId) {
        throw new GatewayError(API_ERROR_CODES.INVALID_RESPONSE, 0);
    }
    if (
        typeof responsePayload.text !== "string" ||
        responsePayload.text.trim().length === 0 ||
        Array.from(responsePayload.text).length > TRANSFORMATION_LIMITS.MAX_RESPONSE_CHARACTERS
    ) {
        throw new GatewayError(API_ERROR_CODES.INVALID_RESPONSE, 0);
    }
    const expectedVersionPrefix = `${request.operation}.v`;
    if (
        typeof responsePayload.template_version !== "string" ||
        !responsePayload.template_version.startsWith(expectedVersionPrefix) ||
        !/\.v[1-9][0-9]*$/.test(responsePayload.template_version)
    ) {
        throw new GatewayError(API_ERROR_CODES.INVALID_RESPONSE, 0);
    }
    return /** @type {import('../types.d.js').TransformationResponse} */ ({
        operation: responsePayload.operation,
        text: responsePayload.text,
        request_id: responsePayload.request_id,
        template_version: responsePayload.template_version
    });
}

/**
 * @param {unknown} value Candidate object.
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} error Fetch failure.
 * @returns {boolean}
 */
function isAbortError(error) {
    return error instanceof Error && error.name === "AbortError";
}
