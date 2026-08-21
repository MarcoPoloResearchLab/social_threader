# Social Threader

Social Threader splits long text into ordered social posts. It preserves sentence, paragraph, punctuation, quotation, and image boundaries.

The browser frontend also offers optional authenticated thread transformations. Guest users can always split, review, and copy a draft without authentication.

Use the hosted frontend at [threader.mprlab.com](https://threader.mprlab.com/).

## Product Functions

- Use 280, 300, or 500 character presets.
- Set a custom character limit.
- Prefer sentence or paragraph boundaries.
- Add post enumeration.
- Review live text statistics.
- Copy text and image chunks.
- Use the same chunk logic in the Expo mobile client.

### Improve With AI

The `Improve with AI` toolbar appears above the main editor. It has three closed operations:

- `Polish` improves grammar, clarity, cohesion, and flow.
- `Expand` adds connective detail, explanation, and structure.
- `Punch Up` strengthens the hook, cadence, transitions, and ending.

Each operation preserves the source language and factual meaning. Each operation also preserves names, URLs, mentions, hashtags, and quoted claims.

The browser sends only the current plain-text draft to the protected API. The application does not persist source or transformed text.

The controls require an authenticated `mpr-ui` lifecycle. The app uses the documented public startup snapshot when that optional helper is present. The normal split and copy functions remain available to guest users.

An image disables every thread transformation control. The browser does not upload, remove, move, or replace the image.

A completed request creates a plain-text preview. The user must select `Apply`, `Discard`, or `Try again`.

`Apply` uses the normal editor input lifecycle. It recalculates chunks and statistics, resets copy state, and offers one replacement `Undo`.

## Architecture

The browser frontend uses CDN dependencies and native ES modules. It has no application build step.

The Go API owns authentication, request limits, prompt policy, LLM Proxy access, and content-free logs.

Read [doc.md](doc.md) for module and data-flow details. Read [docs/api.md](docs/api.md) for the HTTP contract.

The machine-readable API contract is [api/openapi.yml](api/openapi.yml).

## Local Browser Use

Open `index.html` directly to use guest thread splitting. The protected thread transformation needs the local stack or the hosted API.

## Local Stack

The local stack includes these services:

- A Caddy frontend at `http://localhost:4173`.
- The Social Threader API.
- TAuth with a local profile.
- A fake LLM Proxy with no provider connection.

Install Go 1.26.5, Node.js 20 or later, Docker, and Docker Compose.

1. Copy the tracked environment template.

   ```bash
   cp .env.example .env
   ```

2. Replace each placeholder before non-smoke development.

3. Start the local stack.

   ```bash
   make local-up
   ```

4. Open `http://localhost:4173`.

5. Run the local TAuth and fake-proxy smoke test.

   ```bash
   make local-smoke
   ```

6. Stop the local stack.

   ```bash
   make local-down
   ```

The smoke test uses a seeded local-only TAuth user. It verifies session issuance, API authorization, logout, and fake-proxy routing.

The smoke user password is `social-threader-local-smoke`. Do not use this local profile or credential in a hosted environment.

## Configuration

`configs/config.yml` is the only backend config. Startup fails for an unknown field, a missing field, or an invalid value.

The `llm_proxy` block contains only connection and model-routing values. Paid-compute limits remain in the separate `limits` block.

The backend reads these environment values:

- `SOCIAL_THREADER_PROFILE` selects `local` or `hosted`.
- `LLM_PROXY_BASE_URL` identifies the official LLM Proxy endpoint.
- `LLM_PROXY_SECRET` contains the dedicated Social Threader tenant secret.
- `TAUTH_JWT_SIGNING_KEY` validates the selected TAuth tenant session.

`config-app.json` selects the browser API origin. `config-ui.yaml` is the only app-owned `mpr-ui` authentication config.

The hosted profile uses these origins:

| Surface | Origin |
| --- | --- |
| Frontend | `https://threader.mprlab.com` |
| API | `https://threader-api.mprlab.com` |
| TAuth browser API | `https://tauth-api.mprlab.com` |

The hosted session cookie uses `.mprlab.com`, `Secure`, and `SameSite=Lax`. The API permits only the exact hosted frontend origin.

## Validation

Install browser dependencies once:

```bash
npm ci
```

Run the repository CI gate:

```bash
make ci
```

The gate runs these checks:

- Happy DOM browser contracts.
- Puppeteer real-browser contracts.
- All Go tests.
- `go vet ./...`.
- `go mod verify`.
- Expo mobile tests, config checks, and bundle checks.

Run container checks separately:

```bash
make local-config LOCAL_ENV_FILE=.env.example
make container-check
```

Run `make local-smoke` separately to verify the local stack. The smoke test does not make a paid provider call.

Read [docs/prompt-quality.md](docs/prompt-quality.md) for the prompt fixture corpus and the human review rubric.

## Mobile Client

The Expo mobile client remains under `mobile/`. F001 does not add thread transformations to that client.

Run the mobile client:

```bash
make mobile-install
make run-ios
make run-android
```

Run the mobile validation gate:

```bash
make mobile-check
```

The versionless manifest preserves the Android store artifact. Native thread transformation needs its own TAuth profile and session contract.

## Release, Publish, And Deployment

`.mprlab/deploy/resources.yml` is the only tracked production deployment manifest. Its permanent versionless contract uses the SemVer release scheme.

The manifest declares these resources:

- The immutable API image and runtime service.
- The public API route and health check.
- The Pages frontend.
- The Android mobile artifact.
- The TAuth tenant contribution.
- The dedicated private values.

The Android resource uses the repository-owned local build script. The store tooling supports preflight, exact reconciliation, and submission.

The gateway adds `CNAME`, `.nojekyll`, and the release marker to the Pages artifact. Application source does not own these files.

Root lifecycle commands delegate to the exact sibling `../mprlab-gateway` checkout:

```bash
make release && make publish && make deploy
```

These commands take no arguments. Do not use the removed app-owned Pages scripts.

Configure the Android upload key and Google Application Default Credentials before `make release`. See [mobile/README.md](mobile/README.md).

Create `.mprlab/deploy/.env` as a private mode-`0600` file before `make deploy`. Supply these operator values:

```dotenv
SOCIAL_THREADER_GOOGLE_WEB_CLIENT_ID=
SOCIAL_THREADER_LLM_PROXY_SECRET=
SOCIAL_THREADER_TAUTH_JWT_SIGNING_KEY=
```

The operator owns production deployment. Ordinary implementation validation must not run `make deploy`.

Release runs CI once and seals each declared artifact. Publish consumes only that sealed release. Deploy consumes only the sealed publication.

Hosted acceptance is separate from local and CI evidence. It requires DNS, TLS, CORS, TAuth, route, and explicitly authorized live-provider checks.

## Public Resource Guides

The [resource library](https://threader.mprlab.com/resources/) documents supported split workflows and browser implementation details.

## License

Social Threader uses the [MIT License](LICENSE).
