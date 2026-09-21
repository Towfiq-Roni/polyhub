#!/usr/bin/env bash
# Post-deploy smoke check: poll the API health endpoint until it returns 200.
set -euo pipefail

if [ -z "${APP_HOSTNAME:-}" ]; then
  echo "ERROR: APP_HOSTNAME env var is required (e.g. 1-2-3-4.sslip.io)." >&2
  exit 1
fi

ATTEMPTS=10
SLEEP_SECONDS=3
HEALTH_URL="https://${APP_HOSTNAME}/api/v1/health"

for i in $(seq 1 "${ATTEMPTS}"); do
  STATUS="$(curl -s -o /dev/null -w '%{http_code}' "${HEALTH_URL}" || true)"
  if [ "${STATUS}" = "200" ]; then
    echo "Smoke OK: ${HEALTH_URL} returned 200 (attempt ${i}/${ATTEMPTS})."

    # TODO(TASKS.md #40): also check "https://${APP_HOSTNAME}/" for a login-page 200
    # once apps/web exists to serve one.

    exit 0
  fi
  echo "Attempt ${i}/${ATTEMPTS}: ${HEALTH_URL} returned '${STATUS}', retrying in ${SLEEP_SECONDS}s..."
  sleep "${SLEEP_SECONDS}"
done

echo "Smoke FAILED: ${HEALTH_URL} never returned 200 after ${ATTEMPTS} attempts." >&2
exit 1
