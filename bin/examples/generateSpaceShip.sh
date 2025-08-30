#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: generateSpaceShip.sh --prompt "<prompt text>"

Options:
  --prompt, -p   The spaceship prompt text (required)
  --url <url>    Override full endpoint URL (default: http://$HOST:$PORT/generate-space-ship)
  --host <host>  Host for local serverless offline (default: localhost)
  --port <port>  Port for local serverless offline (default: 3000)
  -h, --help     Show this help

Environment variables:
  HOST, PORT, URL can also be set to override defaults.

Examples:
  ./bin/examples/generateSpaceShip.sh --prompt "Explorer"
  HOST=127.0.0.1 PORT=3001 ./bin/examples/generateSpaceShip.sh -p "Deep Space Scout"
  ./bin/examples/generateSpaceShip.sh --url "https://your-api-id.execute-api.us-east-1.amazonaws.com/generate-space-ship" -p "Production Call"
EOF
}

PROMPT=""
HOST=${HOST:-localhost}
PORT=${PORT:-3000}
URL=${URL:-}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prompt|-p)
      [[ $# -lt 2 ]] && { echo "--prompt requires a value" >&2; exit 1; }
      PROMPT="$2"; shift 2 ;;
    --host)
      [[ $# -lt 2 ]] && { echo "--host requires a value" >&2; exit 1; }
      HOST="$2"; shift 2 ;;
    --port)
      [[ $# -lt 2 ]] && { echo "--port requires a value" >&2; exit 1; }
      PORT="$2"; shift 2 ;;
    --url)
      [[ $# -lt 2 ]] && { echo "--url requires a value" >&2; exit 1; }
      URL="$2"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1 ;;
  esac
done

[[ -z "$PROMPT" ]] && { echo "Error: --prompt is required" >&2; usage >&2; exit 1; }

if [[ -z "$URL" ]]; then
  URL="http://$HOST:$PORT/generate-space-ship"
fi

json_escape() {
  local s="$1"
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/}
  printf '%s' "$s"
}

PAYLOAD="{\"prompt\":\"$(json_escape "$PROMPT")\"}"

echo "POST $URL"
echo "Payload: $PAYLOAD" >&2

set +e
HTTP_RESPONSE=$(curl -sS -w "\n%{http_code}" -H 'content-type: application/json' -X POST "$URL" -d "$PAYLOAD" 2>&1)
CURL_EXIT=$?
set -e

if [[ $CURL_EXIT -ne 0 ]]; then
  echo "Curl failed (exit $CURL_EXIT). Is the server running (npm run offline)?" >&2
  echo "$HTTP_RESPONSE" >&2
  exit $CURL_EXIT
fi

# Separate body and status code (last line)
STATUS_CODE=$(printf '%s' "$HTTP_RESPONSE" | tail -n1)
BODY=$(printf '%s' "$HTTP_RESPONSE" | sed '$d')

if command -v jq >/dev/null 2>&1; then
  echo "Response (status $STATUS_CODE):" >&2
  printf '%s' "$BODY" | jq . || printf '%s' "$BODY"
else
  echo "Response (status $STATUS_CODE):" >&2
  printf '%s\n' "$BODY"
fi

if [[ "$STATUS_CODE" != 200 ]]; then
  echo "Request failed with status $STATUS_CODE" >&2
  exit 1
fi

# Extract name if jq present
if command -v jq >/dev/null 2>&1; then
  URL_VAL=$(printf '%s' "$BODY" | jq -r '.imageUrl // empty')
  if [[ -n "$URL_VAL" ]]; then
    echo "Image URL: $URL_VAL" >&2
  fi
fi
