# OpenClaw WhatsApp Channel Login Script
# This script logs into the WhatsApp channel with the default account

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OpenClaw WhatsApp Channel Login" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

try {
    Write-Host "Initiating WhatsApp channel login..." -ForegroundColor Yellow
    
    # Run the openclaw channels login command
    openclaw channels login --channel whatsapp --account default
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "WhatsApp channel login completed successfully!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "WhatsApp channel login failed with exit code: $LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}
catch {
    Write-Host ""
    Write-Host "Error occurred during WhatsApp channel login:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
