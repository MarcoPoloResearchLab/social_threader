// @ts-check
const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const APP_DELEGATE_DECLARATION = "class AppDelegate: ExpoAppDelegate {";
const SCENE_APP_DELEGATE_DECLARATION = "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {";
const LEGACY_WINDOW_START = /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\n#endif/;

/** Configure the generated iOS target for scenes and lifecycle-owned release versions.
 * @param {import('expo/config').ExpoConfig} config
 * @returns {import('expo/config').ExpoConfig}
 */
module.exports = function withIosRelease(config) {
  const infoConfig = withInfoPlist(config, (modConfig) => {
    modConfig.modResults.CFBundleVersion = "$(CURRENT_PROJECT_VERSION)";
    modConfig.modResults.CFBundleShortVersionString = "$(MARKETING_VERSION)";
    modConfig.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [{
          UISceneConfigurationName: "Default Configuration",
          UISceneDelegateClassName: "EXExpoAppSceneDelegate"
        }]
      }
    };
    return modConfig;
  });
  return withAppDelegate(infoConfig, (modConfig) => {
    if (modConfig.modResults.language !== "swift") throw new Error("iOS release preparation requires the Expo Swift app delegate");
    const source = modConfig.modResults.contents;
    if (source.includes(SCENE_APP_DELEGATE_DECLARATION) && !source.includes("factory.startReactNative")) return modConfig;
    if (!source.includes(APP_DELEGATE_DECLARATION) || !LEGACY_WINDOW_START.test(source)) {
      throw new Error("Expo app delegate template changed; review the iOS scene preparation plugin");
    }
    modConfig.modResults.contents = source
      .replace(APP_DELEGATE_DECLARATION, SCENE_APP_DELEGATE_DECLARATION)
      .replace(LEGACY_WINDOW_START, "");
    return modConfig;
  });
};
