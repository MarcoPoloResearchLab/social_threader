import React from "react";
import { StyleSheet } from "react-native";
import { act, create } from "react-test-renderer";
import App from "../App";
import {
  MOBILE_ACCESSIBILITY_LABELS,
  MOBILE_COPY,
  MOBILE_TEST_IDS,
  LAYOUT_VALUES,
  PRESET_CONFIG,
  PRESET_IDENTIFIERS
} from "../src/constants";

describe("Social Threader mobile app", () => {
  it("renders default Twitter chunks, toggles options, copies text, shares the thread, and clears state", async () => {
    const dependencies = createDependencies();
    const component = renderApp(dependencies);

    changeText(component, MOBILE_TEST_IDS.SOURCE_INPUT, "Alpha bravo charlie delta echo.");
    expect(findText(component, "Characters: 31 | Words: 5 | Sentences: 1 | Paragraphs: 1")).toBeTruthy();

    press(component, PRESET_CONFIG[PRESET_IDENTIFIERS.BLUESKY].label);
    toggle(component, MOBILE_ACCESSIBILITY_LABELS.ENUMERATE, true);
    toggle(component, MOBILE_ACCESSIBILITY_LABELS.BREAK_ON_SENTENCES, true);
    changeText(component, MOBILE_TEST_IDS.CUSTOM_LENGTH_INPUT, "12");
    press(component, MOBILE_ACCESSIBILITY_LABELS.CUSTOM_APPLY);

    expect(findText(component, "Alpha (1/6)")).toBeTruthy();
    expect(findByTestID(component, `${MOBILE_TEST_IDS.THREAD_CHUNK_MARKER_PREFIX}-text-0`)).toBeTruthy();
    expect(markerAccessibilityLabel(component, "text-0")).toBe("Chunk text-0 not copied");
    expect(findMarkerOrder(component, "text-0", 1)).toBeNull();
    expect(lineBackgroundColor(component, `${MOBILE_TEST_IDS.THREAD_CHUNK_TOP_LINE_PREFIX}-text-0`)).toBe("transparent");
    expect(lineBackgroundColor(component, `${MOBILE_TEST_IDS.THREAD_CHUNK_BOTTOM_LINE_PREFIX}-text-0`)).toBe("#cbd5e1");
    expect(lineBackgroundColor(component, `${MOBILE_TEST_IDS.THREAD_CHUNK_TOP_LINE_PREFIX}-text-1`)).toBe("#cbd5e1");
    expect(lineBackgroundColor(component, `${MOBILE_TEST_IDS.THREAD_CHUNK_BOTTOM_LINE_PREFIX}-text-5`)).toBe("transparent");

    await pressAsync(component, "Copy text-0");
    expect(dependencies.clipboard.setStringAsync).toHaveBeenCalledWith("Alpha (1/6)");
    expect(markerAccessibilityLabel(component, "text-0")).toBe("Chunk text-0 copied #1");
    expect(findMarkerOrder(component, "text-0", 1)).toBeTruthy();
    expect(findText(component, "Copied #1")).toBeNull();

    await pressAsync(component, "Copy text-0");
    expect(dependencies.clipboard.setStringAsync).toHaveBeenLastCalledWith("Alpha (1/6)");
    expect(markerAccessibilityLabel(component, "text-0")).toBe("Chunk text-0 copied #1");
    expect(findMarkerOrder(component, "text-0", 1)).toBeTruthy();

    await pressAsync(component, "Copy text-1");
    expect(dependencies.clipboard.setStringAsync).toHaveBeenLastCalledWith("bravo (2/6)");
    expect(findMarkerOrder(component, "text-1", 2)).toBeTruthy();

    await pressAsync(component, MOBILE_COPY.SHARE_THREAD_LABEL);
    expect(dependencies.share).toHaveBeenCalledWith({
      message: "Alpha (1/6)\n\nbravo (2/6)\n\ncharli (3/6)\n\ne (4/6)\n\ndelta (5/6)\n\necho. (6/6)"
    });

    press(component, MOBILE_COPY.CLEAR_BUTTON_LABEL);
    expect(findText(component, MOBILE_COPY.INPUT_STATS_EMPTY)).toBeTruthy();
    expect(findByTestID(component, `${MOBILE_TEST_IDS.THREAD_CHUNK_MARKER_PREFIX}-text-0`)).toBeNull();
  });

  it("enables paragraph splitting only for multi-paragraph input", () => {
    const component = renderApp(createDependencies());

    const paragraphSwitch = findSwitch(component, MOBILE_ACCESSIBILITY_LABELS.BREAK_ON_PARAGRAPHS);
    expect(paragraphSwitch.props.disabled).toBe(true);
    const switchStyle = StyleSheet.flatten(findToggleTrack(component, MOBILE_ACCESSIBILITY_LABELS.BREAK_ON_PARAGRAPHS).props.style);
    expect(switchStyle.width).toBe(LAYOUT_VALUES.TOGGLE_TRACK_WIDTH);
    expect(switchStyle.height).toBe(LAYOUT_VALUES.TOGGLE_TRACK_HEIGHT);

    changeText(component, MOBILE_TEST_IDS.SOURCE_INPUT, "First paragraph.\n\nSecond paragraph.");
    const enabledParagraphSwitch = findSwitch(component, MOBILE_ACCESSIBILITY_LABELS.BREAK_ON_PARAGRAPHS);
    expect(enabledParagraphSwitch.props.disabled).toBe(false);

    toggle(component, MOBILE_ACCESSIBILITY_LABELS.BREAK_ON_PARAGRAPHS, true);
    expect(findText(component, "First paragraph.")).toBeTruthy();
    const activeSwitch = findSwitch(component, MOBILE_ACCESSIBILITY_LABELS.BREAK_ON_PARAGRAPHS);
    expect(activeSwitch.props.accessibilityState.checked).toBe(true);

    changeText(component, MOBILE_TEST_IDS.SOURCE_INPUT, "Single paragraph.");
    const disabledParagraphSwitch = findSwitch(component, MOBILE_ACCESSIBILITY_LABELS.BREAK_ON_PARAGRAPHS);
    expect(disabledParagraphSwitch.props.disabled).toBe(true);
  });

  it("surfaces empty and invalid custom input errors", () => {
    const component = renderApp(createDependencies());

    changeText(component, MOBILE_TEST_IDS.SOURCE_INPUT, "");
    press(component, PRESET_CONFIG[PRESET_IDENTIFIERS.THREADS].label);
    expect(findText(component, MOBILE_COPY.ERROR_NO_CONTENT)).toBeTruthy();

    changeText(component, MOBILE_TEST_IDS.CUSTOM_LENGTH_INPUT, "bad");
    press(component, MOBILE_ACCESSIBILITY_LABELS.CUSTOM_APPLY);
    expect(findText(component, MOBILE_COPY.ERROR_INVALID_CUSTOM)).toBeTruthy();
    expect(pressableStyle(component, MOBILE_ACCESSIBILITY_LABELS.CUSTOM_APPLY).flex).toBe(1);
    expect(textInputStyle(component, MOBILE_TEST_IDS.CUSTOM_LENGTH_INPUT).width).toBe(
      LAYOUT_VALUES.CUSTOM_INPUT_WIDTH
    );

    changeText(component, MOBILE_TEST_IDS.CUSTOM_LENGTH_INPUT, "64");
    press(component, MOBILE_ACCESSIBILITY_LABELS.CUSTOM_APPLY);
    expect(findText(component, MOBILE_COPY.ERROR_NO_CONTENT)).toBeTruthy();
  });

  it("handles attaching, sharing, and removing an image chunk", async () => {
    const dependencies = createDependencies();
    dependencies.imagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///tmp/share.png", fileName: "share.png" }]
    });
    const component = renderApp(dependencies);

    await pressAsync(component, MOBILE_COPY.ATTACH_IMAGE_LABEL);
    expect(findText(component, MOBILE_COPY.IMAGE_CHUNK_LABEL)).toBeTruthy();

    await pressAsync(component, "Copy image-0");
    expect(dependencies.share).toHaveBeenCalledWith({
      url: "file:///tmp/share.png",
      message: "share.png"
    });
    expect(findMarkerOrder(component, "image-0", 1)).toBeTruthy();

    press(component, `${MOBILE_COPY.REMOVE_IMAGE_LABEL} share.png`);
    expect(findText(component, MOBILE_COPY.IMAGE_CHUNK_LABEL)).toBeNull();
  });

  it("ignores cancelled image picker results and reports invalid image assets", async () => {
    const dependencies = createDependencies();
    dependencies.imagePicker.launchImageLibraryAsync
      .mockResolvedValueOnce({ canceled: true, assets: [] })
      .mockResolvedValueOnce({ canceled: false, assets: [{ uri: "" }] });
    const component = renderApp(dependencies);

    await pressAsync(component, MOBILE_COPY.ATTACH_IMAGE_LABEL);
    expect(findText(component, MOBILE_COPY.IMAGE_CHUNK_LABEL)).toBeNull();

    await pressAsync(component, MOBILE_COPY.ATTACH_IMAGE_LABEL);
    expect(findText(component, MOBILE_COPY.ERROR_IMAGE_PICK_FAILED)).toBeTruthy();
  });

  it("reports image picker, copy, and share failures", async () => {
    const dependencies = createDependencies();
    dependencies.imagePicker.launchImageLibraryAsync
      .mockRejectedValueOnce(new Error("picker_down"))
      .mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///tmp/image.png", fileName: "image.png" }] });
    dependencies.clipboard.setStringAsync.mockRejectedValueOnce(new Error("clipboard_down"));
    dependencies.share.mockRejectedValueOnce(new Error("share_down"));
    const component = renderApp(dependencies);

    await pressAsync(component, MOBILE_COPY.ATTACH_IMAGE_LABEL);
    expect(findText(component, MOBILE_COPY.ERROR_IMAGE_PICK_FAILED)).toBeTruthy();

    changeText(component, MOBILE_TEST_IDS.SOURCE_INPUT, "Alpha text.");
    await pressAsync(component, "Copy text-0");
    expect(findText(component, MOBILE_COPY.ERROR_COPY_FAILED)).toBeTruthy();

    await pressAsync(component, MOBILE_COPY.ATTACH_IMAGE_LABEL);
    await pressAsync(component, "Copy image-0");
    expect(findText(component, MOBILE_COPY.ERROR_SHARE_FAILED)).toBeTruthy();
  });

  it("reports share thread failures and empty share attempts", async () => {
    const dependencies = createDependencies();
    dependencies.share.mockRejectedValueOnce(new Error("share_down"));
    const component = renderApp(dependencies);

    await pressAsync(component, MOBILE_COPY.SHARE_THREAD_LABEL);
    expect(findText(component, MOBILE_COPY.ERROR_NO_CONTENT)).toBeTruthy();

    changeText(component, MOBILE_TEST_IDS.SOURCE_INPUT, "Alpha text.");
    await pressAsync(component, MOBILE_COPY.SHARE_THREAD_LABEL);
    expect(findText(component, MOBILE_COPY.ERROR_SHARE_FAILED)).toBeTruthy();
  });

  it("uses default dependencies when none are injected", () => {
    const component = renderDefaultApp();
    expect(component.root.findByProps({ testID: MOBILE_TEST_IDS.SOURCE_INPUT })).toBeTruthy();
  });
});

function createDependencies() {
  return {
    clipboard: {
      setStringAsync: jest.fn(() => Promise.resolve(true))
    },
    imagePicker: {
      MediaTypeOptions: {
        Images: "Images"
      },
      launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: [] }))
    },
    share: jest.fn(() => Promise.resolve({ action: "sharedAction" }))
  };
}

function renderApp(dependencies) {
  let component;
  act(() => {
    component = create(<App dependencies={dependencies} />);
  });
  return component;
}

function renderDefaultApp() {
  let component;
  act(() => {
    component = create(<App />);
  });
  return component;
}

function findPressable(component, accessibilityLabel) {
  return component.root.findAll((node) => (
    node.props?.accessibilityRole === "button"
    && node.props?.accessibilityLabel === accessibilityLabel
    && typeof node.props?.onPress === "function"
  ))[0];
}

function pressableStyle(component, accessibilityLabel) {
  return StyleSheet.flatten(findPressable(component, accessibilityLabel).props.style);
}

function textInputStyle(component, testID) {
  const input = component.root.findAll((node) => node.props?.testID === testID)[0];
  return StyleSheet.flatten(input.props.style);
}

function press(component, accessibilityLabel) {
  const pressable = findPressable(component, accessibilityLabel);
  act(() => {
    pressable.props.onPress();
  });
}

async function pressAsync(component, accessibilityLabel) {
  const pressable = findPressable(component, accessibilityLabel);
  await act(async () => {
    await pressable.props.onPress();
  });
}

function changeText(component, testID, nextText) {
  const input = component.root.findAll((node) => (
    node.props?.testID === testID
    && typeof node.props?.onChangeText === "function"
  ))[0];
  act(() => {
    input.props.onChangeText(nextText);
  });
}

function findSwitch(component, accessibilityLabel) {
  return component.root.findAll((node) => (
    node.props?.accessibilityLabel === accessibilityLabel
    && node.props?.accessibilityRole === "switch"
    && typeof node.props?.onPress === "function"
  ))[0];
}

function toggle(component, accessibilityLabel, nextValue) {
  const switchControl = findSwitch(component, accessibilityLabel);
  act(() => {
    if (switchControl.props.accessibilityState.checked !== nextValue) {
      switchControl.props.onPress();
    }
  });
}

function findByTestID(component, testID) {
  return component.root.findAll((node) => node.props?.testID === testID)[0] || null;
}

function findToggleTrack(component, accessibilityLabel) {
  return findByTestID(component, `${MOBILE_TEST_IDS.TOGGLE_TRACK_PREFIX}-${accessibilityLabel}`);
}

function findText(component, expectedText) {
  return component.root.findAll((node) => node.props.children === expectedText)[0] || null;
}

function findMarkerOrder(component, chunkId, expectedOrder) {
  const marker = findByTestID(component, `${MOBILE_TEST_IDS.THREAD_CHUNK_MARKER_PREFIX}-${chunkId}`);
  if (!marker) {
    return null;
  }
  return marker.findAll((node) => node.props?.children === expectedOrder)[0] || null;
}

function markerAccessibilityLabel(component, chunkId) {
  const marker = findByTestID(component, `${MOBILE_TEST_IDS.THREAD_CHUNK_MARKER_PREFIX}-${chunkId}`);
  return marker?.props.accessibilityLabel || null;
}

function lineBackgroundColor(component, testID) {
  const line = findByTestID(component, testID);
  return StyleSheet.flatten(line.props.style).backgroundColor;
}
