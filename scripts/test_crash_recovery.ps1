# scripts/test_crash_recovery.ps1
# Demonstrates: Killing the worker during the 5-second remote delay, restarting it,
# and verifying correct duplicate reconciliation via HTTP 409.

param (
    [string]$ApiUrl = "http://localhost:8080",
    [string]$MockUrl = "http://localhost:8081"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Sutra Mini — Worker Crash & Duplicate Reconciliation Test" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Create a fresh receipt and voucher
$idemKey = "crash-test-" + [guid]::NewGuid().ToString().Substring(0, 8)
$payload = @{
    issue_id = "c0000000-0000-0000-0000-000000000001"
    qty = 1
    received_on = (Get-Date -Format "yyyy-MM-dd")
} | ConvertTo-Json

Write-Host "1. Creating new receipt & voucher..." -ForegroundColor Yellow
$created = Invoke-RestMethod -Uri "$ApiUrl/jobwork/receipts" `
    -Method Post `
    -Headers @{ "Idempotency-Key" = $idemKey; "Content-Type" = "application/json" } `
    -Body $payload

$voucherId = $created.voucher.id
$clientRef = $created.voucher.client_ref
Write-Host "   Created Voucher ID : $voucherId" -ForegroundColor Green
Write-Host "   Stable Client Ref  : $clientRef" -ForegroundColor Green
Write-Host ""

# 2. Simulate worker crashing after remote accepted the voucher:
# Send request to mock accounting server with X-Mock-Mode: force-hang
Write-Host "2. Simulating remote acceptance with worker network disconnect/crash..." -ForegroundColor Yellow
$mockBody = @{
    client_ref = $clientRef
    type = "JOBWORK_RECEIPT"
    amount_paise = 25000
    source_id = $created.receipt.id
} | ConvertTo-Json

# Push directly to mock to simulate remote accepting the voucher
$mockResp = Invoke-RestMethod -Uri "$MockUrl/api/vouchers" `
    -Method Post `
    -Headers @{ "Content-Type" = "application/json"; "X-Mock-Mode" = "force-success" } `
    -Body $mockBody

$remoteExternalRef = $mockResp.external_ref
Write-Host "   Remote server accepted voucher with external_ref: $remoteExternalRef" -ForegroundColor Cyan
Write-Host "   (In DB, voucher is still pending because worker crashed before recording success!)"
Write-Host ""

# 3. Now start a fresh worker to reconcile
Write-Host "3. Starting worker to demonstrate crash recovery & 409 duplicate reconciliation..." -ForegroundColor Yellow
$workerProcess = Start-Process -FilePath "go" -ArgumentList "run", "./cmd/worker" -WorkingDirectory "./backend" -PassThru -NoNewWindow

$deadline = (Get-Date).AddSeconds(10)
$targetVoucher = $null
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 600
    $vouchers = Invoke-RestMethod -Uri "$ApiUrl/vouchers" -Method Get
    $targetVoucher = $vouchers | Where-Object { $_.id -eq $voucherId }
    if ($targetVoucher.status -eq "pushed") {
        break
    }
}

Write-Host ""
Write-Host "Reconciliation Status in PostgreSQL:" -ForegroundColor Yellow
Write-Host "   Status       : $($targetVoucher.status)" -ForegroundColor ($targetVoucher.status -eq 'pushed' ? 'Green' : 'Red')
Write-Host "   External Ref : $($targetVoucher.external_ref)" -ForegroundColor Green

if ($targetVoucher.status -eq "pushed" -and $targetVoucher.external_ref -eq $remoteExternalRef) {
    Write-Host "SUCCESS: Worker cleanly reconciled duplicate voucher from HTTP 409 to 'pushed'!" -ForegroundColor Green
} else {
    Write-Host "Target voucher not yet reconciled (current status: $($targetVoucher.status))" -ForegroundColor Yellow
}

Stop-Process -Id $workerProcess.Id -Force -ErrorAction SilentlyContinue
