# AGENTS.FRONTEND.REACT.md

## Scope

Framework guidance for React frontends. Use this only when the repo actually uses React.

## React Principles

- Components render validated state and emit user intent.
- Keep effectful work in explicit boundary modules or hooks.
- Keep domain transitions in pure helpers where practical.
- Use reducers or explicit transition helpers for complex state changes.
- Keep one source of truth for each workflow state.
- Derive display values instead of storing duplicated derived state.

## Boundaries

- Validate browser inputs, bootstrap data, imported files, local storage, backend payloads, and event streams at the boundary.
- Backend clients own request construction, response parsing, and malformed-payload errors.
- Components do not call `fetch` directly when a backend client exists or should exist.
- Do not encode product states as ad-hoc component strings; use constants or closed sets.

## Effects

- Cancel timers, event streams, object URLs, probes, subscriptions, and pending async work from effects that create them.
- Guard async completion handlers against stale active workflow or selected entity state.
- Avoid full-tree rerenders for high-frequency animation or pointer work.
- Do not catch and ignore invariant violations.

## Generated Outputs

- Edit source files first.
- Treat generated bundles or static outputs as build products.
- Do not hand-edit generated outputs.
- Rebuild through the documented build target when source or package changes affect shipped assets.

## Testing

- Prefer integration and end-to-end coverage through the real page or app shell.
- For backend-adapter changes, add adapter contract tests before broader UI assertions.
- For visible workflow changes, assert rendered behavior, DOM state, emitted events, requests, or downloaded artifacts.
- Run the documented lint, test, build, and CI targets required by the active work.
