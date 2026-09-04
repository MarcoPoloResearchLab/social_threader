# Health endpoint

The API serves unauthenticated `GET /healthz` with `200`,
`{"status":"ok"}`, and `Cache-Control: no-store`.
The API validates its configuration before it starts. Its admission state
is in memory. It has no local database or runtime file dependency.
The probe does not call TAuth, LLM Proxy, or a model provider.
It does not enter authentication, usage, audit, or admission paths.

The local frontend serves the static `healthz` resource with no-store.
Its probe tests the frontend artifact, not the API origin.
The Pages image contains the same resource. GitHub Pages controls production
cache headers. I002 keeps that requirement open until a hosting decision is made.

Docker probes use GET and keep failure output. Each probe has a one-second
startup interval, a 30-second steady interval, and a 30-second startup period.
