const React = require("react");

function createNativeComponent(componentName) {
  function NativeComponent(props) {
    const { children, ...restProps } = props;
    return React.createElement(componentName, restProps, children);
  }
  NativeComponent.displayName = componentName;
  return NativeComponent;
}

function flattenStyle(style) {
  if (!Array.isArray(style)) {
    return style || {};
  }
  return style.reduce((mergedStyle, styleItem) => {
    if (!styleItem) {
      return mergedStyle;
    }
    return {
      ...mergedStyle,
      ...flattenStyle(styleItem)
    };
  }, {});
}

const StyleSheet = Object.freeze({
  create: (styles) => styles,
  flatten: flattenStyle
});

module.exports = {
  AccessibilityInfo: { setAccessibilityFocus: jest.fn() },
  findNodeHandle: () => 1,
  Modal: function Modal({ visible, children, ...props }) {
    return visible ? React.createElement('Modal', props, children) : null;
  },
  SafeAreaView: createNativeComponent("SafeAreaView"),
  Image: createNativeComponent("Image"),
  Linking: {
    openURL: () => Promise.resolve(true)
  },
  Pressable: createNativeComponent("Pressable"),
  ScrollView: createNativeComponent("ScrollView"),
  Share: {
    share: () => Promise.resolve({ action: "sharedAction" })
  },
  StyleSheet,
  Text: createNativeComponent("Text"),
  TextInput: createNativeComponent("TextInput"),
  View: createNativeComponent("View")
};
