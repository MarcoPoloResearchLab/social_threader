// @ts-check
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { LAYOUT_VALUES } from "./constants.js";

export function ControlButton({
  label,
  accessibilityLabel,
  onPress,
  active = false,
  testID = undefined,
  style = undefined
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.button, active && styles.buttonActive, style]}
      onPress={onPress}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: LAYOUT_VALUES.BUTTON_HEIGHT,
    borderRadius: LAYOUT_VALUES.BUTTON_RADIUS,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: LAYOUT_VALUES.CARD_PADDING
  },
  buttonActive: {
    backgroundColor: "#1e40af"
  },
  buttonText: {
    color: "#ffffff",
    fontSize: LAYOUT_VALUES.BODY_FONT_SIZE,
    fontWeight: "700"
  }
});
