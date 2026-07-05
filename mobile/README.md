# Social Threader Mobile

Universal Expo/React Native app for Social Threader.

## Local Development

```sh
npm install
npm run check
npm run ios
npm run android
```

The mobile app reuses the shared Social Threader chunking engine from `../js/core/chunking.js`, while native UI, clipboard, image selection, and sharing live under `mobile/`. Local Expo and test commands run `scripts/sync-shared-web.mjs` first so Metro reads generated copies under `src/shared-web/` while the canonical source stays in the repository-level `js/` tree.

## Root Commands

From the repository root:

```sh
make mobile-check
make run-ios
make run-android
make build-ios
make build-android
make submit-ios
make submit-android
```

`make build-ios` and `make build-android` use the `production` EAS profile. Android production builds emit an App Bundle.

`make run-ios` starts Expo through `scripts/expo-run.expect` so known Expo prompts do not block local startup: Expo Go version upgrades are accepted automatically, while unexpected port changes are rejected.

`make run-android` starts Metro through `scripts/android-run.mjs`, waits for Metro, starts an Android AVD if no device is attached, installs an Expo Go build compatible with the Expo SDK when needed, configures `adb reverse`, opens Expo Go at `exp://127.0.0.1:<port>/--/`, and verifies that the Social Threader UI rendered. Override the Metro port with `MOBILE_PORT=8082 make run-ios` or `MOBILE_PORT=8082 make run-android`.
