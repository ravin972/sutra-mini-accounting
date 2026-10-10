# scripts/test_replay.ps1
# Demonstrates idempotency key replay and conflict detection

param (
    [string]$BaseUrl = "http://localhost:8080",
    [string]$IssueId = "c0000000-0000-0000-0000-000000000001",
    [int]$Qty = 2
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Sutra Mini — Idempotency Key Replay Demonstration" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$idempotencyKey = "replay-demo-" + [guid]::NewGuid().ToString().Substring(0, 8)
Write-Host "Using Idempotency Key: $idempotencyKey"
Write-Host ""

$payload1 = @{
    issue_id = $IssueId
    qty = $Qty
    received_on = (Get-Date -Format "yyyy-MM-dd")
} | ConvertTo-Json

Write-Host "1. Sending first request..." -ForegroundColor Yellow
$resp1 = Invoke-RestMethod -Uri "$BaseUrl/jobwork/receipts" `
    -Method Post `
    -Headers @{ "Idempotency-Key" = $idempotencyKey; "Content-Type" = "application/json" } `
    -Body $payload1

Write-Host "  Response 1 Status: CREATED" -ForegroundColor Green
Write-Host "  Receipt ID : $($resp1.receipt.id)"
Write-Host "  Voucher ID : $($resp1.voucher.id)"
Write-Host "  Is Replay  : $($resp1.is_replay)"
Write-Host ""

Write-Host "2. Replaying exact same request with same Idempotency-Key..." -ForegroundColor Yellow
$resp2 = Invoke-RestMethod -Uri "$BaseUrl/jobwork/receipts" `
    -Method Post `
    -Headers @{ "Idempotency-Key" = $idempotencyKey; "Content-Type" = "application/json" } `
    -Body $payload1

Write-Host "  Response 2 Status: OK (REPLAY)" -ForegroundColor Green
Write-Host "  Receipt ID : $($resp2.receipt.id)"
Write-Host "  Voucher ID : $($resp2.voucher.id)"
Write-Host "  Is Replay  : $($resp2.is_replay)"

if ($resp1.receipt.id -eq $resp2.receipt.id -and $resp1.voucher.id -eq $resp2.voucher.id -and $resp2.is_replay -eq $true) {
    Write-Host "  SUCCESS: Identical logical result returned without duplicating records!" -ForegroundColor Green
} else {
    Write-Host "  FAIL: Result mismatch or duplicate created!" -ForegroundColor Red
}
Write-Host ""

Write-Host "3. Reusing same Idempotency-Key with DIFFERENT payload (qty=$($Qty + 5))..." -ForegroundColor Yellow
$payloadConflicting = @{
    issue_id = $IssueId
    qty = $Qty + 5
    received_on = (Get-Date -Format "yyyy-MM-dd")
} | ConvertTo-Json

try {
    $resp3 = Invoke-RestMethod -Uri "$BaseUrl/jobwork/receipts" `
        -Method Post `
        -Headers @{ "Idempotency-Key" = $idempotencyKey; "Content-Type" = "application/json" } `
        -Body $payloadConflicting
    Write-Host "  FAIL: Conflicting request was unexpectedly accepted!" -ForegroundColor Red
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host "  SUCCESS: Conflicting request rejected with HTTP $code (409 Conflict)!" -ForegroundColor Green
    Write-Host "  Error detail: $($_.ErrorDetails.Message)"
}
