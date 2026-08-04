#!/usr/bin/env bash
set -euo pipefail

base_url="${SOCIAL_THREADER_LOCAL_URL:-http://localhost:4173}"
temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/social-threader-smoke.XXXXXX")"
cookie_jar="${temporary_directory}/cookies.txt"
response_file="${temporary_directory}/response.json"

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

login_status="$(request_status \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Origin: http://localhost:4173' \
  --cookie-jar "${cookie_jar}" \
  --data '{"email":"local-smoke@social-threader.invalid","password":"social-threader-local-smoke"}' \
  "${base_url}/auth/password/login")"
[[ "${login_status}" == "200" ]]

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
  --request POST \
  --header 'Origin: http://localhost:4173' \
  --cookie "${cookie_jar}" \
  --cookie-jar "${cookie_jar}" \
  "${base_url}/auth/logout")"
[[ "${logout_status}" == "204" ]]

post_logout_status="$(request_status \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Origin: http://localhost:4173' \
  --cookie "${cookie_jar}" \
  --data '{"operation":"polish","text":"Local smoke draft.","request_id":"local-smoke-after-logout"}' \
  "${base_url}/v1/thread-transformations")"
[[ "${post_logout_status}" == "401" ]]

printf '%s\n' 'local Social Threader TAuth and fake-proxy smoke test passed'
