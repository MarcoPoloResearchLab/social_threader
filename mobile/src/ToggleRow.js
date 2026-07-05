// @ts-check
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { LAYOUT_VALUES, MOBILE_TEST_IDS } from "./constants.js";

export function ToggleRow({ label, accessibilityLabel, value, onValueChange, disabled = false }) {
  return (
    <View style={[styles.toggleRow, disabled && styles.toggleRowDisabled]}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ checked: value, disabled }}
        disabled={disabled}
        onPress={() => onValueChange(!value)}
        onValueChange={onValueChange}
      >
        <View
          testID={`${MOBILE_TEST_IDS.TOGGLE_TRACK_PREFIX}-${accessibilityLabel}`}
          style={[
            styles.toggleTrack,
            value && styles.toggleTrackActive,
            disabled && styles.toggleTrackDisabled
          ]}
        >
          <View style={[styles.toggleThumb, value && styles.toggleThumbActive]} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    minHeight: LAYOUT_VALUES.TOGGLE_ROW_HEIGHT,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: LAYOUT_VALUES.BUTTON_RADIUS,
    paddingHorizontal: LAYOUT_VALUES.CARD_PADDING,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  toggleRowDisabled: {
    opacity: 0.5
  },
  toggleLabel: {
    fontSize: LAYOUT_VALUES.BODY_FONT_SIZE,
    color: "#111827"
  },
  toggleTrack: {
    width: LAYOUT_VALUES.TOGGLE_TRACK_WIDTH,
    height: LAYOUT_VALUES.TOGGLE_TRACK_HEIGHT,
    borderRadius: LAYOUT_VALUES.TOGGLE_TRACK_HEIGHT / 2,
    padding: LAYOUT_VALUES.TOGGLE_TRACK_PADDING,
    backgroundColor: "#d1d5db",
    justifyContent: "center"
  },
  toggleTrackActive: {
    backgroundColor: "#2563eb"
  },
  toggleTrackDisabled: {
    backgroundColor: "#e5e7eb"
  },
  toggleThumb: {
    width: LAYOUT_VALUES.TOGGLE_THUMB_SIZE,
    height: LAYOUT_VALUES.TOGGLE_THUMB_SIZE,
    borderRadius: LAYOUT_VALUES.TOGGLE_THUMB_SIZE / 2,
    backgroundColor: "#ffffff"
  },
  toggleThumbActive: {
    marginLeft:
      LAYOUT_VALUES.TOGGLE_TRACK_WIDTH
      - LAYOUT_VALUES.TOGGLE_THUMB_SIZE
      - (LAYOUT_VALUES.TOGGLE_TRACK_PADDING * 2)
  }
});
