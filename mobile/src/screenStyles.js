// @ts-check
import { StyleSheet } from "react-native";

import { LAYOUT_VALUES } from "./constants.js";

export const screenStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#ffffff"
  },
  content: {
    padding: LAYOUT_VALUES.SCREEN_PADDING,
    gap: LAYOUT_VALUES.SECTION_GAP
  },
  header: {
    gap: LAYOUT_VALUES.CONTROL_GAP
  },
  title: {
    fontSize: LAYOUT_VALUES.TITLE_FONT_SIZE,
    fontWeight: "700",
    color: "#111827"
  },
  description: {
    fontSize: LAYOUT_VALUES.BODY_FONT_SIZE,
    color: "#374151"
  },
  sourceInput: {
    minHeight: LAYOUT_VALUES.INPUT_MIN_HEIGHT,
    borderWidth: 1,
    borderColor: "#9ca3af",
    borderRadius: LAYOUT_VALUES.CARD_RADIUS,
    padding: LAYOUT_VALUES.CARD_PADDING,
    fontSize: LAYOUT_VALUES.BODY_FONT_SIZE,
    backgroundColor: "#f9fafb",
    color: "#111827"
  },
  statsText: {
    fontSize: LAYOUT_VALUES.STAT_FONT_SIZE,
    color: "#4b5563"
  },
  presetRow: {
    gap: LAYOUT_VALUES.CONTROL_GAP
  },
  customRow: {
    flexDirection: "row",
    gap: LAYOUT_VALUES.CONTROL_GAP,
    alignItems: "center"
  },
  customInput: {
    width: LAYOUT_VALUES.CUSTOM_INPUT_WIDTH,
    height: LAYOUT_VALUES.BUTTON_HEIGHT,
    borderWidth: 1,
    borderColor: "#9ca3af",
    borderRadius: LAYOUT_VALUES.BUTTON_RADIUS,
    paddingHorizontal: LAYOUT_VALUES.CONTROL_GAP,
    fontSize: LAYOUT_VALUES.BODY_FONT_SIZE,
    backgroundColor: "#ffffff"
  },
  customButton: {
    flex: 1
  },
  togglePanel: {
    gap: LAYOUT_VALUES.CONTROL_GAP
  },
  actionRow: {
    gap: LAYOUT_VALUES.CONTROL_GAP
  },
  errorText: {
    color: "#b91c1c",
    fontSize: LAYOUT_VALUES.SMALL_FONT_SIZE
  }
});
