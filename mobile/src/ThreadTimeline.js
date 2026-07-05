// @ts-check
import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { ControlButton } from "./ControlButton.js";
import { LAYOUT_VALUES, MOBILE_COPY, MOBILE_TEST_IDS } from "./constants.js";
import { interpolateMobileTemplate } from "./threaderModel.js";

export function ThreadTimeline({ chunks, copiedChunkOrders, onCopyChunkPress, onRemoveImagePress }) {
  return (
    <View testID={MOBILE_TEST_IDS.THREAD_CHUNK_LIST} style={styles.timelineList}>
      {chunks.map((chunk, chunkIndex) => (
        <ThreadTimelineItem
          key={chunk.id}
          chunk={chunk}
          copiedOrder={copiedChunkOrders[chunk.id] || null}
          isFirst={chunkIndex === 0}
          isLast={chunkIndex === chunks.length - 1}
          onCopyPress={() => onCopyChunkPress(chunk)}
          onRemoveImagePress={onRemoveImagePress}
        />
      ))}
    </View>
  );
}

function ThreadTimelineItem({ chunk, copiedOrder, isFirst, isLast, onCopyPress, onRemoveImagePress }) {
  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineRail}>
        <View
          testID={`${MOBILE_TEST_IDS.THREAD_CHUNK_TOP_LINE_PREFIX}-${chunk.id}`}
          style={[styles.timelineTopLine, isFirst && styles.timelineLineHidden]}
        />
        <TimelineMarker chunkId={chunk.id} copiedOrder={copiedOrder} />
        <View
          testID={`${MOBILE_TEST_IDS.THREAD_CHUNK_BOTTOM_LINE_PREFIX}-${chunk.id}`}
          style={[styles.timelineBottomLine, isLast && styles.timelineLineHidden]}
        />
      </View>
      <View style={styles.timelineContent}>
        <ThreadChunkCard
          chunk={chunk}
          onCopyPress={onCopyPress}
          onRemoveImagePress={onRemoveImagePress}
        />
      </View>
    </View>
  );
}

function TimelineMarker({ chunkId, copiedOrder }) {
  const copied = copiedOrder !== null;
  const accessibilityLabel = interpolateMobileTemplate(
    copied ? MOBILE_COPY.TIMELINE_MARKER_COPIED_TEMPLATE : MOBILE_COPY.TIMELINE_MARKER_PENDING_TEMPLATE,
    {
      CHUNKID: chunkId,
      ORDER: copiedOrder || ""
    }
  );

  return (
    <View
      testID={`${MOBILE_TEST_IDS.THREAD_CHUNK_MARKER_PREFIX}-${chunkId}`}
      accessibilityLabel={accessibilityLabel}
      style={[styles.timelineMarker, copied && styles.timelineMarkerCopied]}
    >
      {copied ? <Text style={styles.timelineMarkerText}>{copiedOrder}</Text> : null}
    </View>
  );
}

function ThreadChunkCard({ chunk, onCopyPress, onRemoveImagePress }) {
  return (
    <View testID={`chunk-${chunk.id}`} style={styles.chunkCard}>
      {chunk.variant === "image" ? (
        <>
          <Text style={styles.chunkText}>{MOBILE_COPY.IMAGE_CHUNK_LABEL}</Text>
          <Image
            accessibilityLabel={chunk.altText}
            source={{ uri: chunk.imageUri }}
            style={styles.imagePreview}
          />
          <ControlButton
            label={MOBILE_COPY.REMOVE_IMAGE_LABEL}
            accessibilityLabel={`${MOBILE_COPY.REMOVE_IMAGE_LABEL} ${chunk.altText}`}
            onPress={() => onRemoveImagePress(Number.parseInt(chunk.id.replace("image-", ""), 10))}
          />
        </>
      ) : (
        <>
          <Text style={styles.chunkText}>{chunk.plainText}</Text>
          <Text style={styles.statsText}>{chunk.statisticsText}</Text>
        </>
      )}
      <ControlButton
        label={chunk.variant === "image" ? MOBILE_COPY.SHARE_BUTTON_LABEL : MOBILE_COPY.COPY_BUTTON_LABEL}
        accessibilityLabel={`${MOBILE_COPY.COPY_BUTTON_LABEL} ${chunk.id}`}
        onPress={onCopyPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  timelineList: {
    gap: 0
  },
  timelineItem: {
    flexDirection: "row",
    alignItems: "stretch"
  },
  timelineRail: {
    width: LAYOUT_VALUES.TIMELINE_RAIL_WIDTH,
    alignItems: "center"
  },
  timelineTopLine: {
    width: LAYOUT_VALUES.TIMELINE_LINE_WIDTH,
    height: LAYOUT_VALUES.TIMELINE_MARKER_TOP_OFFSET,
    backgroundColor: "#cbd5e1"
  },
  timelineBottomLine: {
    width: LAYOUT_VALUES.TIMELINE_LINE_WIDTH,
    flex: 1,
    minHeight: LAYOUT_VALUES.SECTION_GAP,
    backgroundColor: "#cbd5e1"
  },
  timelineLineHidden: {
    backgroundColor: "transparent"
  },
  timelineMarker: {
    width: LAYOUT_VALUES.TIMELINE_MARKER_SIZE,
    height: LAYOUT_VALUES.TIMELINE_MARKER_SIZE,
    borderRadius: LAYOUT_VALUES.TIMELINE_MARKER_SIZE / 2,
    borderWidth: 2,
    borderColor: "#2563eb",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center"
  },
  timelineMarkerCopied: {
    borderColor: "#16a34a",
    backgroundColor: "#16a34a"
  },
  timelineMarkerText: {
    color: "#ffffff",
    fontSize: LAYOUT_VALUES.STAT_FONT_SIZE,
    fontWeight: "700"
  },
  timelineContent: {
    flex: 1,
    paddingBottom: LAYOUT_VALUES.SECTION_GAP
  },
  statsText: {
    fontSize: LAYOUT_VALUES.STAT_FONT_SIZE,
    color: "#4b5563"
  },
  chunkCard: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: LAYOUT_VALUES.CARD_RADIUS,
    padding: LAYOUT_VALUES.CARD_PADDING,
    gap: LAYOUT_VALUES.CONTROL_GAP,
    backgroundColor: "#ffffff"
  },
  chunkText: {
    fontSize: LAYOUT_VALUES.BODY_FONT_SIZE,
    color: "#111827"
  },
  imagePreview: {
    width: "100%",
    height: LAYOUT_VALUES.IMAGE_PREVIEW_HEIGHT,
    borderRadius: LAYOUT_VALUES.BUTTON_RADIUS
  }
});
