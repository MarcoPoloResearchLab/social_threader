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
  presetLengthForIdentifier
} from "../src/threaderModel";
import {
  DEFAULT_LENGTHS,
  MOBILE_COPY,
  PRESET_IDENTIFIERS
} from "../src/constants";

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
    const imageRecord = createImageRecord({ uri: "file:///tmp/image.png", fileName: "draft.png" }, 0);
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
    expect(chunks[6].altText).toBe("draft.png");
  });

  it("creates image records and handles empty assets", () => {
    expect(createImageRecord({ uri: "  " }, 0)).toBeNull();
    expect(createImageRecord(null, 0)).toBeNull();
    const imageRecord = createImageRecord({ uri: "file:///tmp/image.png" }, 2);
    expect(imageRecord.placeholderToken).toBe("[[IMAGE:2]]");
    expect(imageRecord.altText).toBe(MOBILE_COPY.ATTACHED_IMAGE_ALT);
  });

  it("creates share messages and content flags", () => {
    expect(hasThreadContent("", [])).toBe(false);
    expect(hasThreadContent("  Alpha  ", [])).toBe(true);
    expect(hasThreadContent("", [{ placeholderToken: "[[IMAGE:0]]", dataUrl: "file:///image.png", altText: "Image" }])).toBe(true);
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
    expect(firstSelectedImageAsset({ canceled: true, assets: [{ uri: "file:///cancelled.png" }] })).toBeNull();
    expect(firstSelectedImageAsset({ canceled: false })).toBeNull();
    expect(firstSelectedImageAsset({ canceled: false, assets: [] })).toBeNull();
    expect(firstSelectedImageAsset({ canceled: false, assets: [{ uri: "file:///selected.png" }] })).toEqual({
      uri: "file:///selected.png"
    });
  });

  it("interpolates unknown tokens conservatively", () => {
    expect(interpolateMobileTemplate("Copied #{ORDER} {UNKNOWN}", { ORDER: 4 })).toBe("Copied #4 {UNKNOWN}");
  });
});
