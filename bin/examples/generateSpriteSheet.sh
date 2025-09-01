#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: generateSpriteSheet.sh --image-url <primaryImageUrl>

Generates the variant sprites (thruster / muzzle combinations) for an existing
primary spaceship image previously created via generateSpaceShip.

Options:
  --image-url, -u  The primary image URL (required)
  --host <host>    Host for local serverless offline (default: localhost)
  --port <port>    Port for local serverless offline (default: 3000)
  --url <url>      Full endpoint override (e.g. https://api-id.execute-api.us-east-1.amazonaws.com/generate-sprite-sheet)
  --extract-from <jsonFile>  Read the primary URL from a JSON response file produced by generateSpaceShip (looks in .sprites.trustersOnMuzzleOn.url)
  -h, --help       Show this help and exit

Environment overrides:
  HOST, PORT, URL may also be set.

Examples:
  ./bin/examples/generateSpriteSheet.sh --image-url "https://space-ship-sprites.s3.amazonaws.com/generated/uuid.png"
  HOST=127.0.0.1 PORT=3001 ./bin/examples/generateSpriteSheet.sh -u "https://.../generated/uuid.png"
  ./bin/examples/generateSpriteSheet.sh --extract-from primary.json

To combine results after both calls (with jq):
  jq -s '.[0].sprites * .[1].sprites' primary.json variants.json
EOF
}

IMAGE_URL=""
EXTRACT_FROM=""
HOST=${HOST:-localhost}
PORT=${PORT:-3000}
URL=${URL:-}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image-url|-u)
      [[ $# -lt 2 ]] && { echo "--image-url requires a value" >&2; exit 1; }
      IMAGE_URL="$2"; shift 2 ;;
    --extract-from)
      [[ $# -lt 2 ]] && { echo "--extract-from requires a file" >&2; exit 1; }
      EXTRACT_FROM="$2"; shift 2 ;;
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

if [[ -n "$EXTRACT_FROM" ]]; then
  if ! command -v jq >/dev/null 2>&1; then
    echo "jq is required for --extract-from" >&2
    exit 1
  fi
  if [[ ! -f "$EXTRACT_FROM" ]]; then
    echo "File not found: $EXTRACT_FROM" >&2
    exit 1
  fi
  IMAGE_URL=$(jq -r '.sprites.trustersOnMuzzleOn.url // empty' "$EXTRACT_FROM")
fi

[[ -z "$IMAGE_URL" ]] && { echo "Error: --image-url (or --extract-from) is required" >&2; usage >&2; exit 1; }

if [[ -z "$URL" ]]; then
  URL="http://$HOST:$PORT/generate-sprite-sheet"
fi

json_escape() {
  local s="$1"
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/}
  printf '%s' "$s"
}

PAYLOAD="{\"imageUrl\":\"$(json_escape "$IMAGE_URL")\"}"

echo "POST $URL" >&2
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

STATUS_CODE=$(printf '%s' "$HTTP_RESPONSE" | tail -n1)
BODY=$(printf '%s' "$HTTP_RESPONSE" | sed '$d')

echo "Response (status $STATUS_CODE):" >&2
if command -v jq >/dev/null 2>&1; then
  printf '%s' "$BODY" | jq . || printf '%s' "$BODY"
else
  printf '%s\n' "$BODY"
fi

if [[ "$STATUS_CODE" != 200 ]]; then
  echo "Request failed with status $STATUS_CODE" >&2
  exit 1
fi

# Extract and print variant URLs if jq available
if command -v jq >/dev/null 2>&1; then
  echo "Variant URLs:" >&2
  printf '%s' "$BODY" | jq -r '.sprites | to_entries[] | select(.value.url!=null) | "  " + .key + ": " + .value.url'
fi
