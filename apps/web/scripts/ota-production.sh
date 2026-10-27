#!/bin/sh
# Publish an OTA update to the `production` channel.
#
# `eas update` bundles locally, and EXPO_PUBLIC_* values from eas.json's build
# profiles are NOT applied to it — without this, the bundle silently falls
# back to http://localhost:3000 and the app hangs on "Veri yükleniyor".
# --clear-cache is required too: Metro otherwise reuses modules transformed
# with the previous (missing) env values.
#
# Usage: scripts/ota-production.sh "message" [ios|android|all]
set -e
cd "$(dirname "$0")/.."
message="${1:?usage: scripts/ota-production.sh \"message\" [ios|android|all]}"
platform="${2:-ios}"

export $(jq -r '.build.production.env | to_entries[] | "\(.key)=\(.value)"' eas.json)

npx eas-cli update --channel production --platform "$platform" --clear-cache --message "$message" --non-interactive

# Fail loudly if the bundle didn't pick up the production API URL.
for bundle in dist/_expo/static/js/*/entry-*.hbc; do
  if ! grep -q -a "$EXPO_PUBLIC_API_URL" "$bundle"; then
    echo "ERROR: $bundle does not contain $EXPO_PUBLIC_API_URL — republish immediately" >&2
    exit 1
  fi
done
echo "Verified: bundle points at $EXPO_PUBLIC_API_URL"
