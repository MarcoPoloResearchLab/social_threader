// @ts-check
import React, { createContext, useContext, useMemo, useState } from "react";
import {
  Linking,
  ScrollView,
  Share,
  Text,
  TextInput,
  View
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { StatusBar } from "expo-status-bar";

import {
  DEFAULT_LENGTHS,
  MOBILE_ACCESSIBILITY_LABELS,
  MOBILE_COPY,
  MOBILE_EXTERNAL_URLS,
  MOBILE_TEST_IDS,
  PRESET_CONFIG,
  PRESET_IDENTIFIERS
} from "./src/constants.js";
import { ControlButton } from "./src/ControlButton.js";
import { screenStyles as styles } from "./src/screenStyles.js";
import { ThreadTimeline } from "./src/ThreadTimeline.js";
import { ToggleRow } from "./src/ToggleRow.js";
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
  parsePositiveLength,
  presetLengthForIdentifier,
  updateImageRecordOffsets
} from "./src/threaderModel.js";

const IMAGE_PICKER_OPTIONS = Object.freeze({
  mediaTypes: ImagePicker.MediaTypeOptions.Images,
  allowsMultipleSelection: false,
  base64: true,
  quality: 1
});

const defaultDependencies = Object.freeze({
  clipboard: Clipboard,
  imagePicker: ImagePicker,
  linking: Linking,
  share: Share.share
});

const DependenciesContext = createContext(defaultDependencies);

export default function App({ dependencies = null }) {
  const resolvedDependencies = useMemo(
    () => ({
      ...defaultDependencies,
      ...(dependencies || {})
    }),
    [dependencies]
  );

  return (
    <DependenciesContext.Provider value={resolvedDependencies}>
      <ThreaderScreen />
    </DependenciesContext.Provider>
  );
}

function useDependencies() {
  return useContext(DependenciesContext);
}

/**
 * @param {string} textValue Source text entered by the user.
 * @returns {boolean} Whether text-specific options should be available.
 */
function hasTextContent(textValue) {
  return textValue.trim().length > 0;
}

function ThreaderScreen() {
  const dependencies = useDependencies();
  const defaultPreset = defaultPresetSelection();
  const [sourceText, setSourceText] = useState("");
  const [imageRecords, setImageRecords] = useState([]);
  const [activePresetIdentifier, setActivePresetIdentifier] = useState(defaultPreset.identifier);
  const [maximumLength, setMaximumLength] = useState(defaultPreset.length);
  const [customLengthText, setCustomLengthText] = useState(String(DEFAULT_LENGTHS.CUSTOM));
  const [breakOnParagraphs, setBreakOnParagraphs] = useState(false);
  const [breakOnSentences, setBreakOnSentences] = useState(false);
  const [enumerate, setEnumerate] = useState(false);
  const [copiedChunkOrders, setCopiedChunkOrders] = useState({});
  const [errorMessage, setErrorMessage] = useState("");

  const inputStatistics = useMemo(() => calculateInputStatistics(sourceText), [sourceText]);
  const textOptionTogglesEnabled = hasTextContent(sourceText);
  const paragraphToggleEnabled = textOptionTogglesEnabled && canBreakOnParagraphs(inputStatistics);
  const displayedInputStatistics = formatInputStatistics(inputStatistics);
  const chunks = useMemo(
    () =>
      buildMobileChunks({
        sourceText,
        imageRecords,
        maximumLength,
        breakOnSentences: textOptionTogglesEnabled && breakOnSentences,
        enumerate: textOptionTogglesEnabled && enumerate,
        breakOnParagraphs: paragraphToggleEnabled && breakOnParagraphs
      }),
    [
      breakOnParagraphs,
      breakOnSentences,
      enumerate,
      imageRecords,
      maximumLength,
      paragraphToggleEnabled,
      sourceText,
      textOptionTogglesEnabled
    ]
  );

  const resetCopiedChunkOrders = () => {
    setCopiedChunkOrders({});
  };

  const handleSourceTextChange = (nextSourceText) => {
    setImageRecords((currentImageRecords) =>
      updateImageRecordOffsets(sourceText, nextSourceText, currentImageRecords)
    );
    setSourceText(nextSourceText);
    resetCopiedChunkOrders();
    const nextStatistics = calculateInputStatistics(nextSourceText);
    const nextTextOptionTogglesEnabled = hasTextContent(nextSourceText);
    if (!nextTextOptionTogglesEnabled) {
      setBreakOnParagraphs(false);
      setBreakOnSentences(false);
      setEnumerate(false);
    } else if (!canBreakOnParagraphs(nextStatistics)) {
      setBreakOnParagraphs(false);
    }
    setErrorMessage("");
  };

  const handlePresetPress = (presetIdentifier) => {
    const nextLength = presetLengthForIdentifier(presetIdentifier);
    setActivePresetIdentifier(presetIdentifier);
    setMaximumLength(nextLength);
    resetCopiedChunkOrders();
    setErrorMessage(hasThreadContent(sourceText, imageRecords) ? "" : MOBILE_COPY.ERROR_NO_CONTENT);
  };

  const handleCustomApplyPress = () => {
    const customLength = parsePositiveLength(customLengthText);
    if (customLength === null) {
      setErrorMessage(MOBILE_COPY.ERROR_INVALID_CUSTOM);
      return;
    }
    setActivePresetIdentifier(null);
    setMaximumLength(customLength);
    resetCopiedChunkOrders();
    setErrorMessage(hasThreadContent(sourceText, imageRecords) ? "" : MOBILE_COPY.ERROR_NO_CONTENT);
  };

  const handleAttachImagePress = async () => {
    try {
      const pickerResult = await dependencies.imagePicker.launchImageLibraryAsync(IMAGE_PICKER_OPTIONS);
      const selectedImageAsset = firstSelectedImageAsset(pickerResult);
      if (!selectedImageAsset) {
        return;
      }
      const imageRecord = createImageRecord(selectedImageAsset, imageRecords.length, sourceText.length);
      if (!imageRecord) {
        setErrorMessage(MOBILE_COPY.ERROR_IMAGE_PICK_FAILED);
        return;
      }
      setImageRecords((currentImageRecords) => [...currentImageRecords, imageRecord]);
      resetCopiedChunkOrders();
      setErrorMessage("");
    } catch (caughtError) {
      setErrorMessage(MOBILE_COPY.ERROR_IMAGE_PICK_FAILED);
    }
  };

  const markChunkCopied = (chunkId) => {
    setCopiedChunkOrders((currentOrders) => {
      if (currentOrders[chunkId]) {
        return currentOrders;
      }
      return {
        ...currentOrders,
        [chunkId]: resolveNextCopiedOrder(currentOrders)
      };
    });
    setErrorMessage("");
  };

  const handleCopyChunkPress = async (chunk) => {
    try {
      if (chunk.variant === "image") {
        await dependencies.clipboard.setImageAsync(chunk.imageBase64);
      } else {
        await dependencies.clipboard.setStringAsync(chunk.plainText);
      }
      markChunkCopied(chunk.id);
    } catch (caughtError) {
      setErrorMessage(MOBILE_COPY.ERROR_COPY_FAILED);
    }
  };

  const handleShareThreadPress = async () => {
    const shareMessage = createThreadShareMessage(chunks);
    if (shareMessage.length === 0) {
      setErrorMessage(MOBILE_COPY.ERROR_NO_CONTENT);
      return;
    }
    try {
      await dependencies.share({ message: shareMessage });
      setErrorMessage("");
    } catch (caughtError) {
      setErrorMessage(MOBILE_COPY.ERROR_SHARE_FAILED);
    }
  };

  const handleClearPress = () => {
    setSourceText("");
    setImageRecords([]);
    setBreakOnParagraphs(false);
    setBreakOnSentences(false);
    setEnumerate(false);
    setCopiedChunkOrders({});
    setErrorMessage("");
  };

  const handleBuiltByLinkPress = async () => {
    try {
      await dependencies.linking.openURL(MOBILE_EXTERNAL_URLS.MPR_LAB);
      setErrorMessage("");
    } catch (caughtError) {
      setErrorMessage(MOBILE_COPY.ERROR_OPEN_MPR_LAB_FAILED);
    }
  };

  const handleRemoveImagePress = (imageIndex) => {
    setImageRecords((currentImageRecords) =>
      currentImageRecords.filter((_imageRecord, currentIndex) => currentIndex !== imageIndex)
    );
    resetCopiedChunkOrders();
  };

  const handleBreakOnParagraphsChange = (nextBreakOnParagraphs) => {
    setBreakOnParagraphs(nextBreakOnParagraphs);
    resetCopiedChunkOrders();
  };

  const handleBreakOnSentencesChange = (nextBreakOnSentences) => {
    setBreakOnSentences(nextBreakOnSentences);
    resetCopiedChunkOrders();
  };

  const handleEnumerateChange = (nextEnumerate) => {
    setEnumerate(nextEnumerate);
    resetCopiedChunkOrders();
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{MOBILE_COPY.APP_TITLE}</Text>
          <Text style={styles.description}>{MOBILE_COPY.PRIMARY_DESCRIPTION}</Text>
        </View>

        <TextInput
          testID={MOBILE_TEST_IDS.SOURCE_INPUT}
          multiline
          value={sourceText}
          onChangeText={handleSourceTextChange}
          placeholder={MOBILE_COPY.INPUT_PLACEHOLDER}
          style={styles.sourceInput}
          textAlignVertical="top"
        />
        <Text testID={MOBILE_TEST_IDS.INPUT_STATS} style={styles.statsText}>
          {displayedInputStatistics}
        </Text>

        <View style={styles.presetRow}>
          {Object.values(PRESET_IDENTIFIERS).map((presetIdentifier) => (
            <ControlButton
              key={presetIdentifier}
              label={PRESET_CONFIG[presetIdentifier].label}
              accessibilityLabel={PRESET_CONFIG[presetIdentifier].label}
              active={activePresetIdentifier === presetIdentifier}
              onPress={() => handlePresetPress(presetIdentifier)}
            />
          ))}
        </View>

        <View testID={MOBILE_TEST_IDS.CUSTOM_ROW} style={styles.customRow}>
          <ControlButton
            label={MOBILE_COPY.CUSTOM_BUTTON_LABEL}
            accessibilityLabel={MOBILE_ACCESSIBILITY_LABELS.CUSTOM_APPLY}
            active={activePresetIdentifier === null}
            onPress={handleCustomApplyPress}
            style={styles.customButton}
          />
          <TextInput
            testID={MOBILE_TEST_IDS.CUSTOM_LENGTH_INPUT}
            value={customLengthText}
            onChangeText={setCustomLengthText}
            keyboardType="number-pad"
            placeholder={MOBILE_COPY.CUSTOM_LENGTH_PLACEHOLDER}
            style={styles.customInput}
          />
        </View>

        <View style={styles.togglePanel}>
          <ToggleRow
            label={MOBILE_COPY.PARAGRAPH_TOGGLE_LABEL}
            accessibilityLabel={MOBILE_ACCESSIBILITY_LABELS.BREAK_ON_PARAGRAPHS}
            value={paragraphToggleEnabled && breakOnParagraphs}
            disabled={!paragraphToggleEnabled}
            onValueChange={handleBreakOnParagraphsChange}
          />
          <ToggleRow
            label={MOBILE_COPY.SENTENCE_TOGGLE_LABEL}
            accessibilityLabel={MOBILE_ACCESSIBILITY_LABELS.BREAK_ON_SENTENCES}
            value={textOptionTogglesEnabled && breakOnSentences}
            disabled={!textOptionTogglesEnabled}
            onValueChange={handleBreakOnSentencesChange}
          />
          <ToggleRow
            label={MOBILE_COPY.ENUMERATION_TOGGLE_LABEL}
            accessibilityLabel={MOBILE_ACCESSIBILITY_LABELS.ENUMERATE}
            value={textOptionTogglesEnabled && enumerate}
            disabled={!textOptionTogglesEnabled}
            onValueChange={handleEnumerateChange}
          />
        </View>

        <View style={styles.actionRow}>
          <ControlButton
            label={MOBILE_COPY.ATTACH_IMAGE_LABEL}
            accessibilityLabel={MOBILE_COPY.ATTACH_IMAGE_LABEL}
            onPress={handleAttachImagePress}
            testID={MOBILE_TEST_IDS.ATTACH_IMAGE_BUTTON}
          />
          <ControlButton
            label={MOBILE_COPY.SHARE_THREAD_LABEL}
            accessibilityLabel={MOBILE_COPY.SHARE_THREAD_LABEL}
            onPress={handleShareThreadPress}
            testID={MOBILE_TEST_IDS.SHARE_THREAD_BUTTON}
          />
          <ControlButton
            label={MOBILE_COPY.CLEAR_BUTTON_LABEL}
            accessibilityLabel={MOBILE_COPY.CLEAR_BUTTON_LABEL}
            onPress={handleClearPress}
            testID={MOBILE_TEST_IDS.CLEAR_BUTTON}
          />
        </View>

        {errorMessage ? (
          <Text testID={MOBILE_TEST_IDS.ERROR_MESSAGE} style={styles.errorText}>
            {errorMessage}
          </Text>
        ) : null}

        <ThreadTimeline
          chunks={chunks}
          copiedChunkOrders={copiedChunkOrders}
          onCopyChunkPress={handleCopyChunkPress}
          onRemoveImagePress={handleRemoveImagePress}
        />

        <View style={styles.footer}>
          <Text testID={MOBILE_TEST_IDS.BUILT_BY_LINE} style={styles.builtByLine}>
            {MOBILE_COPY.BUILT_BY_PREFIX}
            <Text
              testID={MOBILE_TEST_IDS.BUILT_BY_LINK}
              accessibilityRole="link"
              accessibilityLabel={MOBILE_ACCESSIBILITY_LABELS.MPR_LAB_LINK}
              style={styles.builtByLink}
              onPress={handleBuiltByLinkPress}
            >
              {MOBILE_COPY.MPR_LAB_NAME}
            </Text>
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function resolveNextCopiedOrder(currentOrders) {
  return Object.values(currentOrders).reduce(
    (highestCopiedOrder, copiedOrder) => Math.max(highestCopiedOrder, copiedOrder),
    0
  ) + 1;
}
