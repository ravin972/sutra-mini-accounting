#!/usr/bin/env bash
# scripts/test_replay.sh - Bash version of idempotency replay test
set -e

BASE_URL="${1:-http://localhost:8080}"
ISSUE_ID="${2:-c0000000-0000-0000-0000-000000000001}"
KEY="idem-replay-$(date +%s)"

echo "=== 1. Initial Request (Key: $KEY) ==="
curl -i -s -X POST "$BASE_URL/jobwork/receipts" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $KEY" \
  -d "{\"issue_id\":\"$ISSUE_ID\",\"qty\":1,\"received_on\":\"$(date +%Y-%m-%d)\"}"
echo ""

echo "=== 2. Replaying exact same key and payload ==="
curl -i -s -X POST "$BASE_URL/jobwork/receipts" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $KEY" \
  -d "{\"issue_id\":\"$ISSUE_ID\",\"qty\":1,\"received_on\":\"$(date +%Y-%m-%d)\"}"
echo ""

echo "=== 3. Reusing key with different quantity (qty=99) -> Expecting HTTP 409 Conflict ==="
curl -i -s -X POST "$BASE_URL/jobwork/receipts" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $KEY" \
  -d "{\"issue_id\":\"$ISSUE_ID\",\"qty\":99,\"received_on\":\"$(date +%Y-%m-%d)\"}"
echo ""
