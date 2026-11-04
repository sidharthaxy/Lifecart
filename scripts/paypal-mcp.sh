#!/usr/bin/env bash
# Starts PayPal's MCP server (sandbox) for coding agents such as Claude Code.
# It reads PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET from .env.local and fetches a
# fresh access token each time (tokens expire after about 9 hours).
set -euo pipefail
cd "$(dirname "$0")/.."

get() { grep -E "^$1=" .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' ; }
ID="$(get PAYPAL_CLIENT_ID)"; SECRET="$(get PAYPAL_CLIENT_SECRET)"
if [[ -z "$ID" || -z "$SECRET" ]]; then
  echo "paypal-mcp: add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to .env.local first" >&2
  exit 1
fi

TOKEN="$(curl -s https://api-m.sandbox.paypal.com/v1/oauth2/token \
  -u "$ID:$SECRET" -d grant_type=client_credentials \
  | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
if [[ -z "$TOKEN" ]]; then
  echo "paypal-mcp: could not get an access token; check the sandbox credentials" >&2
  exit 1
fi

export PAYPAL_ACCESS_TOKEN="$TOKEN" PAYPAL_ENVIRONMENT=SANDBOX
exec npx -y @paypal/mcp@1.8.1 --tools=all
