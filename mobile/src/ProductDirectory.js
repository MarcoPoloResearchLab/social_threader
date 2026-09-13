// @ts-check
import React, { useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Modal, Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';
import catalog from './shared-web/product-catalog.json';
import { createProductMenu } from './shared-web/core/productCatalog.js';
import { MOBILE_COPY } from './constants.js';
import { directoryStyles as styles } from './directoryStyles.js';

const MENU = createProductMenu(catalog);
const STATIC_SECTION = 'static';
const EXPANDED_SECTION = 'expanded';

/** Guest product directory; browser navigation leaves the editor mounted.
 * @param {{linking: {openURL: (href: string) => Promise<unknown>}}} props
 */
export function ProductDirectory({ linking }) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});
  const [errorMessage, setErrorMessage] = useState('');
  const triggerRef = useRef(null);

  function restoreFocus() {
    AccessibilityInfo.setAccessibilityFocus(findNodeHandle(triggerRef.current));
  }

  function handleOpen() {
    setExpandedSections(Object.fromEntries(MENU.sections.map(section => [section.id, section.mode === EXPANDED_SECTION])));
    setErrorMessage('');
    setIsOpen(true);
  }

  function handleClose() {
    setIsOpen(false);
    restoreFocus();
  }

  async function handleLinkPress(href) {
    setErrorMessage('');
    try {
      await linking.openURL(href);
      handleClose();
    } catch {
      setErrorMessage(MOBILE_COPY.DIRECTORY_ERROR);
    }
  }

  function handleSectionPress(sectionId) {
    setExpandedSections(current => ({ ...current, [sectionId]: !current[sectionId] }));
  }

  return (
    <>
      <Pressable ref={triggerRef} accessibilityRole="button" accessibilityLabel={MENU.label}
        accessibilityState={{ expanded: isOpen }} onPress={handleOpen} style={styles.control}>
        <Text style={styles.sectionLabel}>{MENU.label}</Text>
      </Pressable>
      <Modal visible={isOpen} transparent animationType="slide" onRequestClose={handleClose} onDismiss={restoreFocus}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} accessibilityRole="button" accessibilityLabel={MOBILE_COPY.DIRECTORY_CLOSE} onPress={handleClose} />
          <SafeAreaView style={styles.sheet} accessibilityViewIsModal onAccessibilityEscape={handleClose}>
            <Text accessibilityRole="header" style={styles.title}>{MENU.label}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={MOBILE_COPY.DIRECTORY_CLOSE} onPress={handleClose} style={styles.control}>
              <Text>{MOBILE_COPY.DIRECTORY_CLOSE}</Text>
            </Pressable>
            {errorMessage ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{errorMessage}</Text> : null}
            <ScrollView contentContainerStyle={styles.links}>
              {MENU.sections.map(section => (
                <View key={section.id}>
                  {section.mode === STATIC_SECTION ? null : (
                    <Pressable accessibilityRole="button" accessibilityLabel={section.label}
                      accessibilityState={{ expanded: expandedSections[section.id] }}
                      onPress={() => handleSectionPress(section.id)} style={styles.control}>
                      <Text style={styles.sectionLabel}>{section.label}</Text>
                    </Pressable>
                  )}
                  {section.mode === STATIC_SECTION || expandedSections[section.id] ? section.links.map(link => (
                    <Pressable key={link.label} accessibilityRole="link" accessibilityLabel={link.label}
                      onPress={() => handleLinkPress(link.href)} style={styles.control}>
                      <Text style={styles.link}>{link.label}</Text>
                    </Pressable>
                  )) : null}
                </View>
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}
