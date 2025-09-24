// @ts-check
/**
 * @fileoverview Central location for immutable configuration values and user-facing copy.
 */

/** @type {Readonly<Record<string, string>>} */
export const TEXT_CONTENT = Object.freeze({
    APP_TITLE: "Social Threader",
    PRIMARY_DESCRIPTION: "With Social Threader, you can split your text into smaller chunks ideal for Twitter/X, Bluesky, Threads, Mastodon, or any platform that limits character count.",
    SECONDARY_DESCRIPTION: "Easily create threads, track word counts, and copy each chunk with a single click.",
    TEXTAREA_PLACEHOLDER: "Enter text here...",
    FOOTER_HTML: "This project is <strong>open source</strong>! View the code on <a href=\"https://github.com/MarkoPoloResearchLab/social_threader\" target=\"_blank\">GitHub</a>.",
    CUSTOM_BUTTON_DEFAULT: "Custom Size",
    CUSTOM_BUTTON_TEMPLATE: "Custom ({VALUE})",
    COPY_BUTTON_LABEL: "Copy",
    COPY_BUTTON_SUCCESS_LABEL: "Copied!",
    ERROR_NO_TEXT: "Please enter some text to split.",
    ERROR_INVALID_CUSTOM: "Please enter a valid positive number for custom size.",
    STATS_TEMPLATE: "Characters: {characters} | Words: {words} | Sentences: {sentences}",
    ENUMERATION_TEMPLATE: "{text} ({current}/{total})",
    INPUT_STATS_EMPTY: "Characters: 0 | Words: 0 | Sentences: 0",
    FEEDBACK_TITLE: "Feedback",
    FEEDBACK_EMAIL_LABEL: "Email:",
    FEEDBACK_EMAIL_PLACEHOLDER: "you@example.com",
    FEEDBACK_MESSAGE_LABEL: "Message:",
    FEEDBACK_MESSAGE_PLACEHOLDER: "What can be improved?",
    FEEDBACK_SUBMIT_LABEL: "Submit",
    CUSTOM_INPUT_PLACEHOLDER: "Size"
});

/** @type {Readonly<Record<string, string>>} */
export const LOG_MESSAGES = Object.freeze({
    COPY_FAILURE: "Failed to copy chunk to clipboard",
    CLIPBOARD_UNAVAILABLE: "Clipboard API is not available"
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
