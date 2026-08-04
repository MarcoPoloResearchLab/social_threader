# Thread Transformation API

The Social Threader API exposes one protected thread transformation resource. The browser uses this API only after authenticated lifecycle settlement.

The canonical machine contract is [api/openapi.yml](../api/openapi.yml).

## Origins And Authentication

The hosted API origin is `https://threader-api.mprlab.com`.

The API permits only `https://threader.mprlab.com` for credentialed hosted requests. It returns no CORS access header for another origin.

The browser sends `credentials: include`. The API validates the profile-specific TAuth session cookie.

CORS does not authenticate a request. A missing, invalid, or wrong-tenant session returns `401`.

## Create A Thread Transformation

Send `POST /v1/thread-transformations` with `Content-Type: application/json`.

The request body has exactly three fields:

```json
{
  "operation": "polish",
  "text": "Original thread text",
  "request_id": "non-secret-client-id"
}
```

`operation` accepts only `polish`, `expand`, or `punch_up`.

`text` must contain valid nonblank text. It has a configured maximum of 12,000 characters.

`request_id` must contain 8 through 128 letters, digits, underscores, or hyphens. It must not contain a secret.

The browser must not send a prompt, provider, model, reasoning effort, output budget, web-search flag, proxy URL, or credential.

Success returns `200` with exactly four fields:

```json
{
  "operation": "polish",
  "text": "Revised thread text",
  "request_id": "non-secret-client-id",
  "template_version": "polish.v1"
}
```

The API returns plain text inside JSON. The browser inserts this value with `textContent`.

All API responses use `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

## Idempotency

The API connects one request ID to one authenticated subject and one source fingerprint. The idempotency record expires after 600 seconds.

An exact retry of a successful request returns the cached result. It does not start another LLM Proxy completion.

The API removes failed admission and transformation records from the idempotency map. A later explicit request can succeed after a temporary limit or upstream failure clears.

Reuse with a different operation or source returns `409 request_id_conflict`.

## Errors

Errors use one representation:

```json
{
  "error": {
    "code": "authentication_required",
    "message": "An authenticated session is required."
  }
}
```

The API can return these status groups:

| Status | Stable codes | Meaning |
| --- | --- | --- |
| `400` | `invalid_media_type`, `invalid_request`, `invalid_request_id`, `invalid_text`, `origin_not_allowed`, `unknown_operation` | The request does not match the API contract. |
| `401` | `authentication_required` | The request has no valid profile session. |
| `409` | `request_id_conflict` | The request ID has a different fingerprint. |
| `413` | `request_too_large`, `input_too_large` | The body or source exceeds its configured limit. |
| `429` | `concurrency_limited`, `rate_limited` | Admission limits reject the request. |
| `502` | `invalid_completion`, `upstream_failure` | LLM Proxy did not return a usable result. |
| `503` | `capacity_unavailable`, `request_canceled` | Capacity or request cancellation stopped the operation. |
| `504` | `upstream_timeout` | The configured request timeout expired. |

The API does not return provider bodies, raw proxy errors, prompts, credentials, or stack traces.

An unsupported method returns `405` and an `Allow` header. An unknown path returns `404 resource_not_found`.

## Health

Send `GET /healthz`.

Success returns `200`:

```json
{
  "status": "ok"
}
```

Health success proves only that the API process can serve requests. It does not prove TAuth, CORS, LLM Proxy, or provider readiness.
