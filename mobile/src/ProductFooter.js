// @ts-check
import React from 'react';
import { Text, View } from 'react-native';
import { ProductDirectory } from './ProductDirectory.js';
import { MOBILE_ACCESSIBILITY_LABELS, MOBILE_COPY, MOBILE_EXTERNAL_URLS, MOBILE_TEST_IDS } from './constants.js';
import { screenStyles as styles } from './screenStyles.js';

/** Render product discovery and permanent application links.
 * @param {{linking: {openURL: (href: string) => Promise<unknown>}, onError: (message: string) => void}} props
 */
export function ProductFooter({ linking, onError }) {
  async function handleLinkPress(href, failureMessage) {
    try {
      await linking.openURL(href);
      onError('');
    } catch {
      onError(failureMessage);
    }
  }

  return (
    <View style={styles.footer}>
      <ProductDirectory linking={linking} />
      <Text testID={MOBILE_TEST_IDS.BUILT_BY_LINE} style={styles.builtByLine}>
        {MOBILE_COPY.BUILT_BY_PREFIX}
        <Text testID={MOBILE_TEST_IDS.BUILT_BY_LINK} accessibilityRole="link"
          accessibilityLabel={MOBILE_ACCESSIBILITY_LABELS.MPR_LAB_LINK} style={styles.builtByLink}
          onPress={() => handleLinkPress(MOBILE_EXTERNAL_URLS.MPR_LAB, MOBILE_COPY.ERROR_OPEN_MPR_LAB_FAILED)}>
          {MOBILE_COPY.MPR_LAB_NAME}
        </Text>
      </Text>
      <Text testID={MOBILE_TEST_IDS.PRIVACY_POLICY_LINK} accessibilityRole="link"
        accessibilityLabel={MOBILE_ACCESSIBILITY_LABELS.PRIVACY_POLICY_LINK} style={styles.builtByLink}
        onPress={() => handleLinkPress(MOBILE_EXTERNAL_URLS.PRIVACY_POLICY, MOBILE_COPY.ERROR_OPEN_PRIVACY_POLICY_FAILED)}>
        {MOBILE_COPY.PRIVACY_POLICY_LABEL}
      </Text>
      <Text accessibilityRole="link" accessibilityLabel={MOBILE_COPY.GITHUB_LABEL} style={styles.builtByLink}
        onPress={() => handleLinkPress(MOBILE_EXTERNAL_URLS.GITHUB, MOBILE_COPY.DIRECTORY_ERROR)}>
        {MOBILE_COPY.GITHUB_LABEL}
      </Text>
    </View>
  );
}
