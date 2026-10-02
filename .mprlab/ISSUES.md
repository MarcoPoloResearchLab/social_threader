# ISSUES

This tracker contains open implementation issues and recurring maintenance.
Completed entries are in [ISSUES-ARCHIVE.md](ISSUES-ARCHIVE.md).
Production operations that are not completed are in [OPERATIONS.md](OPERATIONS.md).

The following source issues are closed. Their production checks stay open with these priorities.

| Source issue | Priority | Open production checks |
| --- | --- | --- |
| B008 | P0 | [Policy publication and Google Play review](OPERATIONS.md#b008-privacy-policy-and-google-play) |
| B001 | P1 | [Android release receipt and Metro result](OPERATIONS.md#b001-android-release-receipt) |
| I003 | P1 | [Shared assets, cache transition, and live Google acceptance](OPERATIONS.md#i003-shared-ui-publication-and-google-acceptance) |
| F001 | P1 | [Hosted API and authorized provider checks](OPERATIONS.md#f001-hosted-api-and-provider-acceptance) |
| F003 | P1 | [Public directory and mobile store artifact checks](OPERATIONS.md#f003-public-directory-and-store-artifact) |

Read `AGENTS.md`, `.mprlab/POLICY.md`, `.mprlab/issues-md-format.md`, and applicable stack guides before implementation.

Format: `- [ ] [B042] (P1) {I007} Title`

## BugFixes

## Improvements

- [!] [I004] (P1) Use the shared Xcode Cloud release flow
  Goal:
  Build Apple release artifacts through the single MPR Lab Xcode Cloud flow.

  Requirements:
  - Apply the shared Apple guide from MPR Governor.
  - Declare each native project and shared scheme in `.mprlab/apple-build.json`.
  - Use the shared Gateway cloud operation and its recorded Apple build number.
  - Use the App Store Connect build that Xcode Cloud submits.
  - Remove local Apple release signing during the migration.
  - Keep public store release under operator control.

  Implementation:
  The shared Apple guide and related mobile rules are installed.
  Gateway F010 supplies the shared operation.
  The Apple build target now forwards the canonical shell adapter.
  The EAS build and submission commands and their configuration are removed.
  The public adapter tests and final CI passed.
  Native preparation and product declaration remain open.
  Apple account setup and a hosted build remain required provider acceptance steps.

  Validation:
  The shared Apple and mobile guide checks passed.
  The full Governor check retains unrelated differences observed before this migration.
  The current iOS bundle identifier differs from the existing App Store Connect record.
  The three new integration tests first failed against the EAS implementation.
  The shared shell adapter preserves exact arguments, provider output, and exit status with an empty tool search path.
  B009 corrects the dependency mismatch that blocked mobile validation.
  The final log is `/tmp/social-apple-final-ci-corrected.log`.
  I005 records the remaining dependency audit findings.

  Review: 2026-10-01.
  The shared shell adapter and its three integration tests passed in the review CI.
  The native project, shared scheme, and `.mprlab/apple-build.json` are missing.
  Blocked: The source uses `com.mprlab.socialthreader`.
  The existing App Store record uses `com.mprlab.threader`.
  The operator must select the Apple product identity before native preparation.
  Deliverables:
  - Prepare and commit the native project and shared scheme after the identity decision.
  - Declare the selected product in `.mprlab/apple-build.json` and the application manifest.
  - Verify the shared Apple build contract.
  - Record account setup and hosted build results separately in `OPERATIONS.md`.

- [ ] [I005] (P1) Resolve the mobile dependency audit findings
  Goal:
  Qualify the declared mobile runtime and build dependencies.

  Evidence:
  The audit after B009 reports 13 affected production-dependency packages and 14 packages with development dependencies included.
  The complete dependency set has 11 moderate and three high findings.
  Direct advisories affect baseline-browser-mapping, brace-expansion, browserslist, js-yaml, and uuid.
  Some reported production dependencies supply Expo build tooling. Package classification alone does not prove installed-app exposure.
  The audit recommends an obsolete Expo downgrade for some transitive findings. This is not the selected correction.
  The logs are `/tmp/social-apple-runtime-dependency-audit.json` and `/tmp/social-apple-build-dependency-audit.json`.

  Requirements:
  - Update affected dependencies within the current Expo contract.
  - Verify application bundles and the final repository CI.
  - Record any remaining advisory and its actual application or build exposure.

  Review: 2026-10-01.
  `cd mobile && npm audit --json` reports 14 affected packages.
  The result contains 11 moderate and three high findings. It includes development dependencies.
  The audit still proposes an Expo 46 downgrade for some findings.
  This downgrade is outside the current Expo 57 contract.
  The report is `/tmp/social-threader-mobile-audit.json`.
  Deliverables:
  - Update the affected dependency graph within Expo 57.
  - Record each remaining advisory and its runtime or build exposure.
  Validation:
  - Run `cd mobile && npm audit --json` after the dependency change.
  - Run `make mobile-check` and final `make ci`.

- [ ] [I007] (P1) Resolve the browser test dependency audit findings
  Goal: Qualify the browser test dependencies without a change to product behavior.
  Evidence:
  The root `npm audit --json` reports nine affected packages on 2026-10-01.
  The result contains seven high and two critical findings.
  `happy-dom` and `puppeteer` are direct development dependencies.
  The critical findings affect `happy-dom` and transitive `basic-ftp`.
  The root package supplies test tooling. It is not the browser runtime dependency graph.
  The report is `/tmp/social-threader-browser-audit.json`.
  Requirements:
  - Update the affected dependency graph and the exact package lock.
  - Keep Puppeteer as the browser automation tool.
  - Preserve the current browser and authentication test contracts.
  - Record each remaining advisory and its test or build exposure.
  Deliverables:
  - Updated root dependency declarations and package lock.
  - A reviewed audit result with any remaining exposure.
  Validation:
  - Run the root `npm audit --json` after the dependency change.
  - Run `make browser-test` and final `make ci`.

## Maintenance

- [ ] [M400R] (P2) Backlog hygiene and archive
  Goal:
  Keep the issue tracker reliable, readable, and focused on active work while preserving resolved history in the appropriate archive.

  Requirements:
  - Cadence: run weekly during active development and before each release cut.
  - Validate section names, identifier prefixes, recurrence suffixes, priority markers, dependencies, and duplicate IDs against the current `issues-md-format.md`.
  - Reconcile stale statuses, duplicate issues, broken references, obsolete instructions, and entries filed under the wrong section.
  - Before archival, update source documents with durable results from each resolved non-recurring issue.
  - Preserve the complete issue entry and its ID in the repository archive.
  - Keep active, blocked, planning, and recurring entries visible in `ISSUES.md`.

  Deliverables:
  - Normalized `ISSUES.md` structure and statuses.
  - Updated archive with complete entries removed from the active tracker.
  - A short `Last run:` note summarizing the cleanup and any follow-up issues filed.

  Validation:
  - Re-read `ISSUES.md` after edits and confirm every issue is under the right section with a unique section-aware ID.
  - Confirm recurring entries remain open and keep the `R` suffix.
  - Confirm no active, blocked, recurring, or planning work was archived.

  Last run: 2026-10-01.
  Archived 21 completed entries with their full history and identifiers.
  Closed B001, B008, I003, F001, and F003 after source review and passing CI.
  Recorded incomplete production operations in `OPERATIONS.md`.
  Checked identifiers and dependencies across both tracker files.

- [ ] [M401R] (P2) Polish open issues
  Goal:
  Keep unresolved work executable by making each open issue concrete, ordered, and testable.

  Requirements:
  - Cadence: run weekly during active development and before handing a repo to automated execution.
  - Review every unresolved non-recurring issue for missing context, dependencies, repro steps, acceptance criteria, and validation expectations.
  - Make priorities concrete and make sure that each open issue has actionable deliverables.
  - Merge duplicate open issues or add explicit dependency links when separate entries must remain.
  - Do not close or implement issues as part of this polish pass unless that work is separately requested.

  Deliverables:
  - Open issues with enough detail for a person or agent to execute without rediscovery.
  - New or updated dependency markers where ordering matters.
  - A short `Last run:` note listing the number of issues polished and any blockers found.

  Validation:
  - Sample the open entries after the pass and confirm each has clear next actions and validation expectations.
  - Confirm no recurring runbook was marked complete.
  - Confirm duplicates were merged or explicitly cross-referenced.

  Last run: 2026-10-01.
  Reviewed the three remaining implementation entries and added I007.
  I004 requires an Apple product identity decision.
  I005 and I007 require dependency corrections. F002 requires the native authentication contract first.

- [ ] [M402R] (P2) Architecture and policy review
  Goal:
  Catch architecture, policy, and workflow drift before it becomes hidden maintenance debt.

  Requirements:
  - Cadence: run monthly, before large refactors, and after major framework or runtime changes.
  - Review the codebase, docs, and workflow against `AGENTS.md`, `POLICY.md`, stack guides, and the current architecture notes.
  - Look for drift from forward-only contracts, edge-validation boundaries, smart-constructor usage, testing policy, and module ownership.
  - Classify each finding by its requested outcome. Record concrete scope, priority, and validation.
  - Close the pass with a no-action note only when the review finds no actionable drift.

  Deliverables:
  - Correctly classified issues for each actionable architecture or policy drift finding.
  - Updated notes on areas reviewed and areas intentionally left unchanged.
  - A short `Last run:` note with the review scope and outcome.

  Validation:
  - Confirm every finding is represented as an issue with owner-readable context and validation criteria.
  - Confirm no implementation changes were mixed into the review runbook unless separately requested.
  - Confirm all recurring runbooks remain open.

- [ ] [M403R] (P1) Dependency and security audit
  Goal:
  Keep third-party dependencies, runtime versions, and security-sensitive configuration within the current supported contract.

  Requirements:
  - Cadence: run weekly for active apps and before each release cut.
  - Inspect package managers, lockfiles, language toolchains, container bases, and generated clients for known vulnerabilities or stale direct dependencies.
  - Review auth, secret, CORS, CSP, SQL, network, and service-authorization configuration for drift from the current contract.
  - Use current supported dependencies. Do not add compatibility shims for obsolete dependency behavior.
  - File each actionable vulnerability, unsupported runtime, or security-contract gap under its outcome-based issue section.

  Deliverables:
  - Documented audit commands or data sources used for the pass.
  - Updated issues for each actionable dependency or security finding.
  - A short `Last run:` note with clean result or follow-up issue IDs.

  Validation:
  - Rerun the repository-native audit, lint, or dependency checks used for the pass.
  - Confirm every finding is either filed, fixed under a separate issue, or explicitly marked not applicable with evidence.
  - Confirm no secrets or private payloads were written into the tracker.

  Last run: 2026-10-01.
  The dependency review used `npm audit --json` in the root and `mobile/` directories.
  I005 records 14 affected mobile packages. I007 records nine affected browser test packages.
  This review did not inspect Go dependencies, container bases, or security config.

- [ ] [M404R] (P1) CI, release, and artifact health
  Goal:
  Keep the repository's validation, release, publication, and generated artifact surfaces trustworthy.

  Requirements:
  - Cadence: run before every release, publish, or deploy, and weekly for critical services.
  - Verify repository-native CI, lint, format, coverage, release, publish, Docker image, Pages, and artifact workflows still match the documented contract.
  - Examine generated artifacts, release tags, published images, and Pages outputs for source-to-public drift.
  - File concrete follow-up issues for failing gates, stale artifacts, missing release prerequisites, or undocumented workflow changes.
  - Do not do production deployment from this runbook unless the operator explicitly requests that deployment.

  Deliverables:
  - Recorded gate status and artifact surfaces inspected.
  - Follow-up issues for each reproducible CI, release, publish, or artifact drift problem.
  - A short `Last run:` note with commands run and any skipped surfaces.

  Validation:
  - Use repository-native `make` targets or documented release helpers for checks.
  - Confirm release and deployment ownership boundaries remain separate.
  - Confirm public or published artifacts match the intended source revision when that surface is inspected.

- [ ] [M405R] (P1) Code contract and static hygiene
  Goal:
  Keep source contracts explicit, current, and statically guarded against policy drift.

  Requirements:
  - Cadence: run monthly and before large refactors.
  - Scan for dead code, unused exports, duplicated literals, silent fallbacks, legacy aliases, compatibility reads, and zero-but-invalid domain states.
  - Examine static analysis, coverage, schema, and contract guards that prevent drift.
  - File each concrete violation under its outcome-based issue section.
  - Keep the current canonical contract only. Do not preserve obsolete behavior unless a product requirement explicitly requires it.

  Deliverables:
  - Issue entries for each actionable static hygiene or contract violation.
  - Notes on static tools, searches, and contract guards used during the pass.
  - A short `Last run:` note with clean result or follow-up issue IDs.

  Validation:
  - Rerun the relevant static checks, contract tests, or repository searches used to identify drift.
  - Confirm every finding has a narrow follow-up issue and does not duplicate existing backlog work.
  - Confirm no implementation changes were mixed into the audit unless separately requested.

- [ ] [M406R] (P1) Production drift and health
  Goal:
  Detect when production, public, or scheduled runtime state has drifted from the intended repository contract.

  Requirements:
  - Cadence: run weekly for deployed services and after each publish or deploy.
  - Compare current source, runtime configuration, published images, public routes, scheduled jobs, and health checks for drift.
  - Inspect real operator-facing surfaces rather than assuming merged source is deployed.
  - File follow-up issues for stale images, stale Pages output, missing routes, failed monitors, invalid production config, or undocumented runtime differences.
  - Stop before production deploy or destructive operator actions unless the operator explicitly requests them.

  Deliverables:
  - Recorded source revision, public artifact, route, image, or health surfaces inspected.
  - Follow-up issues for each source-to-runtime drift finding.
  - A short `Last run:` note with evidence links or commands used.

  Validation:
  - Verify inspected production or public surfaces directly where access is available.
  - Confirm any deploy-required finding is filed with the exact publish/deploy boundary and owner.
  - Confirm no production state was changed by the audit unless explicitly requested.

- [ ] [M407R] (P2) Documentation and runbook hygiene
  Goal:
  Keep durable documentation and runbooks aligned with the current behavior users and operators actually rely on.

  Requirements:
  - Cadence: run before release cuts and after merge bursts that change user-facing or operator-facing behavior.
  - Review README, ARCHITECTURE, PRD, CHANGELOG, docs, runbooks, setup guides, and local workflow notes for stale behavior or missing new contracts.
  - Update docs when closed issues changed durable behavior, public APIs, operator workflows, release semantics, or deployment expectations.
  - Remove or rewrite stale instructions instead of preserving obsolete alternatives.
  - File separate issues for documentation gaps that require product or implementation decisions.

  Deliverables:
  - Updated documentation or filed follow-up issues for each gap.
  - A short `Last run:` note listing docs inspected and changes made.
  - Cross-references from archived issue history to durable docs when useful.

  Validation:
  - Verify links, command names, paths, and public contract descriptions from the review.
  - Confirm docs describe the current canonical path only.
  - Confirm issue archive and active tracker references remain consistent.

## Features

- [ ] [F002] (P2) {F001} Add authenticated thread transformations to the mobile app
  Goal:
  Let a mobile user use the Social Threader transformation API after the browser capability is accepted and a native authentication contract is approved.

  Requirements:
  - Define a native TAuth application profile and session contract before implementation.
  - Use the existing `POST /v1/thread-transformations` application API. Do not add an LLM client, prompt policy, provider configuration, or LLM Proxy credential to the mobile runtime.
  - Keep ordinary thread splitting available without authentication.
  - Let the user select only the current closed operations: `polish`, `expand`, and `punch_up`.
  - Support text-only drafts. Block a transformation when the draft contains an image, and preserve all image bytes and positions.
  - Show a plain-text preview before Apply. Include Discard, Try again, stale-result protection, and one-step Undo.
  - Store native session material only in the approved secure client storage. Do not inspect or reinterpret session material in product code.
  - Cancel protected work and clear AI result state after the approved native logout lifecycle. Preserve the source draft and local chunks.
  - Do not change the browser authentication or transformation contracts in this issue.

  Deliverables:
  - Approved native TAuth profile, callback, session-restoration, and logout contract.
  - Mobile transformation controls and preview workflow that use the existing application API.
  - Mobile configuration and deployment resource updates that the approved native profile requires.
  - Updated mobile architecture, privacy, setup, and test documentation.

  Validation:
  - Add black-box mobile tests for authentication gates, all operations, one request per action, cancellation, and errors.
  - Add black-box mobile tests for preview actions, stale results, and Undo.
  - Verify that image drafts never make a transformation request and remain byte-for-byte unchanged.
  - Verify session restoration and logout on an Android emulator with the approved TAuth profile.
  - Run the repository mobile coverage gate and the shared API contract tests.
  - Treat one live transformation as explicit, potentially paid verification. Do not make it a default CI step.

  Review: 2026-10-01.
  F001 source acceptance is completed.
  The mobile client has no transformation controls or native TAuth application profile.
  The native authentication contract is the first deliverable.
  Hosted API acceptance remains a separate operational prerequisite in `OPERATIONS.md`.

## Planning
