#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ -f "$ENV_FILE" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" != *"="* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    key="$(echo "$key" | tr -d '[:space:]')"
    export "$key=$value"
  done < "$ENV_FILE"
fi

REALM="${KEYCLOAK_REALM:-randonneur}"
KC_CONTAINER="${KEYCLOAK_CONTAINER:-randonneur-keycloak-1}"
KC_SERVER="${KEYCLOAK_SERVER:-http://127.0.0.1:8080}"

if [[ -z "${KEYCLOAK_ADMIN:-}" || -z "${KEYCLOAK_ADMIN_PASSWORD:-}" ]]; then
  echo "Missing KEYCLOAK_ADMIN or KEYCLOAK_ADMIN_PASSWORD in $ENV_FILE"
  exit 1
fi

if [[ -z "${GOOGLE_CLIENT_ID:-}" || -z "${GOOGLE_CLIENT_SECRET:-}" ]]; then
  echo "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in $ENV_FILE"
  echo "Google Cloud Console redirect URI:"
  echo "  https://audax.3chan.kr/realms/$REALM/broker/google/endpoint"
  exit 1
fi

echo "[1/3] Login to Keycloak admin API"
docker exec -e KCADM_USER="$KEYCLOAK_ADMIN" \
  -e KCADM_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD" \
  "$KC_CONTAINER" \
  /opt/keycloak/bin/kcadm.sh config credentials \
  --server "$KC_SERVER" \
  --realm master \
  --user "$KEYCLOAK_ADMIN" \
  --password "$KEYCLOAK_ADMIN_PASSWORD" >/dev/null

echo "[2/3] Create or update Google identity provider"
if docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get "identity-provider/instances/google" -r "$REALM" >/dev/null 2>&1; then
  docker exec -e GCLIENT_ID="$GOOGLE_CLIENT_ID" \
    -e GCLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
    "$KC_CONTAINER" \
    /opt/keycloak/bin/kcadm.sh update "identity-provider/instances/google" -r "$REALM" \
    -s enabled=true \
    -s trustEmail=true \
    -s storeToken=true \
    -s addReadTokenRoleOnCreate=true \
    -s firstBrokerLoginFlowAlias="first broker login" \
    -s authenticateByDefault=false \
    -s 'config.clientId='"$GOOGLE_CLIENT_ID" \
    -s 'config.clientSecret='"$GOOGLE_CLIENT_SECRET" \
    -s 'config.defaultScope=openid profile email' \
    -s 'config.guiOrder=1' \
    -s 'config.syncMode=FORCE' >/dev/null
else
  docker exec -e GCLIENT_ID="$GOOGLE_CLIENT_ID" \
    -e GCLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
    "$KC_CONTAINER" \
    /opt/keycloak/bin/kcadm.sh create "identity-provider/instances" -r "$REALM" \
    -s alias=google \
    -s providerId=google \
    -s enabled=true \
    -s displayName=Google \
    -s trustEmail=true \
    -s storeToken=true \
    -s addReadTokenRoleOnCreate=true \
    -s firstBrokerLoginFlowAlias="first broker login" \
    -s authenticateByDefault=false \
    -s 'config.clientId='"$GOOGLE_CLIENT_ID" \
    -s 'config.clientSecret='"$GOOGLE_CLIENT_SECRET" \
    -s 'config.defaultScope=openid profile email' \
    -s 'config.guiOrder=1' \
    -s 'config.syncMode=FORCE' >/dev/null
fi

echo "[3/3] Verify Google identity provider"
docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get "identity-provider/instances/google" -r "$REALM" \
  | sed -n '1,120p'

echo
echo "Done. Google social login should now be visible on the Keycloak login page."
