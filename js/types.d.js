// @ts-check
/**
 * @fileoverview Shared typedefs for the Social Threader application.
 */

/**
 * @typedef {Object} ChunkStatistics
 * @property {number} characters Total number of characters contained in the chunk.
 * @property {number} words Total number of whitespace separated words contained in the chunk.
 * @property {number} sentences Total number of sentence-ending punctuation markers contained in the chunk.
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
 * @typedef {Object} RenderedChunk
 * @property {string} text Textual content of the chunk.
 * @property {ChunkStatistics} statistics Derived statistics for the chunk.
 */

/**
 * @typedef {Object} ThreadingState
 * @property {number} activeLength Currently selected maximum chunk length.
 * @property {boolean} breakOnSentences Flag capturing the UI state for sentence preservation.
 * @property {boolean} enumerate Flag capturing the UI state for enumerating chunks.
 * @property {boolean} breakOnParagraphs Flag capturing the UI state for paragraph preservation.
 * @property {number} copySequenceNumber Incremental counter used to mark copied chunks.
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
