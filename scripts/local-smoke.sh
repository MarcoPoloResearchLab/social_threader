#!/usr/bin/env bash
set -euo pipefail

base_url="${SOCIAL_THREADER_LOCAL_URL:-http://localhost:4173}"
temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/social-threader-smoke.XXXXXX")"
cookie_jar="${temporary_directory}/cookies.txt"
response_file="${temporary_directory}/response.json"
logout_headers="${temporary_directory}/logout-headers.txt"
fixture_root="${LOCAL_TAUTH_ROOT:?make local-smoke requires the prepared fixture root}"

cleanup() {
  rm -rf "${temporary_directory}"
}
trap cleanup EXIT

request_status() {
  curl \
    --silent \
    --show-error \
    --output "${response_file}" \
    --write-out '%{http_code}' \
    "$@"
}

health_status=""
for health_attempt in {1..30}; do
  health_status="$(request_status "${base_url}/healthz" || true)"
  if [[ "${health_status}" == "200" ]]; then
    break
  fi
  sleep 1
done
[[ "${health_status}" == "200" ]]

unauthenticated_status="$(request_status \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{"operation":"polish","text":"Local smoke draft.","request_id":"local-smoke-unauthenticated"}' \
  "${base_url}/v1/thread-transformations")"
[[ "${unauthenticated_status}" == "401" ]]

nonce_status="$(request_status \
  --request POST \
  --header 'Origin: http://localhost:4173' \
  "${base_url}/auth/nonce")"
[[ "${nonce_status}" == "200" ]]
node scripts/local-tauth-session.mjs verify-nonce "${fixture_root}" "${response_file}"

node scripts/local-tauth-session.mjs issue-synthetic "${fixture_root}" "${cookie_jar}"
profile_status="$(request_status \
  --header 'Origin: http://localhost:4173' \
  --cookie "${cookie_jar}" \
  "${base_url}/me")"
[[ "${profile_status}" == "200" ]]
node scripts/local-tauth-session.mjs verify-profile "${fixture_root}" "${response_file}"

transformation_status="$(request_status \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Origin: http://localhost:4173' \
  --cookie "${cookie_jar}" \
  --data '{"operation":"polish","text":"Local smoke draft.","request_id":"local-smoke-authenticated"}' \
  "${base_url}/v1/thread-transformations")"
[[ "${transformation_status}" == "200" ]]

node --input-type=module - "${response_file}" <<'JS'
import fileSystem from "node:fs";

const response = JSON.parse(fileSystem.readFileSync(process.argv[2], "utf8"));
const expected = {
  operation: "polish",
  text: "Local fake transformation result.",
  request_id: "local-smoke-authenticated",
  template_version: "polish.v1"
};
if (JSON.stringify(response) !== JSON.stringify(expected)) {
  throw new Error("authenticated transformation response did not match the local fake contract");
}
JS

logout_status="$(request_status \
  --dump-header "${logout_headers}" \
  --request POST \
  --header 'Origin: http://localhost:4173' \
  --cookie "${cookie_jar}" \
  --cookie-jar "${cookie_jar}" \
  "${base_url}/auth/logout")"
[[ "${logout_status}" == "204" ]]
node scripts/local-tauth-session.mjs verify-logout "${fixture_root}" "${logout_headers}"

post_logout_profile_status="$(request_status \
  --header 'Origin: http://localhost:4173' \
  --cookie "${cookie_jar}" \
  "${base_url}/me")"
[[ "${post_logout_profile_status}" == "401" ]]

post_logout_status="$(request_status \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Origin: http://localhost:4173' \
  --cookie "${cookie_jar}" \
  --data '{"operation":"polish","text":"Local smoke draft.","request_id":"local-smoke-after-logout"}' \
  "${base_url}/v1/thread-transformations")"
[[ "${post_logout_status}" == "401" ]]

printf '%s\n' 'local synthetic-session /me, transformation, and logout cookie-clear checks passed'
