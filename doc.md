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
