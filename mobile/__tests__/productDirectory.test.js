// @ts-check
import { act } from "react";
import { AccessibilityInfo, StyleSheet } from "react-native";
import { MOBILE_ACCESSIBILITY_LABELS, MOBILE_COPY, MOBILE_EXTERNAL_URLS, MOBILE_TEST_IDS } from "../src/constants";
import { createDependencies, renderApp, findPressable, findLink, press, pressAsync, pressLinkAsync, changeText, findSwitch, toggle, findByTestID, findText, markerAccessibilityLabel, findAll, IMAGE_CLIPBOARD_BASE64, IMAGE_CLIPBOARD_DATA_URL } from "../tests/appFlow";

describe("Social Threader product directory", () => {
  it("announces sections, exposes all catalog links, reports link errors, and handles Android Back", async () => {
    const dependencies = createDependencies();
    const component = renderApp(dependencies);
    press(component, "Explore MPR Lab");
    press(component, "Writing & creativity");
    expect(findPressable(component, "Writing & creativity").props.accessibilityState.expanded).toBe(false);
    for (const label of ["Writing & creativity", "Business & organization", "Learning & everyday life", "Developer tools"]) press(component, label);
    const catalog = require('../src/shared-web/product-catalog.json');
    for (const product of catalog.products) {
      const link = findLink(component, `${product.name} — ${product.purpose}`);
      expect(link).toBeTruthy();
      expect(StyleSheet.flatten(link.props.style).minHeight).toBeGreaterThanOrEqual(44);
    }
    dependencies.linking.openURL.mockRejectedValueOnce(new Error('device browser unavailable'));
    await pressLinkAsync(component, 'All projects');
    expect(findText(component, MOBILE_COPY.DIRECTORY_ERROR)).toBeTruthy();
    const modal = findAll(component, node => node.type === 'Modal')[0];
    act(() => modal.props.onRequestClose());
    expect(findLink(component, 'All projects')).toBeUndefined();
    act(() => modal.props.onDismiss());
    press(component, 'Explore MPR Lab');
    expect(findPressable(component, 'Writing & creativity').props.accessibilityState.expanded).toBe(true);
    expect(findPressable(component, 'Developer tools').props.accessibilityState.expanded).toBe(false);
    press(component, MOBILE_COPY.DIRECTORY_CLOSE);
    await pressLinkAsync(component, MOBILE_COPY.GITHUB_LABEL);
    expect(dependencies.linking.openURL).toHaveBeenLastCalledWith(MOBILE_EXTERNAL_URLS.GITHUB);
    dependencies.linking.openURL.mockRejectedValueOnce(new Error('device browser unavailable'));
    await pressLinkAsync(component, MOBILE_COPY.GITHUB_LABEL);
    expect(findText(component, MOBILE_COPY.DIRECTORY_ERROR)).toBeTruthy();
  });

  it("opens the guest product directory and retains the complete draft after a browser link", async () => {
    const dependencies = createDependencies();
    const component = renderApp(dependencies);
    changeText(component, MOBILE_TEST_IDS.SOURCE_INPUT, "A complete draft with an image.");
    dependencies.imagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: IMAGE_CLIPBOARD_DATA_URL, base64: IMAGE_CLIPBOARD_BASE64, mimeType: 'image/png', width: 1, height: 1 }] });
    await pressAsync(component, MOBILE_COPY.ATTACH_IMAGE_LABEL);
    toggle(component, MOBILE_ACCESSIBILITY_LABELS.ENUMERATE, true);
    changeText(component, MOBILE_TEST_IDS.CUSTOM_LENGTH_INPUT, "12");
    press(component, MOBILE_ACCESSIBILITY_LABELS.CUSTOM_APPLY);
    await pressAsync(component, "Copy text-0");
    const before = findByTestID(component, MOBILE_TEST_IDS.SOURCE_INPUT).props.value;
    const imagesBefore = findAll(component, node => node.type === 'Image').map(node => node.props.source);
    press(component, "Explore MPR Lab");
    expect(findPressable(component, "Writing & creativity").props.accessibilityState.expanded).toBe(true);
    expect(findPressable(component, "Developer tools").props.accessibilityState.expanded).toBe(false);
    await pressLinkAsync(component, "About MPR Lab");
    expect(dependencies.linking.openURL).toHaveBeenCalledWith("https://mprlab.com/");
    expect(findByTestID(component, MOBILE_TEST_IDS.SOURCE_INPUT).props.value).toBe(before);
    expect(markerAccessibilityLabel(component, "text-0")).toBe("Chunk text-0 copied #1");
    expect(findSwitch(component, MOBILE_ACCESSIBILITY_LABELS.ENUMERATE).props.accessibilityState.checked).toBe(true);
    expect(findByTestID(component, MOBILE_TEST_IDS.CUSTOM_LENGTH_INPUT).props.value).toBe("12");
    expect(findAll(component, node => node.type === 'Image').map(node => node.props.source)).toEqual(imagesBefore);
    expect(imagesBefore.length).toBeGreaterThan(0);
    expect(AccessibilityInfo.setAccessibilityFocus).toHaveBeenCalled();
  });

});
