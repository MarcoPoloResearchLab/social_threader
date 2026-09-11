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
make release && make publish && make deploy
```

The three root lifecycle commands take no arguments. They delegate the selected repository to the exact sibling `../mprlab-gateway` checkout.

`.mprlab/deploy/resources.yml` declares the Android artifact, Pages frontend, and API service. The sibling gateway owns each lifecycle transaction.

Release runs the local Android builder with the sealed version and timestamp. Publish preflights Google Play and reconciles an interrupted submission.

The operator owns production deployment. Do not run `make deploy` as an implementation or local-development check.

Lower-level development helpers remain available when working on a specific mobile path:

```sh
make mobile-check
make run-ios
make run-android
make build-ios
make build-android
make submit-android
```

`make build-ios` forwards the shared Gateway cloud operation through the repository shell adapter.
Its arguments come from `MOBILE_APPLE_BUILD_ARGS`, and `MPRLAB_GATEWAY_EXECUTABLE` selects the authoritative compiled executable.
I004 retains the native project, product declaration, account setup, and hosted acceptance gates.

`make build-android` is a lower-level development helper. Expo prebuilds Android in a temporary directory. Gradle creates a signed App Bundle. The script writes a checked build manifest beside the `.aab`.

Use `make mobile-resolve-dependencies` after a mobile dependency declaration changes.
Then run `make mobile-check` and `make ci`.

The Android build tool removes `NODE_ENV` and operates `npm ci --include=dev`. This command installs all devDependencies in every environment. The Gradle step sets `NODE_ENV` to `production`.

`make run-ios` starts Metro through `scripts/ios-run.mjs`. It selects an available Expo port before startup. Then, `scripts/expo-run.expect` accepts known Expo Go upgrades and rejects unexpected port changes.

`make run-android` starts Metro through `scripts/android-run.mjs`. It starts an Android AVD when necessary and installs a compatible Expo Go build. Then, it configures `adb reverse`, opens the local Expo address, and verifies the Social Threader UI. Override the Metro port with `MOBILE_PORT=8082 make run-ios` or `MOBILE_PORT=8082 make run-android`.

## Store Publishing Checklist

Keep App Store Connect keys, Google service account JSON files, Android upload keystores, and other store credentials out of git. Local files matching `configs/AuthKey_*.p8`, `configs/*service-account*.json`, `configs/google-play*.json`, `configs/*keystore*.properties`, and `configs/*upload-key*.jks` are ignored by the repository.

### Shared preflight

- [ ] Confirm App Store Connect and Google Play app records exist for:
  - iOS bundle identifier: `com.mprlab.socialthreader`
  - Android package name: `com.mprlab.socialthreader`
- [ ] Confirm the Apple Developer agreement and Google Play Console account setup are current.
- [ ] Commit the Apple release version before the cloud build.
- [ ] Use the build number that Xcode Cloud assigns.
- [ ] Let the gateway release timestamp set the Android `versionCode`.
- [ ] Confirm privacy policy URL, support URL, description, screenshots, app category, content rating, and release notes are ready in both stores.
- [ ] Run:

```sh
make ci
make mobile-check
```

### Apple App Store / TestFlight

I004 migrates Apple release builds to the shared Xcode Cloud flow.
The current source uses `com.mprlab.socialthreader`.
The existing App Store app uses `com.mprlab.threader`.
The owner must select the product identity before native preparation and cloud setup.

After the identity decision:

1. Prepare and commit the native project and shared scheme.
2. Declare the product in `.mprlab/apple-build.json` and the selected application manifest.
3. Configure the Xcode Cloud workflow through `.mprlab/AGENTS.APPLE.md`.
4. Put the Apple API credentials in the ignored `configs/.env.social-threader` input.
5. Run the selected Gateway release lifecycle after source delivery and version alignment.
6. Verify the successful hosted build and processed App Store Connect record.

The shared operation owns build submission, recovery, and provider verification.
Public App Store release remains under operator control.

### Google Play

- [ ] Create or confirm a Google Play app with package name `com.mprlab.socialthreader`.
- [ ] Create an Android upload keystore and keep it outside git. The local builder defaults to `~/.local/share/social_threader/android-upload/keystore.properties` and `~/.local/share/social_threader/android-upload/socialthreader-upload-key.jks`.
- [ ] Add the Play upload-key SHA-256 and Google Cloud quota project to `mobile/android-release-identity.json` with the tracked example as the template.
- [ ] Configure Google Application Default Credentials with Android Publisher access:

```sh
gcloud auth application-default login --scopes=https://www.googleapis.com/auth/androidpublisher,https://www.googleapis.com/auth/cloud-platform
```

- [ ] Confirm that the Play Console setup is completed.
- [ ] Review app content, Data safety, privacy policy, content rating, target audience, ads declaration, and the test track.
- [ ] Run the normal selected-application lifecycle from a clean checkout:

```sh
make release && make publish && make deploy
```

- [ ] In Play Console, verify the production release after publication completes.
- [ ] To create a production draft with the lower-level development helper, first run `make build-android`. Then run:

```sh
MOBILE_ANDROID_PUBLISH_ARGS="--track production --status draft" make submit-android
```
