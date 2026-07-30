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
make release
make publish
make deploy
```

`make release` runs the repository checks and builds the signed Android App Bundle through the local Kamu-style pipeline. The default version code comes from the checked-in app configuration; pass an explicit `MOBILE_ANDROID_VERSION_CODE` when a higher value is required. `make publish` consumes the checked release manifest and submits that exact bundle to Google Play through the Android Publisher API.

Social Threader has no mobile runtime promotion step. `make deploy` activates the companion web frontend from the published Pages archive.

Lower-level development helpers remain available when working on a specific mobile path:

```sh
make mobile-check
make run-ios
make run-android
make build-ios
make build-android
make submit-ios
make submit-android
```

`make build-ios` uses the `production` EAS profile. `make build-android` follows the Kamu-style local Google Play path: Expo prebuilds Android in a temporary directory, Gradle creates a signed App Bundle, and the script writes a checked build manifest beside the `.aab`.

`make run-ios` starts Metro through `scripts/ios-run.mjs`, selects an available Expo port before startup, and then runs Expo through `scripts/expo-run.expect` so known Expo prompts do not block local startup: Expo Go version upgrades are accepted automatically, while unexpected port changes are rejected.

`make run-android` starts Metro through `scripts/android-run.mjs`, waits for Metro, starts an Android AVD if no device is attached, installs an Expo Go build compatible with the Expo SDK when needed, configures `adb reverse`, opens Expo Go at `exp://127.0.0.1:<port>/--/`, and verifies that the Social Threader UI rendered. Override the Metro port with `MOBILE_PORT=8082 make run-ios` or `MOBILE_PORT=8082 make run-android`.

## Store Publishing Checklist

Keep App Store Connect keys, Google service account JSON files, Android upload keystores, and other store credentials out of git. Local files matching `configs/AuthKey_*.p8`, `configs/*service-account*.json`, `configs/google-play*.json`, `configs/*keystore*.properties`, and `configs/*upload-key*.jks` are ignored by the repository.

### Shared preflight

- [ ] Confirm App Store Connect and Google Play app records exist for:
  - iOS bundle identifier: `com.mprlab.socialthreader`
  - Android package name: `com.mprlab.socialthreader`
- [ ] Confirm the Apple Developer agreement and Google Play Console account setup are current.
- [ ] Update `expo.version`, `ios.buildNumber`, and `android.versionCode` in `app.json`.
- [ ] Confirm privacy policy URL, support URL, description, screenshots, app category, content rating, and release notes are ready in both stores.
- [ ] Run:

```sh
make ci
make mobile-check
```

### Apple App Store / TestFlight

- [ ] Keep the App Store Connect API key outside git. For the local key currently named `AuthKey_D2TZFYN2V2.p8`, the key id is `D2TZFYN2V2`.
- [ ] Get the matching App Store Connect issuer id and numeric App Store Connect app id from App Store Connect.
- [ ] Configure EAS Submit for iOS, either interactively or in `eas.json` using the `ascApiKeyPath`, `ascApiKeyIssuerId`, `ascApiKeyId`, and `ascAppId` fields. Do not commit a real private key.
- [ ] Build the iOS app:

```sh
make build-ios
```

- [ ] After the EAS iOS build finishes, submit it:

```sh
make submit-ios MOBILE_IOS_SUBMIT_ARGS="--non-interactive --wait"
```

- [ ] In App Store Connect, wait for processing, answer export compliance if prompted, add the build to TestFlight, then submit the app version for App Review when ready.

### Google Play

- [ ] Create or confirm a Google Play app with package name `com.mprlab.socialthreader`.
- [ ] Create an Android upload keystore and keep it outside git. The local builder defaults to `~/.local/share/social_threader/android-upload/keystore.properties` and `~/.local/share/social_threader/android-upload/socialthreader-upload-key.jks`.
- [ ] Add the Play upload-key SHA-256 and Google Cloud quota project to `mobile/android-release-identity.json`, using `mobile/android-release-identity.example.json` as the template.
- [ ] Configure Google Application Default Credentials with Android Publisher access:

```sh
gcloud auth application-default login --scopes=https://www.googleapis.com/auth/androidpublisher,https://www.googleapis.com/auth/cloud-platform
```

- [ ] Confirm the Play Console setup is complete: app content, Data safety, privacy policy, content rating, target audience, ads declaration, and testing track.
- [ ] Run the normal Google Play release path:

```sh
make release
make publish
```

- [ ] In Play Console, verify the internal-test release, then promote to production after testing.
- [ ] To create a Production draft directly instead of publishing to Internal testing, intentionally override the track and status:

```sh
MOBILE_ANDROID_PUBLISH_ARGS="--track production --status draft" make publish
```
