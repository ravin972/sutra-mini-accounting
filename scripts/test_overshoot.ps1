# scripts/test_overshoot.ps1
# Demonstrates firing 10 concurrent receipt requests exceeding remaining issue quantity

param (
    [string]$BaseUrl = "http://localhost:8080",
    [string]$IssueId = "c0000000-0000-0000-0000-000000000001",
    [int]$Qty = 10,
    [int]$Workers = 10
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Sutra Mini — Concurrent Receipt Overshoot Test" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Target Issue ID : $IssueId"
Write-Host "Concurrency     : $Workers simultaneous requests"
Write-Host "Quantity / req  : $Qty pcs"
Write-Host ""

$jobs = @()
$uniqueRun = [guid]::NewGuid().ToString().Substring(0, 8)

for ($i = 0; $i -lt $Workers; $i++) {
    $key = "idem-overshoot-$uniqueRun-$i"
    $scriptBlock = {
        param($url, $issue, $q, $k)
        $body = @{
            issue_id = $issue
            qty = $q
            received_on = (Get-Date -Format "yyyy-MM-dd")
        } | ConvertTo-Json

        try {
            $response = Invoke-RestMethod -Uri "$url/jobwork/receipts" `
                -Method Post `
                -Headers @{ "Idempotency-Key" = $k; "Content-Type" = "application/json" } `
                -Body $body `
                -TimeoutSec 10 `
                -ErrorAction Stop
            return @{ Status = 201; Result = "ACCEPTED"; Key = $k; Data = $response }
        } catch {
            $statusCode = $_.Exception.Response.StatusCode.value__
            $respBody = $_.ErrorDetails.Message
            return @{ Status = $statusCode; Result = "REJECTED"; Key = $k; Error = $respBody }
        }
    }

    $jobs += Start-ThreadJob -ScriptBlock $scriptBlock -ArgumentList $BaseUrl, $IssueId, $Qty, $key
}

$results = $jobs | Wait-Job | Receive-Job
$jobs | Remove-Job

$accepted = ($results | Where-Object { $_.Result -eq "ACCEPTED" }).Count
$rejected = ($results | Where-Object { $_.Result -eq "REJECTED" }).Count

Write-Host ""
Write-Host "Test Results Summary:" -ForegroundColor Yellow
Write-Host "  Accepted Receipts : $accepted" -ForegroundColor Green
Write-Host "  Rejected Requests : $rejected" -ForegroundColor Red
Write-Host ""

# Fetch updated issue summary
$issueSummary = Invoke-RestMethod -Uri "$BaseUrl/issues/$IssueId" -Method Get
Write-Host "Issue Status in Database:" -ForegroundColor Cyan
Write-Host "  Issued Quantity     : $($issueSummary.issued_qty)"
Write-Host "  Total Received Qty  : $($issueSummary.total_received_qty)"
Write-Host "  Outstanding Qty     : $($issueSummary.outstanding_qty)"

if ($issueSummary.total_received_qty -gt $issueSummary.issued_qty) {
    Write-Host "FAIL: Overshoot occurred! Total received exceeds issued." -ForegroundColor Red
} else {
    Write-Host "SUCCESS: Zero overshoot guarantee verified!" -ForegroundColor Green
}
