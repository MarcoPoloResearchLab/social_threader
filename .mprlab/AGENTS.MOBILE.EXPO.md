# AGENTS.MOBILE.EXPO.md

## Scope

Expo and React Native guidance for mobile clients. Use this guide only when the repository contains an Expo app, React Native app, or shared React Native client package.

Follow root `AGENTS.md`, `.mprlab/POLICY.md`, and `.mprlab/AGENTS.MOBILE.md`.

## Expo And React Native Contract

- Treat Expo configuration as a source contract. Keep `app.json`, `app.config.*`, native project settings, URL schemes, bundle identifiers, package names, plugins, and runtime config aligned.
- Prefer Expo-managed APIs and config plugins when the repo already uses Expo.
- Do not hand-edit generated iOS or Android project files unless the repo explicitly owns that native patch or script.
- If native output must change, update the source config or documented prepare script first, then regenerate or run the repo-owned patch.
- Keep Expo dev-client, Metro, prebuild, and platform build commands inside package scripts or Make targets.

## Code Structure

- Keep screens thin. Put API transport, auth sessions, purchases, storage, and native capabilities in explicit adapters or hooks.
- Backend clients parse and validate responses before UI state sees them.
- Keep navigation route names, deep-link paths, storage keys, purchase product IDs, entitlement names, and event names in constants.
- Use TypeScript or checked JavaScript consistently with the repo's current setup.
- Avoid boolean flags that switch unrelated workflow behavior; prefer named commands or closed action objects.

## Auth, Links, And Storage

- Validate Expo AuthSession results, redirect URLs, token payloads, and backend exchange responses at the boundary.
- Keep scheme, universal link/app link, OAuth callback, and hosted backend origin values in one documented config path.
- Store tokens and private auth state in `expo-secure-store` or the repo's current secure-storage adapter.
- Sign-out must clear secure storage, memory state, and backend session state according to the current contract.
- Do not keep compatibility reads for old storage keys unless a bounded migration is explicitly required.

## Native Capabilities

- Purchases, push notifications, clipboard, haptics, browser sessions, and native modules must have explicit adapters.
- Validate purchase product identifiers, receipt/entitlement payloads, restore responses, and store errors before updating UI state.
- Keep permissions explicit; do not silently continue after denied permissions unless the product state represents that denial.
- Do not assume Expo web behavior proves iOS or Android behavior.

## Generated Native Projects

- Treat `ios/` and `android/` as generated unless the repo says they are source-owned.
- Use documented scripts such as `expo prebuild`, `expo run:ios`, `expo run:android`, or repo-specific prepare scripts.
- If a generated native file changes, explain which source config or patch script owns the change.
- Do not manually patch generated native warnings in place when a repo-owned script already exists.

## Testing And Validation

- Run the repo's package scripts for typecheck, config validation, API-boundary checks, and mobile app-flow tests.
- For platform work, run the documented iOS or Android prepare/build command for the changed platform.
- For auth/deep-link changes, validate scheme/callback values and the app-visible flow.
- For purchases, validate product IDs, entitlement state, restore behavior, and user-visible error handling with the repo's supported test path.
- Use Expo web only as a supplementary check, not as mobile acceptance evidence.

## Review Checklist

- [ ] Expo config and native identifiers are aligned.
- [ ] Native generated files were updated through source config or documented scripts.
- [ ] API, auth, storage, purchase, and native-module payloads are validated at adapters.
- [ ] Screens do not own transport or persistence contracts.
- [ ] iOS and Android validation was run when platform behavior changed.
- [ ] Expo web was not used as the sole proof for mobile behavior.
