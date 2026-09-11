# AGENTS.md

## Social Threader

### Tooling Restrictions

Under no circumstances may Playwright be introduced into this codebase. Prefer Puppeteer for browser automation.

## JavaScript Coding Standards (Browser ES Modules)

### 1. Naming & Identifiers

* No single-letter or non-descriptive names.
* camelCase → variables & functions.
* PascalCase → classes.
* SCREAMING_SNAKE_CASE → constants.
* Handlers named by behavior (`handleSpinButtonClick`, not `onClick`).

### 2. Dead Code & Duplication

* No unused variables, imports, or exports.
* No duplicated logic; extract helpers.
* One source of truth for repeated values or logic.

### 3. Strings & Enums

* All user-facing strings live in `constants.js`.
* Use `Object.freeze` for enums.
* Map keys must be constants or symbols, not ad-hoc strings.

### 4. Code Style

* ES modules (`type="module"`), strict mode.
* Pure functions for transforms; classes/factories for stateful logic.
* No mutation of imports; no parameter mutation.
* DOM operations live in `ui/`; business logic in `core/`.

### 5. Dependencies & Organization

* CDN-hosted dependencies only; no npm, bundlers, or Node tooling.
* Layout:

  ```
  /assets/{css,img,audio}
  /data/*.json
  /js/
    constants.js
    types.d.js
    utils/
    core/
    ui/
    app.js
  index.html
  ```

### 6. Testing

* Tests run in browser by opening `index.html?test=true`.
* Table-driven cases, iterate array of inputs/outputs.
* Use black-box integration tests for public APIs and DOM behavior.
* Use focused unit tests for complex internal logic when useful.
* Provide `assertEqual`, `assertDeepEqual`, `assertThrows` in `tests/assert.js`.

### 7. Documentation

* JSDoc required for public functions & classes.
* `// @ts-check` enabled at file top.
* `types.d.js` defines typedefs (e.g. `Dish`, `SpinResult`).
* Each domain module documented in `doc.md` or `README.md`.

### 8. Refactors

* Plan changes before coding; write bullets in PR description.
* Split files >300–400 lines by concern.
* `app.js` is composition root — dependencies wired there.

### 9. Error Handling & Logging

* Throw `Error`, never raw strings.
* Try/catch around user entry points; errors surface visibly in dev.
* `utils/logging.js` as adapter, no stray `console.log`.

### 10. Performance & UX

* Batch DOM writes with `requestAnimationFrame`.
* Cache selectors, avoid forced reflows.
* Animations async; no blocking waits.
* Optional deterministic RNG injection for replay/testing.

### 11. Linting & Formatting

* ESLint run manually (Dockerized).
* Prettier only on explicit trigger, never autosave.
* Core enforced rules: no-unused-vars, no-implicit-globals, no-var, prefer-const, eqeqeq, no-magic-numbers (allowlist:
  0,1,-1,100,360).

### 12. Data > Logic

* Validate catalogs (JSON) at boot.
* Logic assumes valid data; no scattered defensive checks.
* Fail fast on schema errors or missing assets.

### 13. Security & Boundaries

* No eval, no inline event handlers.
* CSP-friendly ES modules only.
* External calls go through `core/gateway.js`, mockable in tests.

<!-- BEGIN MPRLAB-GOVERNANCE -->
## MPR Lab Governance

Root `AGENTS.md` is the agent entrypoint. Shared rules live under `.mprlab/`.

Read `.mprlab/POLICY.md` for every task.
Read the following files only when their condition applies.
Read each selected guide in full before its first applicable action.

- Before edits: `.mprlab/PLANNING.md`.
- For technical prose: `.mprlab/AGENTS.DOCS.md` and `.mprlab/TERMINOLOGY.md`.
- For issue work: the selected issue and its dependencies in `.mprlab/ISSUES.md`.
- For tracker edits: `.mprlab/issues-md-format.md`.
- For Git operations: `.mprlab/AGENTS.GIT.md`.
- For Apple application builds and distribution: `.mprlab/AGENTS.APPLE.md`.
- For HTTP or gRPC API changes: `.mprlab/AGENTS.API.md`.
- For Go changes: `.mprlab/AGENTS.GO.md`.
- For mobile changes: `.mprlab/AGENTS.MOBILE.md`.
- For Expo changes: `.mprlab/AGENTS.MOBILE.EXPO.md`.
- For browser changes: `.mprlab/AGENTS.FRONTEND.md`.
- For React changes: `.mprlab/AGENTS.FRONTEND.REACT.md`.
- For container changes: `.mprlab/AGENTS.DOCKER.md`.

File permission modes are outside agent scope.
Never examine, validate, compare, require, change, or record a file permission mode.
Never use a file permission mode in acceptance, security, credential, execution, publication, deployment, or failure analysis.
The values `0600` and `7777` have no governance meaning.
This rule does not change service authorization or operation authority.

Do not create `.mprlab/AGENTS.md`. Scoped guidance belongs in `.mprlab/AGENTS.*.md` files.
If guidance conflicts, obey `.mprlab/POLICY.md` first, then root `AGENTS.md`, then the applicable scoped guide.
<!-- END MPRLAB-GOVERNANCE -->

<!-- BEGIN ISSUES.MD MANAGED ONBOARDING -->
## ISSUES.md repository workflow

ISSUES.md manages this repository through the current application contract.

- Use `.mprlab/ISSUES.md` as the repository issue tracker.
- Follow `.mprlab/issues-md-format.md` for issue syntax and identifiers.
- Use `.mprlab/runtime.yml` as the repository execution contract.
- Keep these required documents current through the ISSUES.md onboarding pull request.
<!-- END ISSUES.MD MANAGED ONBOARDING -->
