import {
  buildMobileChunks,
  calculateInputStatistics,
  canBreakOnParagraphs,
  createImageRecord,
  createThreadShareMessage,
  defaultPresetSelection,
  firstSelectedImageAsset,
  formatInputStatistics,
  hasThreadContent,
  interpolateMobileTemplate,
  parsePositiveLength,
  presetLengthForIdentifier,
  updateImageRecordOffsets
} from "../src/threaderModel";
import {
  DEFAULT_LENGTHS,
  MOBILE_COPY,
  PRESET_IDENTIFIERS
} from "../src/constants";

const IMAGE_CLIPBOARD_BASE64 = "ZmFrZQ==";

describe("mobile threading model", () => {
  it("parses positive lengths and rejects invalid values", () => {
    expect(parsePositiveLength("280")).toBe(280);
    expect(parsePositiveLength(500)).toBe(500);
    expect(parsePositiveLength("0")).toBeNull();
    expect(parsePositiveLength("-1")).toBeNull();
    expect(parsePositiveLength("abc")).toBeNull();
    expect(parsePositiveLength(null)).toBeNull();
  });

  it("formats statistics and determines paragraph availability", () => {
    const statistics = calculateInputStatistics("Alpha.\n\nBeta.");
    expect(formatInputStatistics(statistics)).toBe("Characters: 13 | Words: 2 | Sentences: 2 | Paragraphs: 2");
    expect(canBreakOnParagraphs(statistics)).toBe(true);
    expect(canBreakOnParagraphs(calculateInputStatistics("Alpha only."))).toBe(false);
  });

  it("builds text and image chunks using shared chunking behavior", () => {
    const imageRecord = createImageRecord(
      { uri: "file:///tmp/image.png", fileName: "draft.png", base64: IMAGE_CLIPBOARD_BASE64 },
      0
    );
    const chunks = buildMobileChunks({
      sourceText: "Alpha bravo charlie delta echo.",
      imageRecords: [imageRecord],
      maximumLength: 12,
      breakOnSentences: false,
      enumerate: true,
      breakOnParagraphs: false
    });

    expect(chunks.map((chunk) => chunk.variant)).toEqual([
      "text",
      "text",
      "text",
      "text",
      "text",
      "text",
      "image"
    ]);
    expect(chunks[0].plainText).toBe("Alpha (1/6)");
    expect(chunks[6].imageUri).toBe("file:///tmp/image.png");
    expect(chunks[6].imageBase64).toBe(IMAGE_CLIPBOARD_BASE64);
    expect(chunks[6].altText).toBe("draft.png");
  });

  it("creates image records and handles empty assets", () => {
    expect(createImageRecord({ uri: "  ", base64: IMAGE_CLIPBOARD_BASE64 }, 0)).toBeNull();
    expect(createImageRecord({ uri: "file:///tmp/image.png" }, 0)).toBeNull();
    expect(createImageRecord(null, 0)).toBeNull();
    const imageRecord = createImageRecord(
      { uri: "file:///tmp/image.png", base64: `data:image/png;base64,${IMAGE_CLIPBOARD_BASE64}` },
      2
    );
    expect(imageRecord.placeholderToken).toBe("[[IMAGE:2]]");
    expect(imageRecord.altText).toBe(MOBILE_COPY.ATTACHED_IMAGE_ALT);
    expect(imageRecord.clipboardBase64).toBe(IMAGE_CLIPBOARD_BASE64);
    expect(imageRecord.sourceOffset).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("keeps image chunks anchored between text segments", () => {
    const imageRecord = createImageRecord(
      { uri: "file:///tmp/middle.png", fileName: "middle.png", base64: IMAGE_CLIPBOARD_BASE64 },
      0,
      5
    );
    const chunks = buildMobileChunks({
      sourceText: "Alpha bravo charlie",
      imageRecords: [imageRecord],
      maximumLength: 80,
      breakOnSentences: false,
      enumerate: true,
      breakOnParagraphs: false
    });

    expect(chunks.map((chunk) => chunk.variant)).toEqual(["text", "image", "text"]);
    expect(chunks[0].plainText).toBe("Alpha (1/2)");
    expect(chunks[1].imageUri).toBe("file:///tmp/middle.png");
    expect(chunks[2].plainText).toBe("bravo charlie (2/2)");
    expect(createThreadShareMessage(chunks)).toBe(
      `Alpha (1/2)\n\n${MOBILE_COPY.IMAGE_PLAIN_TEXT_PLACEHOLDER}\n\nbravo charlie (2/2)`
    );
  });

  it("sorts multiple image anchors and appends unbounded anchors at the end", () => {
    const trailingImageRecord = createImageRecord(
      { uri: "file:///tmp/trailing.png", fileName: "trailing.png", base64: IMAGE_CLIPBOARD_BASE64 },
      0,
      Number.POSITIVE_INFINITY
    );
    const leadingImageRecord = createImageRecord(
      { uri: "file:///tmp/leading.png", fileName: "leading.png", base64: IMAGE_CLIPBOARD_BASE64 },
      1,
      0
    );
    const chunks = buildMobileChunks({
      sourceText: "Alpha beta",
      imageRecords: [trailingImageRecord, leadingImageRecord],
      maximumLength: 80,
      breakOnSentences: false,
      enumerate: false,
      breakOnParagraphs: false
    });

    expect(chunks.map((chunk) => chunk.id)).toEqual(["image-1", "text-0", "image-0"]);
    expect(chunks[1].plainText).toBe("Alpha beta");
  });

  it("preserves attachment order for images anchored at the same offset", () => {
    const firstImageRecord = createImageRecord(
      { uri: "file:///tmp/first.png", fileName: "first.png", base64: IMAGE_CLIPBOARD_BASE64 },
      0,
      0
    );
    const secondImageRecord = createImageRecord(
      { uri: "file:///tmp/second.png", fileName: "second.png", base64: IMAGE_CLIPBOARD_BASE64 },
      1,
      0
    );
    const chunks = buildMobileChunks({
      sourceText: "Alpha",
      imageRecords: [firstImageRecord, secondImageRecord],
      maximumLength: 80,
      breakOnSentences: false,
      enumerate: false,
      breakOnParagraphs: false
    });

    expect(chunks.map((chunk) => chunk.id)).toEqual(["image-0", "image-1", "text-0"]);
  });

  it("keeps image-only enumerated threads image-only", () => {
    const imageRecord = createImageRecord(
      { uri: "file:///tmp/solo.png", fileName: "solo.png", base64: IMAGE_CLIPBOARD_BASE64 },
      0,
      0
    );
    const chunks = buildMobileChunks({
      sourceText: "",
      imageRecords: [imageRecord],
      maximumLength: 80,
      breakOnSentences: false,
      enumerate: true,
      breakOnParagraphs: false
    });

    expect(chunks).toEqual([
      {
        id: "image-0",
        variant: "image",
        imageUri: "file:///tmp/solo.png",
        imageBase64: IMAGE_CLIPBOARD_BASE64,
        altText: "solo.png",
        plainText: ""
      }
    ]);
  });

  it("updates image anchors as surrounding text changes", () => {
    const imageRecord = createImageRecord(
      { uri: "file:///tmp/anchor.png", base64: IMAGE_CLIPBOARD_BASE64 },
      0,
      5
    );
    const afterAppendingText = updateImageRecordOffsets("Alpha", "Alpha bravo", [imageRecord]);
    expect(afterAppendingText[0].sourceOffset).toBe(5);

    const afterPrependingText = updateImageRecordOffsets("Alpha bravo", "Intro Alpha bravo", afterAppendingText);
    expect(afterPrependingText[0].sourceOffset).toBe(11);

    const afterReplacingAnchorText = updateImageRecordOffsets("Intro Alpha bravo", "Intro updated bravo", afterPrependingText);
    expect(afterReplacingAnchorText[0].sourceOffset).toBe(13);
  });

  it("creates share messages and content flags", () => {
    expect(hasThreadContent("", [])).toBe(false);
    expect(hasThreadContent("  Alpha  ", [])).toBe(true);
    expect(hasThreadContent("", [
      {
        placeholderToken: "[[IMAGE:0]]",
        dataUrl: "file:///image.png",
        altText: "Image",
        clipboardBase64: IMAGE_CLIPBOARD_BASE64,
        sourceOffset: 0
      }
    ])).toBe(true);
    expect(createThreadShareMessage([
      { variant: "text", plainText: "Alpha" },
      { variant: "image", plainText: "" },
      { variant: "text", plainText: "" }
    ])).toBe(`Alpha\n\n${MOBILE_COPY.IMAGE_PLAIN_TEXT_PLACEHOLDER}`);
  });

  it("resolves presets and image picker assets", () => {
    expect(defaultPresetSelection()).toEqual({
      identifier: PRESET_IDENTIFIERS.TWITTER,
      length: DEFAULT_LENGTHS.TWITTER
    });
    expect(presetLengthForIdentifier(PRESET_IDENTIFIERS.BLUESKY)).toBe(DEFAULT_LENGTHS.BLUESKY);
    expect(presetLengthForIdentifier("missing")).toBeNull();
    expect(firstSelectedImageAsset(null)).toBeNull();
    expect(firstSelectedImageAsset({
      canceled: true,
      assets: [{ uri: "file:///cancelled.png", base64: IMAGE_CLIPBOARD_BASE64 }]
    })).toBeNull();
    expect(firstSelectedImageAsset({ canceled: false })).toBeNull();
    expect(firstSelectedImageAsset({ canceled: false, assets: [] })).toBeNull();
    expect(firstSelectedImageAsset({
      canceled: false,
      assets: [{ uri: "file:///selected.png", base64: IMAGE_CLIPBOARD_BASE64 }]
    })).toEqual({
      uri: "file:///selected.png",
      base64: IMAGE_CLIPBOARD_BASE64
    });
  });

  it("interpolates unknown tokens conservatively", () => {
    expect(interpolateMobileTemplate("Copied #{ORDER} {UNKNOWN}", { ORDER: 4 })).toBe("Copied #4 {UNKNOWN}");
  });
});
