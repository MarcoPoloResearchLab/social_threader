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

The three root lifecycle commands use the installed `mprlab-gateway` runtime.
Each command passes the selected Git root through `--app-root`.
Make sure that `mprlab-gateway` is on `PATH`.
Use `MPRLAB_GATEWAY_EXECUTABLE` to select an explicit installed command path.

`.mprlab/deploy/resources.yml` declares the Android and iOS artifacts, Pages frontend, and API service.
The installed Gateway runtime owns each lifecycle transaction.

Release runs the declared native builders with the sealed release timestamp.
Publication uses the sealed Android bundle and iOS IPA.
The application marketing version is `1.0.0`.
This version applies to the next Android binary and the first iOS binary.
The repository release version is separate.

The operator owns production deployment. Do not run `make deploy` as an implementation or local-development check.

Lower-level development helpers remain available when working on a specific mobile path:

```sh
make mobile-check
make run-ios
make run-android
make prepare-ios
make verify-ios
make prepare-android
make verify-android
make verify-mobile-source
make test-android-build
make test-android-native-bundle
make build-android
make submit-android
```

`make prepare-ios` generates the native iOS project and resolves CocoaPods dependencies before release.
The command requires Xcode 27.1 and CocoaPods.
Preparation uses Expo CLI to generate the native project.
The Xcode build uses the noninteractive `expo export:embed` command to make the JavaScript bundle.
Expo prebuild, dependency repair, and EAS remain outside the release lifecycle.
Commit the generated project, shared scheme, workspace, lockfile, and preparation record.
`make verify-ios` checks required native files, application identity, build settings, dependency versions, and the recorded toolchain.
CocoaPods owns dependency resolution and native lock metadata.
The release adapter sends one JSON request to Gateway through standard input.
Gateway installs locked dependencies, verifies preparation, signs the archive, and exports an App Store IPA.
`make build-ios` requires the lifecycle inputs that Gateway supplies during release.

`make prepare-android` installs locked dependencies and generates the native Android project.
The command applies the repository Gradle changes and records application configuration, dependency versions, and the Gradle version.
Commit the generated Android source and its `android/preparation.json` record.
`make verify-android` checks the record through a dependency-free Node command.
The checks permit native metadata changes when the selected application configuration remains valid.
They do not establish asset or plugin freshness.
Use the native preparation commands after changes that require native generation.
`make verify-mobile-source` checks iOS first and Android second.
CI completes both checks before tests or dependency installation, including parallel Make execution.

`make build-android` verifies Android preparation before dependency installation or build effects.
The builder copies the current public Android files into its temporary build directory.
It excludes local configuration, private signing files, and build caches.
Gradle creates the signed App Bundle through the declared React Native CLI.
The builder sets the computed version and build number before Gradle starts.
The builder verifies the signature, upload certificate, package, version, and R8 mapping.
The builder writes a public build manifest beside the `.aab`.
`make test-android-build` tests the public build and preparation contracts with synthetic inputs.
`make test-android-native-bundle` verifies preparation and creates an actual Android JavaScript bundle.
This bundle check requires the installed locked dependencies.

For lifecycle operations, declare `SOCIAL_THREADER_ANDROID_KEYSTORE_PROPERTIES` in the selected manifest inputs.
The manifest captures this path before lifecycle effects.
The builder requests this captured value from Gateway.
The selected properties file must contain `storeFile`, `storePassword`, `keyAlias`, and `keyPassword`.
A relative `storeFile` uses the selected properties directory as its root.
For direct development builds, specify the properties path explicitly:

```sh
MOBILE_ANDROID_BUNDLE_ARGS="--keystore-properties /absolute/path/to/keystore.properties" make build-android
```

Use `make mobile-resolve-dependencies` after a mobile dependency declaration changes.
Then run both preparation commands before `make mobile-check` and `make ci`.

The Android build tool removes `NODE_ENV` and operates `npm ci --include=dev`. This command installs all devDependencies in every environment. The Gradle step sets `NODE_ENV` to `production`.

`make run-ios` starts Metro through `scripts/ios-run.mjs`. It selects an available Expo port before startup. Then, `scripts/expo-run.expect` accepts known Expo Go upgrades and rejects unexpected port changes.

`make run-android` starts Metro through `scripts/android-run.mjs`. It starts an Android AVD when necessary and installs a compatible Expo Go build. Then, it configures `adb reverse`, opens the local Expo address, and verifies the Social Threader UI. Override the Metro port with `MOBILE_PORT=8082 make run-ios` or `MOBILE_PORT=8082 make run-android`.

## Store Publishing Checklist

Keep App Store Connect keys, Google service account JSON files, Android upload keystores, and other store credentials out of git. Local files matching `configs/AuthKey_*.p8`, `configs/*service-account*.json`, `configs/google-play*.json`, `configs/*keystore*.properties`, and `configs/*upload-key*.jks` are ignored by the repository.

### Shared preflight

- [ ] Confirm App Store Connect and Google Play app records exist for:
  - iOS bundle identifier: `com.mprlab.threader`. Apple app ID: `6788578080`
  - Android package name: `com.mprlab.socialthreader`
- [ ] Confirm the Apple Developer agreement and Google Play Console account setup are current.
- [ ] Commit the application version and prepared native source before release.
- [ ] Let the release timestamp set the iOS build number.
- [ ] Let the gateway release timestamp set the Android `versionCode`.
- [ ] Confirm privacy policy URL, support URL, description, screenshots, app category, content rating, and release notes are ready in both stores.
- [ ] Run:

```sh
make ci
make mobile-check
```

### Apple App Store / TestFlight

The selected Apple record uses `com.mprlab.threader` and app ID `6788578080`.
`ios-release-identity.json` declares the workspace, scheme, export intent, and private input names.
Android retains its published package, `com.mprlab.socialthreader`.
The platform identifiers do not need to be identical.

1. Complete native preparation and verify its application configuration.
2. Supply the private inputs through the sources specified in `.mprlab/deploy/resources.yml`.
3. Run repository CI before the selected release operation.
4. Build and seal the signed IPA through the canonical lifecycle.
5. Verify the processed build in App Store Connect.
6. Complete the store description, screenshots, support URL, category, age rating, privacy, review information, and availability.
7. Submit the selected version for review after operator authorization.

The private file requires these assignments without example secret values:

```sh
SOCIAL_THREADER_APPLE_TEAM_ID=
SOCIAL_THREADER_IOS_PROVISIONING_PROFILE=
SOCIAL_THREADER_IOS_SIGNING_IDENTITY=
SOCIAL_THREADER_IOS_CERTIFICATE_BASE64=
SOCIAL_THREADER_IOS_CERTIFICATE_PASSWORD=
APP_STORE_CONNECT_API_KEY_ID=
APP_STORE_CONNECT_API_ISSUER_ID=
APP_STORE_CONNECT_API_KEY_PATH=
```

The certificate input contains a base64 PKCS#12 signing identity with its private key.
The API key path identifies the existing Apple `.p8` file.
The current manifest selects `.mprlab/deploy/.env` through the optional `environment_file` field.
Relative paths use the consuming repository root.
When the manifest selects a file, that file must exist and be readable.
When the field is absent, Gateway uses only process values.
Process values take precedence over values from the selected file.

Gateway reads the values once at the manifest boundary.
Subsequent build operations receive the validated configuration.
Apple signing uses a temporary keychain.
Missing inputs stop the build without an interactive prompt.
A browser login does not supply these native build inputs.
Simulators are sufficient for application tests.
A signed IPA and a processed Apple build remain separate release evidence.

### Google Play

- [ ] Create or confirm a Google Play app with package name `com.mprlab.socialthreader`.
- [ ] Select the existing Android upload keystore through the explicit properties file.
- [ ] Supply `SOCIAL_THREADER_ANDROID_KEYSTORE_PROPERTIES` through the manifest-selected environment inputs.
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

## MPR Lab product directory

The footer provides the shared MPR Lab product directory without sign-in.
Product links keep the current draft when the user returns.
See the [directory contract](../docs/product-directory.md) for catalog updates and acceptance boundaries.
