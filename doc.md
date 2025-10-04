# Social Threader Architecture Overview

This document summarizes the modular ES-module architecture introduced during the refactor.

## Directory Layout

- `assets/css/main.css` – Styling extracted from `index.html`.
- `js/constants.js` – Immutable configuration (strings, presets, toggles).
- `js/types.d.js` – Shared JSDoc typedefs used across modules.
- `js/utils/` – Generic utilities such as logging and template interpolation.
- `js/core/chunking.js` – Pure text processing functions.
- `js/ui/` – View models and controller wiring for DOM interactions.
- `js/app.js` – Composition root executed by `index.html`.
- `tests/` – Browser-based harness with unit and integration coverage.

## Module Responsibilities

### Core Logic (`js/core/chunking.js`)
Implements the chunking algorithm, sentence detection, and statistics gathering without touching the DOM.

### UI Layer (`js/ui/`)
- `inputPanel.js` – Manages the textarea, stats, and error messaging.
- `formControls.js` – Handles preset buttons, custom length input, and toggle interactions.
- `chunkListView.js` – Renders chunk results and coordinates copy affordances.
- `controller.js` – Orchestrates state changes and delegates to the above view models.

### Rich Media Lifecycle
Images pasted or dropped into the editor are intercepted by `InputPanel`. The file payloads are converted to base64 data URLs, rendered as sanitized `<img>` elements, and tracked as `{ placeholderToken, dataUrl, altText }` records inside the document snapshot (`inputPanel.js:283`). During snapshot creation the images are replaced with deterministic placeholder tokens so the chunker can treat them as inline markers while preserving ordering.

When the controller assembles chunks it passes the snapshot’s image records to `richTextHelpers.buildChunkContents`, ensuring every image chunk carries both the HTML snippet and the original data URL. Copy requests (`controller.js:290`) rebuild a `ClipboardItem` that always includes plain-text fallbacks, optional HTML wrappers, and—in the image case—a `Blob` reconstructed from the stored data URL. Browsers without rich clipboard support seamlessly fall back to text-only copies, while capable environments receive the full image payload.

### Utilities
- `utils/logging.js` – Centralized logging adapter and helpers.
- `utils/templates.js` – Lightweight string interpolation helper.

### Composition (`js/app.js`)
Bootstraps DOM references, instantiates view models, initializes the controller, and configures the Formspree widget.

### Testing (`tests/`)
- `headlessHarness.js` – Node-based happy-dom runner for automated execution (`npm test`).
- `browserHarness.js` – Browser bootstrap invoked when the production page is launched with `?test=true`.
- `assert.js` / `runner.js` – Minimal assertion and reporting utilities.
- `chunking.test.js` – Table-driven unit tests for the core algorithm.
- `integration.test.js` – Black-box tests exercising the UI controller and DOM updates.
