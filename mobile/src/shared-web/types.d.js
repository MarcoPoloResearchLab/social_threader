// @ts-check
/**
 * @fileoverview Shared typedefs for the Social Threader application.
 */

/**
 * @typedef {Object} ChunkStatistics
 * @property {number} characters Total number of characters contained in the chunk.
 * @property {number} words Total number of whitespace separated words contained in the chunk.
 * @property {number} sentences Total number of sentence-ending punctuation markers contained in the chunk.
 * @property {number} paragraphs Total number of paragraphs contained in the chunk.
 */

/**
 * @typedef {Object} ThreadingOptions
 * @property {number} maximumLength Maximum number of characters allowed per chunk.
 * @property {boolean} breakOnSentences Flag indicating whether chunking respects sentence boundaries.
 * @property {boolean} enumerate Flag indicating whether chunks should be enumerated.
 * @property {boolean} breakOnParagraphs Flag indicating whether the algorithm should break on paragraph boundaries.
 */

/**
 * @typedef {Object} PresetDefinition
 * @property {number} length Maximum character length represented by the preset.
 * @property {string} label Display label presented to the user.
 */

/**
 * @typedef {Object} ThreadingState
 * @property {number | null} activeLength Currently selected maximum chunk length when a preset or custom value is active.
 * @property {boolean} breakOnSentences Flag capturing the UI state for sentence preservation.
 * @property {boolean} enumerate Flag capturing the UI state for enumerating chunks.
 * @property {boolean} breakOnParagraphs Flag capturing the UI state for paragraph preservation.
 * @property {number} copySequenceNumber Incremental counter used to mark copied chunks.
 */

/**
 * @typedef {Object} RichTextImage
 * @property {string} placeholderToken Token used to identify the image position within placeholder text.
 * @property {string} dataUrl Data URL representation of the pasted image.
 * @property {string} altText Accessible description associated with the image.
 */

/**
 * @typedef {Object} RichTextDocument
 * @property {string} placeholderText Text content with placeholder tokens substituted for inline images.
 * @property {string} plainText Plain text representation suitable for statistics and text-only copy operations.
 * @property {RichTextImage[]} images Ordered list of images contained within the document.
 */

/**
 * @typedef {"text" | "image"} ChunkVariant
 */

/**
 * @typedef {Object} ChunkContent
 * @property {ChunkVariant} variant Kind of chunk being rendered.
 * @property {string} plainText Plain text representation of the chunk suitable for copying as text.
 * @property {string} htmlContent HTML markup used when rendering the chunk in the UI.
 * @property {string} [clipboardHtml] Optional HTML fragment used when copying the chunk to the clipboard.
 * @property {string} [imageDataUrl] Optional data URL used when copying image chunks to the clipboard.
 * @property {string} [statisticsText] Optional text used when calculating statistics for the chunk.
 */

/**
 * @typedef {(chunkText: string, chunkIndex: number, totalChunks: number) => string} EnumerationFormatter
 */

/**
 * @typedef {(placeholderText: string, replacements: Record<string, string | number>) => string} TemplateInterpolator
 */

/**
 * @typedef {(error: unknown) => void} ErrorLogger
 */
