#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Create the DynamoDB Scoreboard table used by the API.

Defaults:
  - Table name: space-ship-generator-scoreboard-<stage> (stage defaults to "dev")
  - Region: from $AWS_REGION or us-east-1
  - Billing: PAY_PER_REQUEST (on-demand)

Usage:
  createScoreboardTable.sh [--stage <stage>] [--region <aws-region>] [--profile <aws-profile>] [--table-name <name>]

Options:
  --stage, -s       Serverless stage to derive the table name (default: dev)
  --region, -r      AWS region (default: env AWS_REGION or us-east-1)
  --profile, -p     AWS profile to use (default: env AWS_PROFILE or default chain)
  --table-name, -t  Explicit table name (overrides derived name)
  -h, --help        Show this help

Examples:
  ./bin/createScoreboardTable.sh
  ./bin/createScoreboardTable.sh --stage prod --region us-west-2
  ./bin/createScoreboardTable.sh -t custom-scoreboard-table -p myprofile
EOF
}

STAGE="dev"
REGION="${AWS_REGION:-us-east-1}"
PROFILE="${AWS_PROFILE:-}"
TABLE_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stage|-s)
      [[ $# -lt 2 ]] && { echo "--stage requires a value" >&2; exit 1; }
      STAGE="$2"; shift 2 ;;
    --region|-r)
      [[ $# -lt 2 ]] && { echo "--region requires a value" >&2; exit 1; }
      REGION="$2"; shift 2 ;;
    --profile|-p)
      [[ $# -lt 2 ]] && { echo "--profile requires a value" >&2; exit 1; }
      PROFILE="$2"; shift 2 ;;
    --table-name|-t)
      [[ $# -lt 2 ]] && { echo "--table-name requires a value" >&2; exit 1; }
      TABLE_NAME="$2"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1 ;;
  esac
done

if ! command -v aws >/dev/null 2>&1; then
  echo "Error: aws CLI not found. Install AWS CLI v2: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html" >&2
  exit 1
fi

DERIVED_TABLE="space-ship-generator-scoreboard-${STAGE}"
TABLE_NAME="${TABLE_NAME:-$DERIVED_TABLE}"

AWS_ARGS=("--region" "$REGION")
if [[ -n "$PROFILE" ]]; then
  AWS_ARGS+=("--profile" "$PROFILE")
fi

echo "Ensuring DynamoDB table exists: $TABLE_NAME (region: $REGION${PROFILE:+, profile: $PROFILE})"

set +e
aws dynamodb describe-table "${AWS_ARGS[@]}" --table-name "$TABLE_NAME" >/dev/null 2>&1
DESC_RC=$?
set -e

if [[ $DESC_RC -eq 0 ]]; then
  echo "Table already exists: $TABLE_NAME"
  # Validate key schema matches expected: pk (S) HASH, sk (N) RANGE
  EXISTING_PK_ATTR=$(aws dynamodb describe-table "${AWS_ARGS[@]}" --table-name "$TABLE_NAME" --query 'Table.KeySchema[?KeyType==`HASH`].AttributeName' --output text)
  EXISTING_PK_TYPE=$(aws dynamodb describe-table "${AWS_ARGS[@]}" --table-name "$TABLE_NAME" --query 'Table.AttributeDefinitions[?AttributeName==`pk`].AttributeType' --output text)
  EXISTING_SK_ATTR=$(aws dynamodb describe-table "${AWS_ARGS[@]}" --table-name "$TABLE_NAME" --query 'Table.KeySchema[?KeyType==`RANGE`].AttributeName' --output text)
  EXISTING_SK_TYPE=$(aws dynamodb describe-table "${AWS_ARGS[@]}" --table-name "$TABLE_NAME" --query 'Table.AttributeDefinitions[?AttributeName==`sk`].AttributeType' --output text)

  if [[ "$EXISTING_PK_ATTR" == "pk" && "$EXISTING_PK_TYPE" == "S" && "$EXISTING_SK_ATTR" == "sk" && "$EXISTING_SK_TYPE" == "N" ]]; then
    echo "Schema OK: pk(S) + sk(N)"
    exit 0
  else
    echo "WARNING: Existing table schema does not match expected keys." >&2
    echo "  Expected: pk (S) HASH, sk (N) RANGE" >&2
    echo "  Found:    pk=$EXISTING_PK_ATTR($EXISTING_PK_TYPE), sk=$EXISTING_SK_ATTR($EXISTING_SK_TYPE)" >&2
    echo "This app writes numeric 'sk' and queries by pk, so a string sk will cause ValidationException." >&2
    echo "Options:" >&2
    echo "  - Create a new table with a different name using --table-name and point SCOREBOARD_TABLE to it" >&2
    echo "  - Or delete the existing table manually and re-run this script to recreate it" >&2
    exit 2
  fi
fi

echo "Creating table $TABLE_NAME ..."
aws dynamodb create-table "${AWS_ARGS[@]}" \
  --table-name "$TABLE_NAME" \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions \
    AttributeName=pk,AttributeType=S \
    AttributeName=sk,AttributeType=N \
  --key-schema \
    AttributeName=pk,KeyType=HASH \
    AttributeName=sk,KeyType=RANGE \
  >/dev/null

echo "Waiting for table to become ACTIVE ..."
aws dynamodb wait table-exists "${AWS_ARGS[@]}" --table-name "$TABLE_NAME"

echo "Done. Table is ACTIVE: $TABLE_NAME"
echo "Tip: set SCOREBOARD_TABLE=$TABLE_NAME in your environment if invoking functions locally."
