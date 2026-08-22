// @ts-check
/**
 * @fileoverview Central location for immutable configuration values and user-facing copy.
 */

/** @type {Readonly<Record<string, string>>} */
export const TEXT_CONTENT = Object.freeze({
    EDITOR_PLACEHOLDER: "Enter text here...",
    CUSTOM_BUTTON_DEFAULT: "Custom Size",
    CUSTOM_BUTTON_TEMPLATE: "Custom ({VALUE})",
    COPY_BUTTON_LABEL: "Copy",
    COPY_BUTTON_SUCCESS_LABEL: "Copied!",
    PASTED_IMAGE_ALT: "Pasted image",
    IMAGE_PLAIN_TEXT_PLACEHOLDER: "[Image]",
    ERROR_NO_TEXT: "Please enter some text to split.",
    ERROR_INVALID_CUSTOM: "Please enter a valid positive number for custom size.",
    ERROR_IMAGE_COPY_UNSUPPORTED:
        "Safari cannot copy images without ClipboardItem support. Please try a different browser or update Safari.",
    INPUT_STATS_TEMPLATE: "Characters: {characters} | Words: {words} | Sentences: {sentences} | Paragraphs: {paragraphs}",
    CHUNK_STATS_TEMPLATE: "Characters: {characters} | Words: {words} | Sentences: {sentences}",
    ENUMERATION_TEMPLATE: "{text} ({current}/{total})",
    INPUT_STATS_EMPTY: "Characters: 0 | Words: 0 | Sentences: 0 | Paragraphs: 0",
    FEEDBACK_TITLE: "Feedback",
    FEEDBACK_EMAIL_LABEL: "Email:",
    FEEDBACK_EMAIL_PLACEHOLDER: "you@example.com",
    FEEDBACK_MESSAGE_LABEL: "Message:",
    FEEDBACK_MESSAGE_PLACEHOLDER: "What can be improved?",
    FEEDBACK_SUBMIT_LABEL: "Submit",
    CUSTOM_INPUT_PLACEHOLDER: "Size",
    TRANSFORMATION_HEADING: "Improve with AI",
    TRANSFORMATION_PRIVACY:
        "AI editing sends only this text draft to Social Threader's protected API. The source draft is not persisted.",
    TRANSFORMATION_AUTH_REQUIRED: "Sign in to use AI editing. Thread splitting stays available.",
    TRANSFORMATION_EMPTY_REQUIRED: "Enter text to enable AI editing.",
    TRANSFORMATION_IMAGES_UNSUPPORTED: "AI editing currently supports text-only drafts. Attached images remain unchanged.",
    TRANSFORMATION_LOADING: "Improving your thread…",
    TRANSFORMATION_READY: "Choose one editing operation.",
    TRANSFORMATION_PREVIEW_TITLE: "AI edit preview",
    TRANSFORMATION_STALE_RESULT: "Your draft changed while this result was prepared. Review it before you apply it.",
    TRANSFORMATION_APPLY_LABEL: "Apply",
    TRANSFORMATION_DISCARD_LABEL: "Discard",
    TRANSFORMATION_RETRY_LABEL: "Try again",
    TRANSFORMATION_UNDO_LABEL: "Undo",
    TRANSFORMATION_RESULT_LABEL: "Suggested thread text",
    TRANSFORMATION_ERROR_LABEL: "AI editing error",
    TRANSFORMATION_APPLIED: "AI edit applied. You can undo this replacement once."
});

/** @type {Readonly<Record<string, string>>} */
export const TRANSFORMATION_OPERATION_IDENTIFIERS = Object.freeze({
    POLISH: "polish",
    EXPAND: "expand",
    PUNCH_UP: "punch_up"
});

/** @type {Readonly<Record<string, Readonly<{ label: string; description: string }>>>} */
export const TRANSFORMATION_OPERATION_CONFIG = Object.freeze({
    [TRANSFORMATION_OPERATION_IDENTIFIERS.POLISH]: Object.freeze({
        label: "Polish",
        description: "Improve grammar, clarity, cohesion, and flow while preserving meaning, voice, and approximate length."
    }),
    [TRANSFORMATION_OPERATION_IDENTIFIERS.EXPAND]: Object.freeze({
        label: "Expand",
        description: "Add useful explanation, connective detail, and structure without inventing facts or claims."
    }),
    [TRANSFORMATION_OPERATION_IDENTIFIERS.PUNCH_UP]: Object.freeze({
        label: "Punch Up",
        description: "Strengthen the hook, cadence, transitions, and ending without misleading clickbait."
    })
});

export const TRANSFORMATION_ACTION_IDENTIFIERS = Object.freeze({
    APPLY: "apply",
    DISCARD: "discard",
    RETRY: "retry",
    UNDO: "undo"
});

export const AUTH_EVENT_NAMES = Object.freeze({
    AUTHENTICATED: "mpr-ui:auth:authenticated",
    UNAUTHENTICATED: "mpr-ui:auth:unauthenticated"
});

export const AUTH_LIFECYCLE_STATUS = Object.freeze({
    AUTHENTICATED: "authenticated",
    UNAUTHENTICATED: "unauthenticated",
    UNKNOWN: "unknown"
});

export const API_ERROR_CODES = Object.freeze({
    AUTHENTICATION_REQUIRED: "authentication_required",
    CAPACITY_UNAVAILABLE: "capacity_unavailable",
    CONCURRENCY_LIMITED: "concurrency_limited",
    INPUT_TOO_LARGE: "input_too_large",
    INVALID_COMPLETION: "invalid_completion",
    INVALID_MEDIA_TYPE: "invalid_media_type",
    INVALID_REQUEST: "invalid_request",
    INVALID_REQUEST_ID: "invalid_request_id",
    INVALID_RESPONSE: "invalid_response",
    INVALID_TEXT: "invalid_text",
    METHOD_NOT_ALLOWED: "method_not_allowed",
    ORIGIN_NOT_ALLOWED: "origin_not_allowed",
    RATE_LIMITED: "rate_limited",
    REQUEST_CANCELED: "request_canceled",
    REQUEST_ID_CONFLICT: "request_id_conflict",
    REQUEST_TOO_LARGE: "request_too_large",
    RESOURCE_NOT_FOUND: "resource_not_found",
    UNKNOWN_OPERATION: "unknown_operation",
    UPSTREAM_FAILURE: "upstream_failure",
    UPSTREAM_TIMEOUT: "upstream_timeout",
    NETWORK_FAILURE: "network_failure"
});

const TRANSFORMATION_REQUEST_REJECTED_MESSAGE =
    "The thread could not be sent for AI editing. Review the draft and try again.";
const TRANSFORMATION_INTEGRATION_ERROR_MESSAGE =
    "AI editing could not use the configured application API. Please report the integration problem.";

/** @type {Readonly<Record<string, string>>} */
export const TRANSFORMATION_ERROR_MESSAGES = Object.freeze({
    [API_ERROR_CODES.AUTHENTICATION_REQUIRED]:
        "The authenticated transformation request was rejected. Please try again or report the integration problem.",
    [API_ERROR_CODES.INVALID_MEDIA_TYPE]: TRANSFORMATION_REQUEST_REJECTED_MESSAGE,
    [API_ERROR_CODES.INVALID_REQUEST]: TRANSFORMATION_REQUEST_REJECTED_MESSAGE,
    [API_ERROR_CODES.INVALID_REQUEST_ID]: TRANSFORMATION_REQUEST_REJECTED_MESSAGE,
    [API_ERROR_CODES.INVALID_TEXT]: TRANSFORMATION_REQUEST_REJECTED_MESSAGE,
    [API_ERROR_CODES.UNKNOWN_OPERATION]: TRANSFORMATION_REQUEST_REJECTED_MESSAGE,
    [API_ERROR_CODES.INPUT_TOO_LARGE]: "This draft is too large for AI editing. Shorten it and try again.",
    [API_ERROR_CODES.REQUEST_TOO_LARGE]: "This draft is too large to send for AI editing. Shorten it and try again.",
    [API_ERROR_CODES.INVALID_RESPONSE]: "AI editing returned an invalid result. Your draft was not changed.",
    [API_ERROR_CODES.RATE_LIMITED]: "You reached the AI editing request limit. Please try again later.",
    [API_ERROR_CODES.CONCURRENCY_LIMITED]: "AI editing is busy. Please try again in a moment.",
    [API_ERROR_CODES.CAPACITY_UNAVAILABLE]: "AI editing is temporarily unavailable because its capacity limit was reached.",
    [API_ERROR_CODES.UPSTREAM_FAILURE]: "AI editing failed before it produced a result. Your draft was not changed.",
    [API_ERROR_CODES.UPSTREAM_TIMEOUT]: "AI editing took too long and stopped. Your draft was not changed.",
    [API_ERROR_CODES.INVALID_COMPLETION]: "AI editing returned an unusable result. Your draft was not changed.",
    [API_ERROR_CODES.REQUEST_ID_CONFLICT]: "This AI editing request conflicted with an earlier request. Please try again.",
    [API_ERROR_CODES.REQUEST_CANCELED]: "AI editing stopped before it produced a result. Your draft was not changed.",
    [API_ERROR_CODES.METHOD_NOT_ALLOWED]: TRANSFORMATION_INTEGRATION_ERROR_MESSAGE,
    [API_ERROR_CODES.ORIGIN_NOT_ALLOWED]: TRANSFORMATION_INTEGRATION_ERROR_MESSAGE,
    [API_ERROR_CODES.RESOURCE_NOT_FOUND]: TRANSFORMATION_INTEGRATION_ERROR_MESSAGE,
    [API_ERROR_CODES.NETWORK_FAILURE]: "Social Threader could not reach AI editing. Check your connection and try again."
});

export const TRANSFORMATION_LIMITS = Object.freeze({
    MAX_RESPONSE_CHARACTERS: 10000,
    MINIMUM_REQUEST_ID_LENGTH: 8,
    MAXIMUM_REQUEST_ID_LENGTH: 128
});

export const API_PATHS = Object.freeze({
    THREAD_TRANSFORMATIONS: "/v1/thread-transformations",
    APPLICATION_CONFIG: "/config-app.json"
});

export const HTTP_VALUES = Object.freeze({
    GET: "GET",
    POST: "POST",
    APPLICATION_JSON: "application/json",
    CONTENT_TYPE_HEADER: "Content-Type",
    INCLUDE_CREDENTIALS: "include",
    SAME_ORIGIN_CREDENTIALS: "same-origin"
});

/** @type {Readonly<Record<string, string>>} */
export const LOG_MESSAGES = Object.freeze({
    COPY_FAILURE: "Failed to copy chunk to clipboard",
    CLIPBOARD_UNAVAILABLE: "Clipboard API is not available",
    IMAGE_READ_FAILURE: "Unable to read file as data URL",
    IMAGE_READ_ERROR: "Failed to read file",
    TEST_HARNESS_IMPORT_FAILURE: "Failed to load browser test harness",
    TEST_HARNESS_INITIALIZATION_FAILURE: "Browser test harness encountered an initialization error",
    CLIPBOARD_IMAGE_UNSUPPORTED: "Image clipboard copy is not supported without ClipboardItem"
});

/** @type {Readonly<Record<string, string>>} */
export const TOGGLE_IDENTIFIERS = Object.freeze({
    PARAGRAPH: "PARAGRAPH",
    SENTENCE: "SENTENCE",
    ENUMERATION: "ENUMERATION"
});

export const TOGGLE_LABELS = Object.freeze({
    [TOGGLE_IDENTIFIERS.PARAGRAPH]: "Paragraphs",
    [TOGGLE_IDENTIFIERS.SENTENCE]: "Sentences",
    [TOGGLE_IDENTIFIERS.ENUMERATION]: "Enumerate"
});

export const ATTRIBUTE_NAMES = Object.freeze({
    ARIA_DISABLED: "aria-disabled"
});

export const CLASS_NAMES = Object.freeze({
    DISABLED: "disabled",
    ACTIVE: "active"
});

export const CHUNK_CONTAINER_STATE_CLASSES = Object.freeze({
    COPIED: "copied",
    ERROR: "copyError"
});

export const COPY_BUTTON_STATE_CLASSES = Object.freeze({
    SUCCESS: "success",
    ERROR: "error"
});

export const CHUNK_ATTRIBUTE_NAMES = Object.freeze({
    COPY_ORDER: "data-copied-order"
});

/** @type {Readonly<Record<string, number>>} */
export const DEFAULT_LENGTHS = Object.freeze({
    THREADS: 500,
    BLUESKY: 300,
    TWITTER: 280,
    CUSTOM: 128
});

/** @type {Readonly<Record<string, string>>} */
export const PRESET_IDENTIFIERS = Object.freeze({
    THREADS: "threads",
    BLUESKY: "bluesky",
    TWITTER: "twitter"
});

/** @type {Readonly<Record<string, import('./types.d.js').PresetDefinition>>} */
export const PRESET_CONFIG = Object.freeze({
    [PRESET_IDENTIFIERS.THREADS]: Object.freeze({
        length: DEFAULT_LENGTHS.THREADS,
        label: "Threads/Mastodon (500)"
    }),
    [PRESET_IDENTIFIERS.BLUESKY]: Object.freeze({
        length: DEFAULT_LENGTHS.BLUESKY,
        label: "Bluesky (300)"
    }),
    [PRESET_IDENTIFIERS.TWITTER]: Object.freeze({
        length: DEFAULT_LENGTHS.TWITTER,
        label: "Twitter/X (280)"
    })
});

/** @type {Readonly<Record<string, string>>} */
export const FORM_CONFIG = Object.freeze({
    ACTION_URL: "https://formspree.io/f/manqedkk"
});

/** @type {Readonly<Record<string, string>>} */
export const FORM_FIELD_TYPES = Object.freeze({
    EMAIL: "email",
    TEXTAREA: "textarea",
    SUBMIT: "submit"
});

/** @type {Readonly<Record<string, string>>} */
export const FORM_FIELD_NAMES = Object.freeze({
    EMAIL: "email",
    MESSAGE: "message"
});

/** @type {Readonly<Record<string, string>>} */
export const STYLE_VALUES = Object.freeze({
    BRAND_COLOR_HEX: "#007BFF"
});

/** @type {Readonly<Record<string, string>>} */
export const HTML_TEMPLATES = Object.freeze({
    CLIPBOARD_WRAPPER: "<div>{CONTENT}</div>"
});

/** @type {Readonly<Record<string, string>>} */
export const CLIPBOARD_PRESENTATION_STYLES = Object.freeze({
    ATTACHMENT: "attachment"
});

/** @type {Readonly<Record<string, string>>} */
export const PLACEHOLDER_TOKENS = Object.freeze({
    IMAGE_PREFIX: "[[IMAGE:",
    IMAGE_SUFFIX: "]]"
});

/** @type {Readonly<Record<string, string>>} */
export const USER_AGENT_TOKENS = Object.freeze({
    SAFARI: "Safari",
    CHROME: "Chrome",
    CHROMIUM: "Chromium",
    IOS_CHROME: "CriOS",
    IOS_FIREFOX: "FxiOS"
});

/** @type {Readonly<Record<string, string>>} */
export const NAVIGATOR_VENDOR_VALUES = Object.freeze({
    APPLE: "Apple Computer, Inc."
});

export const TEST_MODE_CONFIG = Object.freeze({
    QUERY_PARAMETER: "test",
    ENABLED_VALUE: "true"
});

export const TEST_HARNESS_DOM = Object.freeze({
    WRAPPER_ID: "testHarness",
    OUTPUT_ID: "testHarnessOutput",
    TITLE_ID: "testHarnessTitle"
});

export const TEST_HARNESS_CLASS_NAMES = Object.freeze({
    WRAPPER: "testHarnessWrapper"
});

export const TEST_HARNESS_TEXT_CONTENT = Object.freeze({
    TITLE: "Social Threader Browser Tests",
    SUMMARY_PLACEHOLDER: "Preparing test summary…",
    INITIALIZATION_FAILURE: "Unable to initialize browser tests. Check console output for details.",
    UNEXPECTED_ERROR_PREFIX: "Unexpected test harness failure: "
});
