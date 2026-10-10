# scripts/run_two_workers.ps1
# Runs two independent sync worker instances concurrently to demonstrate safe row locking with SKIP LOCKED

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Starting Two Sync Workers Concurrently..." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$w1 = Start-Process -FilePath "go" -ArgumentList "run", "./cmd/worker" -WorkingDirectory "./backend" -PassThru
$w2 = Start-Process -FilePath "go" -ArgumentList "run", "./cmd/worker" -WorkingDirectory "./backend" -PassThru

Write-Host "Worker 1 PID: $($w1.Id)" -ForegroundColor Green
Write-Host "Worker 2 PID: $($w2.Id)" -ForegroundColor Green
Write-Host "Both workers running concurrently. Press Ctrl+C in terminal or press Enter here to stop both workers."

Read-Host "Press [Enter] to terminate both workers"

Stop-Process -Id $w1.Id, $w2.Id -Force -ErrorAction SilentlyContinue
Write-Host "Both worker processes stopped." -ForegroundColor Yellow
