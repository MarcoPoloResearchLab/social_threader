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
make build-android
make submit-android
```

`make prepare-ios` generates the native iOS project and resolves CocoaPods dependencies before release.
The command requires Xcode 27.1 and CocoaPods.
Preparation uses Expo CLI to generate the native project.
The Xcode build uses the noninteractive `expo export:embed` command to make the JavaScript bundle.
Expo prebuild, dependency repair, and EAS remain outside the release lifecycle.
Commit the generated project, shared scheme, workspace, lockfile, and preparation record.
`make verify-ios` rejects changed config or native output after preparation.
The release adapter sends one JSON request to Gateway through standard input.
Gateway installs locked dependencies, verifies preparation, signs the archive, and exports an App Store IPA.
`make build-ios` requires the lifecycle inputs that Gateway supplies during release.

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

1. Complete native preparation and verify its recorded hashes.
2. Supply the private inputs in the ignored repository file `configs/.env.social-threader`.
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
Gateway reads these values from the canonical private file and uses a temporary keychain.
Missing inputs stop the build without an interactive prompt.
A browser login does not supply these native build inputs.
Simulators are sufficient for application tests.
A signed IPA and a processed Apple build remain separate release evidence.

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

## MPR Lab product directory

The footer provides the shared MPR Lab product directory without sign-in.
Product links keep the current draft when the user returns.
See the [directory contract](../docs/product-directory.md) for catalog updates and acceptance boundaries.
