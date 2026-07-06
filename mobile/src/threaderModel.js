// @ts-check
/**
 * @fileoverview Platform-neutral mobile threading model.
 */

import { chunkingService } from "./shared-web/core/chunking.js";
import { richTextHelpers } from "./shared-web/core/richText.js";
import {
  DEFAULT_LENGTHS,
  MOBILE_COPY,
  PRESET_CONFIG,
  PRESET_IDENTIFIERS
} from "./constants.js";

const TEMPLATE_TOKEN_PATTERN = /\{([A-Za-z]+)\}/g;
const EMPTY_STRING = "";
const SHARE_SEPARATOR = "\n\n";
const FIRST_ARRAY_INDEX = 0;
const MINIMUM_POSITIVE_LENGTH = 1;
const BASE64_DATA_SEPARATOR = ",";

/**
 * @typedef {Object} MobileImageRecord
 * @property {string} placeholderToken Token used to identify the image position.
 * @property {string} dataUrl URI used to render the image preview.
 * @property {string} altText Accessible description associated with the image.
 * @property {string} clipboardBase64 Base64 image payload without a data URI prefix.
 */

/**
 * Replaces uppercase template tokens with provided values.
 * @param {string} template Template containing tokens such as {ORDER}.
 * @param {Record<string, string | number>} replacements Replacement values.
 * @returns {string}
 */
export function interpolateMobileTemplate(template, replacements) {
  return template.replace(TEMPLATE_TOKEN_PATTERN, (fullMatch, tokenName) => {
    const replacement = replacements[tokenName];
    return replacement === undefined ? fullMatch : String(replacement);
  });
}

/**
 * Parses a positive custom chunk length.
 * @param {string | number | null | undefined} rawValue User-provided value.
 * @returns {number | null}
 */
export function parsePositiveLength(rawValue) {
  const parsedValue = Number.parseInt(String(rawValue ?? EMPTY_STRING), 10);
  if (Number.isNaN(parsedValue) || parsedValue < MINIMUM_POSITIVE_LENGTH) {
    return null;
  }
  return parsedValue;
}

/**
 * Computes input statistics using the shared Social Threader engine.
 * @param {string} sourceText Text currently entered by the user.
 * @returns {import("./shared-web/types.d.js").ChunkStatistics}
 */
export function calculateInputStatistics(sourceText) {
  return chunkingService.calculateStatistics(sourceText);
}

/**
 * Formats statistics for display.
 * @param {import("./shared-web/types.d.js").ChunkStatistics} statistics Current statistics.
 * @returns {string}
 */
export function formatInputStatistics(statistics) {
  return interpolateMobileTemplate(MOBILE_COPY.INPUT_STATS_TEMPLATE, {
    characters: statistics.characters,
    words: statistics.words,
    sentences: statistics.sentences,
    paragraphs: statistics.paragraphs
  });
}

/**
 * Formats per-chunk statistics for display.
 * @param {import("./shared-web/types.d.js").ChunkStatistics} statistics Current statistics.
 * @returns {string}
 */
export function formatChunkStatistics(statistics) {
  return interpolateMobileTemplate(MOBILE_COPY.CHUNK_STATS_TEMPLATE, {
    characters: statistics.characters,
    words: statistics.words,
    sentences: statistics.sentences
  });
}

/**
 * Determines whether the paragraph-aware toggle should be interactive.
 * @param {import("./shared-web/types.d.js").ChunkStatistics} statistics Current statistics.
 * @returns {boolean}
 */
export function canBreakOnParagraphs(statistics) {
  return statistics.paragraphs > MINIMUM_POSITIVE_LENGTH;
}

/**
 * Normalizes a base64 image value for Expo Clipboard.
 * @param {string | null | undefined} rawBase64 Raw base64 value from an image picker asset.
 * @returns {string} Base64 payload without a data URI prefix.
 */
function normalizeClipboardBase64(rawBase64) {
  const trimmedBase64 = typeof rawBase64 === "string" ? rawBase64.trim() : EMPTY_STRING;
  const separatorIndex = trimmedBase64.indexOf(BASE64_DATA_SEPARATOR);
  if (separatorIndex === -1) {
    return trimmedBase64;
  }
  return trimmedBase64.slice(separatorIndex + BASE64_DATA_SEPARATOR.length).trim();
}

/**
 * Creates a mobile image record from an Expo image-picker asset.
 * @param {{ uri?: string; fileName?: string | null; assetId?: string | null; base64?: string | null } | null | undefined} imageAsset Expo image asset.
 * @param {number} imageIndex Zero-based image index.
 * @returns {MobileImageRecord | null}
 */
export function createImageRecord(imageAsset, imageIndex) {
  const imageUri = typeof imageAsset?.uri === "string" ? imageAsset.uri.trim() : EMPTY_STRING;
  const clipboardBase64 = normalizeClipboardBase64(imageAsset?.base64);
  if (imageUri.length === 0 || clipboardBase64.length === 0) {
    return null;
  }

  const rawAltText =
    typeof imageAsset?.fileName === "string" && imageAsset.fileName.trim().length > 0
      ? imageAsset.fileName.trim()
      : MOBILE_COPY.ATTACHED_IMAGE_ALT;

  return {
    placeholderToken: richTextHelpers.createPlaceholderToken(imageIndex),
    dataUrl: imageUri,
    altText: rawAltText,
    clipboardBase64
  };
}

/**
 * Builds renderable thread chunks for mobile.
 * @param {Object} params Builder parameters.
 * @param {string} params.sourceText User-entered text.
 * @param {MobileImageRecord[]} params.imageRecords Attached image records.
 * @param {number} params.maximumLength Selected maximum text length.
 * @param {boolean} params.breakOnSentences Whether sentence boundaries are preferred.
 * @param {boolean} params.enumerate Whether chunks should be enumerated.
 * @param {boolean} params.breakOnParagraphs Whether paragraphs should be split first.
 * @returns {Array<{ id: string; variant: "text"; plainText: string; statisticsText: string } | { id: string; variant: "image"; imageUri: string; imageBase64: string; altText: string; plainText: string }>}
 */
export function buildMobileChunks({
  sourceText,
  imageRecords,
  maximumLength,
  breakOnSentences,
  enumerate,
  breakOnParagraphs
}) {
  const textChunks = chunkingService.getChunks(sourceText, {
    maximumLength,
    breakOnSentences,
    enumerate,
    breakOnParagraphs
  });

  const renderableTextChunks = textChunks.map((chunkText, chunkIndex) => {
    const statistics = chunkingService.calculateStatistics(chunkText);
    return {
      id: `text-${chunkIndex}`,
      variant: "text",
      plainText: chunkText,
      statisticsText: formatChunkStatistics(statistics)
    };
  });

  const renderableImageChunks = imageRecords.map((imageRecord, imageIndex) => ({
    id: `image-${imageIndex}`,
    variant: "image",
    imageUri: imageRecord.dataUrl,
    imageBase64: imageRecord.clipboardBase64,
    altText: imageRecord.altText,
    plainText: EMPTY_STRING
  }));

  return [...renderableTextChunks, ...renderableImageChunks];
}

/**
 * Determines whether the current document contains content.
 * @param {string} sourceText User-entered text.
 * @param {MobileImageRecord[]} imageRecords Attached image records.
 * @returns {boolean}
 */
export function hasThreadContent(sourceText, imageRecords) {
  return sourceText.trim().length > 0 || imageRecords.length > 0;
}

/**
 * Creates a shareable plain-text thread payload.
 * @param {Array<{ variant: "text" | "image"; plainText: string }>} chunks Renderable chunks.
 * @returns {string}
 */
export function createThreadShareMessage(chunks) {
  return chunks
    .map((chunk) => (chunk.variant === "image" ? MOBILE_COPY.IMAGE_PLAIN_TEXT_PLACEHOLDER : chunk.plainText))
    .filter((chunkText) => chunkText.length > 0)
    .join(SHARE_SEPARATOR);
}

/**
 * Resolves a preset length by identifier.
 * @param {string} presetIdentifier Preset identifier.
 * @returns {number | null}
 */
export function presetLengthForIdentifier(presetIdentifier) {
  const presetDefinition = PRESET_CONFIG[presetIdentifier];
  return presetDefinition ? presetDefinition.length : null;
}

/**
 * Creates the default active mobile preset.
 * @returns {{ identifier: string; length: number }}
 */
export function defaultPresetSelection() {
  return {
    identifier: PRESET_IDENTIFIERS.TWITTER,
    length: DEFAULT_LENGTHS.TWITTER
  };
}

/**
 * Selects the first image picker asset.
 * @param {{ canceled?: boolean; assets?: Array<{ uri?: string; fileName?: string | null; assetId?: string | null; base64?: string | null }> } | null | undefined} pickerResult Image picker result.
 * @returns {{ uri?: string; fileName?: string | null; assetId?: string | null; base64?: string | null } | null}
 */
export function firstSelectedImageAsset(pickerResult) {
  if (!pickerResult || pickerResult.canceled) {
    return null;
  }
  const assets = Array.isArray(pickerResult.assets) ? pickerResult.assets : [];
  return assets[FIRST_ARRAY_INDEX] ?? null;
}
