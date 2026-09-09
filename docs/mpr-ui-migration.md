# I003 Shared UI Migration

I003 prepares Social Threader for mpr-ui I009.
The application source starts at `e64b52587ade8761f1ab580be32de4c3c802e6ae`.
The shared candidate is `7c2f9e36453c6081db7641b7efae00c6e271fa39`.
Its three SHA-256 values are defined in `tests/sharedUiCandidate.js`.

## Release Unit

Publish the browser application and `/config-ui.yaml` together.
The page retains literal `@latest` shared asset URLs.
Both config environments use the provider map.
Google remains enabled. Apple and password remain disabled.
The config preserves the Google client, `social-threader` tenant, origins, and `/auth/session` endpoint.
The hosted environment retains its separate TAuth origin.

The application reads the canonical `status` field from the public authentication snapshot.
Snapshot failures include operation context in the application log.
Guest split and copy controls remain available when shared authentication is absent.
The existing footer already uses the current contract.

## Validation

Initial CI passed 43 headless checks, six browser checks, backend checks, lint, and module verification.
The mobile suite passed 33 tests with complete coverage.
The Expo dependency check then failed because the existing dependency set requires an update.
B009 records that independent defect.

The four real-header regressions rejected the previous config before the production change.
A separate regression rejected the obsolete authentication snapshot shapes.
The migrated page exposed mpr-ui B066 at mobile widths.
Its sign-out control extended beyond the left viewport edge.
B066 [PR #212](https://github.com/MarcoPoloResearchLab/mpr-ui/pull/212) corrects the shared menu calculation and verifies open-menu resize behavior.
All four candidate flows passed against that correction.
Final `make ci` passed 44 headless checks, ten browser checks, backend checks, lint, module verification, and 33 mobile tests.
Current master `7fc9f62e7bf82d8d58fa29e0d9c3b189126b7ca8` was merged forward to resolve the tracker conflict.
CI after the merge passed the same browser, backend, and mobile tests.
The updated image picker passes its dependency check. Expo `57.0.20` still requires `~57.0.21` under B009.
Hosted CI at `e83e2a5feddd6449213351a27b77623d0a64c531` passed browser, API, container, and local-stack checks.
The [hosted run](https://github.com/MarcoPoloResearchLab/social_threader/actions/runs/34301824325) confirms the same Expo failure under B009.

The new browser suite loads all three real shared candidate assets and verifies their SHA-256 values.
It covers local and hosted environments at 390 and 1280 pixels.
It verifies Google credential exchange, tenant headers, session restoration, toolbar state, keyboard dismissal, and logout.
The Google SDK and TAuth protocol responses are controlled external boundaries.
Existing browser and Go suites verify the application transformation contract.
These checks do not establish live Google acceptance.

## Publication And Acceptance

The [public asset record](mpr-ui/public-assets-2026-09-09.json) contains six observations from one network location.
All six requests returned HTTP 200.
The public shared assets permit a seven-day browser cache and a twelve-hour shared cache.
The public loader differs from the tested candidate.
The coordinated transition remains pending.

1. Complete B009 and application preparation under the mpr-ui I009 deployment plan.
2. Prepare the maintenance artifacts and config responses for the coordinated interruption.
3. Let the user select the production window and run the publication sequence.
4. Verify the public application, config, and Pages release identity.
5. Verify all three shared asset identities after the cache transition.
6. Complete real Google sign-in, transformation, reload, and logout at mobile and desktop widths.
7. Verify guest split and copy behavior after logout.
8. Keep I003 blocked until CI, shared publication, cache transition, and live acceptance pass.
