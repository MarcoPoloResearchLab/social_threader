// @ts-check
/**
 * @fileoverview Source-text anchoring for mobile image attachments.
 */

export const APPEND_TO_END_OFFSET = Number.MAX_SAFE_INTEGER;

/**
 * @typedef {Object} MobileImageRecord
 * @property {string} placeholderToken Token used to identify the image position.
 * @property {string} dataUrl URI used to render the image preview.
 * @property {string} altText Accessible description associated with the image.
 * @property {string} clipboardBase64 Base64 image payload without a data URI prefix.
 * @property {number} sourceOffset Source-text offset where the image was attached.
 */

/**
 * @typedef {Object} IndexedMobileImageRecord
 * @property {MobileImageRecord} imageRecord Image metadata.
 * @property {number} imageIndex Current image index in state.
 */

/**
 * @typedef {{ variant: "text"; sourceText: string } | { variant: "image"; imageRecord: MobileImageRecord; imageIndex: number }} MobileContentSegment
 */

/**
 * Keeps image anchors stable when the plain text around them changes.
 * @param {string} previousText Text before the edit.
 * @param {string} nextText Text after the edit.
 * @param {MobileImageRecord[]} imageRecords Existing image records.
 * @returns {MobileImageRecord[]}
 */
export function updateImageRecordOffsets(previousText, nextText, imageRecords) {
  if (imageRecords.length === 0 || previousText === nextText) {
    return imageRecords;
  }

  const sharedPrefixLength = commonPrefixLength(previousText, nextText);
  const sharedSuffixLength = commonSuffixLength(previousText, nextText, sharedPrefixLength);
  const replacedPreviousEnd = previousText.length - sharedSuffixLength;
  const insertedNextEnd = nextText.length - sharedSuffixLength;
  const offsetDelta = nextText.length - previousText.length;

  return imageRecords.map((imageRecord) => {
    const nextOffset = resolveUpdatedImageOffset({
      sourceOffset: imageRecord.sourceOffset,
      sharedPrefixLength,
      replacedPreviousEnd,
      insertedNextEnd,
      offsetDelta,
      nextTextLength: nextText.length
    });
    return {
      ...imageRecord,
      sourceOffset: nextOffset
    };
  });
}

function commonPrefixLength(firstText, secondText) {
  const maximumLength = Math.min(firstText.length, secondText.length);
  for (let characterIndex = 0; characterIndex < maximumLength; characterIndex += 1) {
    if (firstText.charAt(characterIndex) !== secondText.charAt(characterIndex)) {
      return characterIndex;
    }
  }
  return maximumLength;
}

function commonSuffixLength(firstText, secondText, sharedPrefixLength) {
  const maximumLength = Math.min(firstText.length, secondText.length) - sharedPrefixLength;
  for (let characterIndex = 0; characterIndex < maximumLength; characterIndex += 1) {
    const firstCharacter = firstText.charAt(firstText.length - characterIndex - 1);
    const secondCharacter = secondText.charAt(secondText.length - characterIndex - 1);
    if (firstCharacter !== secondCharacter) {
      return characterIndex;
    }
  }
  return maximumLength;
}

function resolveUpdatedImageOffset({
  sourceOffset,
  sharedPrefixLength,
  replacedPreviousEnd,
  insertedNextEnd,
  offsetDelta,
  nextTextLength
}) {
  if (sourceOffset <= sharedPrefixLength) {
    return clampSourceOffset(sourceOffset, nextTextLength);
  }
  if (sourceOffset > replacedPreviousEnd) {
    return clampSourceOffset(sourceOffset + offsetDelta, nextTextLength);
  }
  return clampSourceOffset(insertedNextEnd, nextTextLength);
}

function clampSourceOffset(sourceOffset, sourceLength) {
  if (!Number.isFinite(sourceOffset)) {
    return sourceLength;
  }
  return Math.min(Math.max(sourceOffset, 0), sourceLength);
}

/**
 * Inserts image anchors into the text stream as ordered content segments.
 * @param {string} sourceText User-entered text.
 * @param {MobileImageRecord[]} imageRecords Attached image records.
 * @returns {MobileContentSegment[]}
 */
export function buildContentSegments(sourceText, imageRecords) {
  const indexedImages = imageRecords
    .map((imageRecord, imageIndex) => ({ imageRecord, imageIndex }))
    .sort(compareIndexedImageRecords);
  const segments = [];
  let consumedSourceOffset = 0;

  indexedImages.forEach(({ imageRecord, imageIndex }) => {
    const imageOffset = Math.max(clampSourceOffset(imageRecord.sourceOffset, sourceText.length), consumedSourceOffset);
    if (imageOffset > consumedSourceOffset) {
      segments.push({
        variant: "text",
        sourceText: sourceText.slice(consumedSourceOffset, imageOffset)
      });
    }
    segments.push({
      variant: "image",
      imageRecord,
      imageIndex
    });
    consumedSourceOffset = imageOffset;
  });

  if (consumedSourceOffset < sourceText.length) {
    segments.push({
      variant: "text",
      sourceText: sourceText.slice(consumedSourceOffset)
    });
  }

  return segments;
}

/**
 * @param {IndexedMobileImageRecord} firstImage First image wrapper.
 * @param {IndexedMobileImageRecord} secondImage Second image wrapper.
 * @returns {number}
 */
function compareIndexedImageRecords(firstImage, secondImage) {
  const firstOffset = clampSourceOffset(firstImage.imageRecord.sourceOffset, APPEND_TO_END_OFFSET);
  const secondOffset = clampSourceOffset(secondImage.imageRecord.sourceOffset, APPEND_TO_END_OFFSET);
  return firstOffset - secondOffset || firstImage.imageIndex - secondImage.imageIndex;
}
