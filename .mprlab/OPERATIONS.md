# Social Threader operations

This record keeps open production operations separate from accepted implementation.
The operator controls release, publication, deployment, and store submission.
Source acceptance does not prove current production state.

Review date: 2026-10-01.
Source commit: `02a09ad`.
`make ci` passed in the primary checkout.
The review used Puppeteer, Happy DOM, Go tests, and mobile integration tests.
The iOS and Android JavaScript bundle checks also passed.
Earlier F003 device checks used an Android API 37 emulator with Expo Go.
Simulators, emulators, and automated browsers are sufficient for device acceptance.
No production lifecycle operation or paid provider call occurred during this review.

## Release procedure

The current lifecycle contract is in `README.md` and `.mprlab/deploy/resources.yml`.
The installed Gateway owns the lifecycle.

1. Resolve the applicable open dependency findings in I005 and I007.
2. Complete the current repository validation and lifecycle prerequisites.
3. Use a clean committed checkout for the selected release.
4. Run `make release` when the operator requests the release.
5. Verify the sealed release receipt and selected artifacts.
6. Run `make publish` when the operator requests publication.
7. Run `make deploy` when the operator requests deployment.
8. Verify the public website and `/.mprlab-release.json`.
9. Verify the API DNS, TLS, route, and `/healthz` response.

I004 covers the local iOS build path.
The operator selected this path on 2026-10-19.
`mobile/README.md` defines the store procedures.

## Open checks

These checks were not run during this review.
Earlier blocked issue notes do not establish current production state.

### I004 iOS release readiness

The App Store Connect inspection on 2026-10-19 confirmed these values:

| Field | Value |
| --- | --- |
| Application | Social Threader |
| Apple app ID | `6788578080` |
| Bundle identifier | `com.mprlab.threader` |
| SKU | `com.mprlab.threader` |
| Store version | `1.0.0`, Prepare for Submission |
| TestFlight builds | None |

The iOS source and release declaration use the existing Apple identity.
Android retains `com.mprlab.socialthreader`.
The next mobile build uses marketing version `1.0.0`.
The current Android production version does not change with these source edits.
The installed Gateway is `v6.1.0`, source `2be1717257157863d370a4c99295d9f5b316de29`.
Its shared native builder replaces the obsolete iOS cloud adapter.
The operator permits the noninteractive `expo export:embed` step inside the native Xcode build.
The iOS 27.0 simulator ran the Release application with version `1.0.0` and build `214000001`.
The compiled application uses `com.mprlab.threader` and displays the compose controls.
This simulator build is not a signed store artifact.

The operator authorized reuse of existing inputs from other iOS repositories.
The Hecate API configuration successfully read this exact Apple record.
The PKCS#12 private key matched the distribution certificate through a signature check.
The certificate matches Apple team `Z9ZW6HDGML` and remote certificate `3C2RL33X96`.
The certificate expires on 2027-09-08.

The new `Social Threader App Store` profile is active and has type `IOS_APP_STORE`.
Its Apple ID is `4MBTZ9KT5N`, and it uses the verified distribution certificate.
The profile belongs to the selected bundle identifier.
The ignored canonical private file now supplies all eight declared signing and API inputs.
The API key file is also ignored by Git.
Verification through these copied inputs passed without disclosure of secret values.

Final `make ci` passed after the native corrections.
Independent source review accepted the scene lifecycle, build number, and adapter contract.
No signed IPA or store submission is accepted by this source review.

- [x] Supply the private inputs declared in `mobile/ios-release-identity.json`.
- [x] Verify the Apple team, distribution identity, and App Store provisioning profile.
- [ ] Build and seal the signed IPA from the accepted source.
- [ ] Verify its identifier, marketing version, build number, and export intent.
- [ ] Upload the sealed IPA through the authorized publication operation.
- [ ] Verify the processed App Store Connect build.
- [x] Make the editable store version agree with the selected marketing version.
- [ ] Add the description, keywords, support URL, copyright, and required screenshots.
- [ ] Complete the category, content rights, and age rating.
- [ ] Set the privacy policy URL and complete the data declarations.
- [ ] Set the price and available territories.
- [ ] Complete review contact details and the applicable access instructions.
- [ ] Submit for review after the operator authorizes submission.
- [ ] Record the review result and public availability.

The store inspection found the listed metadata and distribution setup incomplete.
The existing release setting selects automatic release after approval.
The editable store version changed from `1.0` to `1.0.0`.
No upload, review submission, or public release occurred.

### B001 Android release receipt

The source regression proves that the builder installs development dependencies under inherited production settings.

- [ ] Verify that the next selected release records the signed Android AAB.
- [ ] Verify that Metro reports no missing `babel-preset-expo` error.

### B008 Privacy policy and Google Play

The policy source identifies Social Threader, its package, publisher, and legal entity.
The source includes public links, the mobile link, the sitemap entry, and the Pages artifact.

- [ ] Verify `https://threader.mprlab.com/privacy/` after publication.
- [ ] Verify the app identity and policy links on the public website.
- [ ] Set the Google Play policy URL to the published app policy.
- [ ] Submit the app for a new Google Play review.
- [ ] Record the review result and production availability.

### I003 Shared UI publication and Google acceptance

The source uses the provider map in both config environments.
Controlled browser tests passed with the real shared header at desktop and mobile widths.
The B009 dependency blocker is resolved.
`docs/mpr-ui-migration.md` retains the release unit and earlier cache observations.

- [ ] Verify the current public shared assets against the selected release.
- [ ] Verify the application and `/config-ui.yaml` as one release unit.
- [ ] Verify all three shared asset identities after the cache transition.
- [ ] Verify real Google sign-in, session restoration, reload, and logout.
- [ ] Verify guest split and copy behavior after logout.
- [ ] Record the public source identity and provider acceptance results.

### F001 Hosted API and provider acceptance

The browser, API, and deterministic prompt contracts passed source validation.
`docs/api.md` defines the API. `docs/prompt-quality.md` defines the provider review rubric.

- [ ] Verify the exact hosted CORS origin and credential behavior.
- [ ] Verify the hosted TAuth callback, session restoration, and logout.
- [ ] Verify the public API route timeout and safe error behavior.
- [ ] Complete one hosted transformation after explicit authorization for the paid provider call.
- [ ] Complete the provider quality review after explicit authorization for its request count.
- [ ] Record rubric scores and safe metadata without source text or provider bodies.

### F003 Public directory and store artifact

The current web menu follows `docs/product-directory.md`.
The native snapshot contains 39 projects.
Source checks cover eight public pages at four widths and native draft retention.

- [ ] Verify the directory and privacy links on each published page.
- [ ] Verify the public Pages release identity.
- [ ] Build and publish the selected mobile artifact through the canonical lifecycle.
- [ ] Verify the selected artifact in an emulator or simulator.
- [ ] Verify native link return, sheet dismissal, and complete draft retention.
- [ ] Record the artifact identity and store acceptance result separately.
