// @ts-check
import React, { act } from "react";
import { StyleSheet } from "react-native";
import { createRoot } from "test-renderer";
import App from "../App";
import { MOBILE_TEST_IDS } from "../src/constants";

export const IMAGE_CLIPBOARD_BASE64 = "ZmFrZQ==";
export const IMAGE_CLIPBOARD_DATA_URL = `data:image/png;base64,${IMAGE_CLIPBOARD_BASE64}`;
export const IMAGE_CLIPBOARD_SIZE = Object.freeze({
  width: 1,
  height: 1
});

export function createDependencies() {
  let copiedImageBase64 = "";
  return {
    clipboard: {
      setStringAsync: jest.fn(() => Promise.resolve(true)),
      setImageAsync: jest.fn((imageBase64) => {
        copiedImageBase64 = imageBase64;
        return Promise.resolve();
      }),
      getImageAsync: jest.fn(() => Promise.resolve(
        copiedImageBase64.length > 0
          ? { data: `data:image/png;base64,${copiedImageBase64}`, size: IMAGE_CLIPBOARD_SIZE }
          : null
      ))
    },
    imagePicker: {
      MediaTypeOptions: {
        Images: "Images"
      },
      launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: [] }))
    },
    linking: {
      openURL: jest.fn(() => Promise.resolve(true))
    },
    share: jest.fn(() => Promise.resolve({ action: "sharedAction" }))
  };
}

export function renderApp(dependencies) {
  const component = createRoot();
  act(() => {
    component.render(<App dependencies={dependencies} />);
  });
  return component;
}

export function renderDefaultApp() {
  const component = createRoot();
  act(() => {
    component.render(<App />);
  });
  return component;
}

export function findPressable(component, accessibilityLabel) {
  return findAll(component, (node) => (
    node.props?.accessibilityRole === "button"
    && node.props?.accessibilityLabel === accessibilityLabel
    && typeof node.props?.onPress === "function"
  ))[0];
}

export function findLink(component, accessibilityLabel) {
  return findAll(component, (node) => (
    node.props?.accessibilityRole === "link"
    && node.props?.accessibilityLabel === accessibilityLabel
    && typeof node.props?.onPress === "function"
  ))[0];
}

export function pressableStyle(component, accessibilityLabel) {
  return StyleSheet.flatten(findPressable(component, accessibilityLabel).props.style);
}

export function textInputStyle(component, testID) {
  const input = findAll(component, (node) => node.props?.testID === testID)[0];
  return StyleSheet.flatten(input.props.style);
}

export function press(component, accessibilityLabel) {
  const pressable = findPressable(component, accessibilityLabel);
  act(() => {
    pressable.props.onPress();
  });
}

export async function pressAsync(component, accessibilityLabel) {
  const pressable = findPressable(component, accessibilityLabel);
  await act(async () => {
    await pressable.props.onPress();
  });
}

export async function pressLinkAsync(component, accessibilityLabel) {
  const link = findLink(component, accessibilityLabel);
  await act(async () => {
    await link.props.onPress();
  });
}

export function changeText(component, testID, nextText) {
  const input = findAll(component, (node) => (
    node.props?.testID === testID
    && typeof node.props?.onChangeText === "function"
  ))[0];
  act(() => {
    input.props.onChangeText(nextText);
  });
}

export function findSwitch(component, accessibilityLabel) {
  return findAll(component, (node) => (
    node.props?.accessibilityLabel === accessibilityLabel
    && node.props?.accessibilityRole === "switch"
    && typeof node.props?.onPress === "function"
  ))[0];
}

export function toggle(component, accessibilityLabel, nextValue) {
  const switchControl = findSwitch(component, accessibilityLabel);
  act(() => {
    if (switchControl.props.accessibilityState.checked !== nextValue) {
      switchControl.props.onPress();
    }
  });
}

export function findByTestID(component, testID) {
  return findAll(component, (node) => node.props?.testID === testID)[0] || null;
}

export function findToggleTrack(component, accessibilityLabel) {
  return findByTestID(component, `${MOBILE_TEST_IDS.TOGGLE_TRACK_PREFIX}-${accessibilityLabel}`);
}

export function findText(component, expectedText) {
  return findAll(component, (node) => node.props.children === expectedText)[0] || null;
}

export function findMarkerOrder(component, chunkId, expectedOrder) {
  const marker = findByTestID(component, `${MOBILE_TEST_IDS.THREAD_CHUNK_MARKER_PREFIX}-${chunkId}`);
  if (!marker) {
    return null;
  }
  return findAll(marker, (node) => node.props?.children === expectedOrder)[0] || null;
}

export function markerAccessibilityLabel(component, chunkId) {
  const marker = findByTestID(component, `${MOBILE_TEST_IDS.THREAD_CHUNK_MARKER_PREFIX}-${chunkId}`);
  return marker?.props.accessibilityLabel || null;
}

export function lineBackgroundColor(component, testID) {
  const line = findByTestID(component, testID);
  return StyleSheet.flatten(line.props.style).backgroundColor;
}

export function findAll(component, predicate) {
  const queryRoot = component.container || component;
  return queryRoot.queryAll(predicate);
}
