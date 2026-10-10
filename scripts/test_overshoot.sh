#!/usr/bin/env bash
# scripts/test_overshoot.sh - Bash version of concurrent overshoot test
set -e

BASE_URL="${1:-http://localhost:8080}"
ISSUE_ID="${2:-c0000000-0000-0000-0000-000000000001}"
QTY=10
WORKERS=10

echo "=== Sutra Mini: Concurrent Overshoot Test ==="
echo "Target Issue: $ISSUE_ID"
echo "Concurrency : $WORKERS requests"
echo ""

RUN_ID=$(date +%s)
for i in $(seq 1 $WORKERS); do
  KEY="idem-overshoot-$RUN_ID-$i"
  curl -s -X POST "$BASE_URL/jobwork/receipts" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $KEY" \
    -d "{\"issue_id\":\"$ISSUE_ID\",\"qty\":$QTY,\"received_on\":\"$(date +%Y-%m-%d)\"}" \
    -w " Worker $i HTTP Status: %{http_code}\n" &
done

wait
echo ""
echo "=== Issue Summary from PostgreSQL ==="
curl -s "$BASE_URL/issues/$ISSUE_ID"
echo ""
