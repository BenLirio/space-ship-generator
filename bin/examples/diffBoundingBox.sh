#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: diffBoundingBox.sh --image-a <url> --image-b <url> [options]

Options:
  --image-a <url>        First image URL (required)
  --image-b <url>        Second image URL (required)
  --threshold <float>    Diff threshold 0..1 (default: 0.05)
  --min-box-area <int>   Minimum bounding box area in pixels (default: 4)
  --min-cluster-pixels N Minimum number of differing pixels in a component (default: 8)
  --url <url>            Override full endpoint URL (default: http://$HOST:$PORT/diff-bounding-box)
  --host <host>          Host for local serverless offline (default: localhost)
  --port <port>          Port for local serverless offline (default: 3000)
  --out-dir <name>       Subfolder name inside ./diff-output/ to store downloaded + annotated images (default: timestamp)
  -h, --help             Show this help

Env overrides:
  HOST, PORT, URL

Examples:
  ./bin/examples/diffBoundingBox.sh --image-a https://example.com/a.png --image-b https://example.com/b.png
  ./bin/examples/diffBoundingBox.sh --image-a a.png --image-b b.png --threshold 0.1
EOF
}

IMAGE_A=""
IMAGE_B=""
THRESHOLD=""
MIN_BOX_AREA=""
MIN_CLUSTER_PIXELS=""
HOST=${HOST:-localhost}
PORT=${PORT:-3000}
URL=${URL:-}
OUT_DIR=""
ROOT_OUT_DIR="diff-output"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image-a)
      [[ $# -lt 2 ]] && { echo "--image-a requires a value" >&2; exit 1; }
      IMAGE_A="$2"; shift 2 ;;
    --image-b)
      [[ $# -lt 2 ]] && { echo "--image-b requires a value" >&2; exit 1; }
      IMAGE_B="$2"; shift 2 ;;
    --threshold)
      [[ $# -lt 2 ]] && { echo "--threshold requires a value" >&2; exit 1; }
      THRESHOLD="$2"; shift 2 ;;
    --min-box-area)
      [[ $# -lt 2 ]] && { echo "--min-box-area requires a value" >&2; exit 1; }
      MIN_BOX_AREA="$2"; shift 2 ;;
    --min-cluster-pixels)
      [[ $# -lt 2 ]] && { echo "--min-cluster-pixels requires a value" >&2; exit 1; }
      MIN_CLUSTER_PIXELS="$2"; shift 2 ;;
    --host)
      [[ $# -lt 2 ]] && { echo "--host requires a value" >&2; exit 1; }
      HOST="$2"; shift 2 ;;
    --port)
      [[ $# -lt 2 ]] && { echo "--port requires a value" >&2; exit 1; }
      PORT="$2"; shift 2 ;;
    --url)
      [[ $# -lt 2 ]] && { echo "--url requires a value" >&2; exit 1; }
      URL="$2"; shift 2 ;;
    --out-dir)
      [[ $# -lt 2 ]] && { echo "--out-dir requires a value" >&2; exit 1; }
      OUT_DIR="$2"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1 ;;
  esac
done

[[ -z "$IMAGE_A" || -z "$IMAGE_B" ]] && { echo "Error: --image-a and --image-b are required" >&2; usage >&2; exit 1; }

if [[ -z "$URL" ]]; then
  URL="http://$HOST:$PORT/diff-bounding-box"
fi

if [[ -z "$OUT_DIR" ]]; then
  SUBFOLDER="$(date +%Y%m%d-%H%M%S)"
else
  # Sanitize: remove leading slashes to avoid escaping root dir
  SUBFOLDER="${OUT_DIR##*/}"
fi
OUT_DIR="$ROOT_OUT_DIR/$SUBFOLDER"
mkdir -p "$OUT_DIR"
echo "Using output directory: $OUT_DIR" >&2

json_escape() {
  local s="$1"
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/}
  printf '%s' "$s"
}

# Build JSON payload
PAYLOAD='{'
PAYLOAD+="\"imageUrlA\":\"$(json_escape "$IMAGE_A")\"," 
PAYLOAD+="\"imageUrlB\":\"$(json_escape "$IMAGE_B")\""
if [[ -n "$THRESHOLD" ]]; then
  PAYLOAD+=",\"threshold\":$THRESHOLD"
fi
if [[ -n "$MIN_BOX_AREA" ]]; then
  PAYLOAD+=",\"minBoxArea\":$MIN_BOX_AREA"
fi
if [[ -n "$MIN_CLUSTER_PIXELS" ]]; then
  PAYLOAD+=",\"minClusterPixels\":$MIN_CLUSTER_PIXELS"
fi
PAYLOAD+='}'

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

if command -v jq >/dev/null 2>&1; then
  echo "Summary of boxes:" >&2
  printf '%s' "$BODY" | jq -r '.boxes[] | "Box: x=\(.x) y=\(.y) w=\(.width) h=\(.height) diff=\(.diffScore|tostring) pixels=\(.pixels)"' || true
fi

# Annotate images locally (requires jq + ImageMagick)
if ! command -v jq >/dev/null 2>&1; then
  echo "jq not installed; skipping annotation." >&2
  exit 0
fi

if command -v magick >/dev/null 2>&1; then
  IM_CMD=magick
elif command -v convert >/dev/null 2>&1; then
  IM_CMD=convert
else
  echo "ImageMagick (magick/convert) not found; skipping annotation." >&2
  exit 0
fi

# Derive local filenames (strip query params)
baseA=$(basename "${IMAGE_A%%\?*}")
baseB=$(basename "${IMAGE_B%%\?*}")
A_LOCAL="$OUT_DIR/${baseA:-imageA}.png"
B_LOCAL="$OUT_DIR/${baseB:-imageB}.png"
A_ANN="$OUT_DIR/annotated-${baseA:-imageA}.png"
B_ANN="$OUT_DIR/annotated-${baseB:-imageB}.png"

echo "Downloading source images..." >&2
curl -fsSL "$IMAGE_A" -o "$A_LOCAL" || { echo "Failed to download image A" >&2; exit 1; }
curl -fsSL "$IMAGE_B" -o "$B_LOCAL" || { echo "Failed to download image B" >&2; exit 1; }

# Gather boxes
mapfile -t BOX_LINES < <(printf '%s' "$BODY" | jq -r '.boxes[] | "\(.x) \(.y) \(.width) \(.height)"') || true

if [[ ${#BOX_LINES[@]} -eq 0 ]]; then
  echo "No boxes to annotate (no differences or parsing issue)." >&2
  # Still copy originals as annotated versions
  cp "$A_LOCAL" "$A_ANN" || true
  cp "$B_LOCAL" "$B_ANN" || true
  echo "Saved originals to $A_ANN and $B_ANN" >&2
  exit 0
fi

declare -a DRAW_ARGS=()
for line in "${BOX_LINES[@]}"; do
  read -r x y w h <<<"$line"
  # bottom-right inclusive pixel -> convert wants opposite corner; we extend by width/height -1
  x2=$((x + w - 1))
  y2=$((y + h - 1))
  DRAW_ARGS+=( -draw "rectangle $x,$y $x2,$y2" )
done

echo "Annotating with ${#BOX_LINES[@]} boxes..." >&2
"$IM_CMD" "$A_LOCAL" -stroke red -strokewidth 1 -fill none "${DRAW_ARGS[@]}" "$A_ANN"
"$IM_CMD" "$B_LOCAL" -stroke red -strokewidth 1 -fill none "${DRAW_ARGS[@]}" "$B_ANN"

echo "Annotated images saved:"
echo "  $A_ANN"
echo "  $B_ANN"
echo "Output directory: $OUT_DIR"
