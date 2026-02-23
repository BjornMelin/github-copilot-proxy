# OpenClaw Gateway Daemon
# Runs the gateway infinitely, auto-respawns on crash
# Smart error detection for WhatsApp, DNS, connection issues

$ErrorActionPreference = "Continue"

$port = 18791
$restartDelay = 3  # seconds to wait before respawning
$logFile = "openclaw-gateway-daemon.log"

# Check if openclaw is installed
function CheckOpenClawInstalled {
    try {
        # Use cmd /c for reliable npx execution on Windows
        $output = cmd /c "openclaw --version 2>&1"
        if ($LASTEXITCODE -eq 0) {
            return $true
        }
    } catch {
        return $false
    }
    
    return $false
}

# Error patterns that trigger immediate restart
$criticalErrors = @(
    "Web connection closed.*status 408",
    "getaddrinfo ENOTFOUND",
    "ENOTFOUND web\.whatsapp\.com",
    "channel exited",
    "connection lost",
    "connection timeout",
    "Request Time-out",
    "WebSocket Error",
    "Fatal error",
    "cannot connect",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "FailoverError.*401 Authentication required",
    "401 Authentication required.*auth"
)

# Error patterns that are expected/non-critical (don't log as critical)
$expectedErrors = @(
    "unauthorized.*token_missing",
    "unauthorized conn=",
    "closed before connect",
    "connect failed"
)

# Error patterns that trigger WhatsApp login
$whatsappLoginErrors = @(
    "WhatsApp.*auth",
    "WhatsApp.*login",
    "WhatsApp.*session",
    "WhatsApp.*QR",
    "device.*not.*registered",
    "session.*expired",
    "authentication.*failed",
    "401 Authentication required",
    "FailoverError.*401"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OpenClaw Gateway Daemon (Smart)" -ForegroundColor Cyan
Write-Host "  Port: $port" -ForegroundColor Cyan
Write-Host "  Log: $logFile" -ForegroundColor Cyan
Write-Host "  Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan

# Check if openclaw CLI is installed
Write-Host "`nChecking OpenClaw installation..." -ForegroundColor Yellow
if (-not (CheckOpenClawInstalled)) {
    Write-Host "ERROR: OpenClaw CLI is not installed or not in PATH!" -ForegroundColor Red
    Write-Host "`nTo fix this, run:" -ForegroundColor Yellow
    Write-Host "  npm install -g openclaw" -ForegroundColor Cyan
    Write-Host "`nOr install from: https://github.com/openclaw/openclaw" -ForegroundColor Cyan
    Write-Host "`nDaemon cannot start without OpenClaw installed." -ForegroundColor Red
    exit 1
}

Write-Host "OpenClaw CLI found in PATH" -ForegroundColor Green
Write-Host ""

function Log {
    param([string]$Message, [string]$Color = "White")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage -ForegroundColor $Color
    Add-Content -Path $logFile -Value $logMessage
}

function CheckForWhatsAppLogin {
    param([string]$Output, [string]$ErrorOutput)
    
    $allOutput = "$Output`n$ErrorOutput"
    
    foreach ($pattern in $whatsappLoginErrors) {
        if ($allOutput -match $pattern) {
            return $true, $pattern
        }
    }
    
    return $false, ""
}

function RunWhatsAppLogin {
    Log "WhatsApp login required - running login script..." "Yellow"
    
    $scriptPath = Join-Path $PSScriptRoot "openclaw-whatsapp-login.ps1"
    if (Test-Path $scriptPath) {
        try {
            Log "Executing: $scriptPath" "Cyan"
            & $scriptPath
            Log "WhatsApp login script completed successfully" "Green"
            return $true
        } catch {
            Log "WhatsApp login script failed: $_" "Red"
            return $false
        }
    } else {
        Log "WhatsApp login script not found at: $scriptPath" "Red"
        return $false
    }
}

function CheckForCriticalError {
    param([string]$Output, [string]$ErrorOutput)
    
    $allOutput = "$Output`n$ErrorOutput"
    
    # Check if it's an expected/non-critical error first
    foreach ($pattern in $expectedErrors) {
        if ($allOutput -match $pattern) {
            return $false, ""
        }
    }
    
    foreach ($pattern in $criticalErrors) {
        if ($allOutput -match $pattern) {
            return $true, $pattern
        }
    }
    
    return $false, ""
}

$crashCount = 0
$stableRuntime = 60  # seconds - if runs longer than this, reset crash count

while ($true) {
    $startTime = Get-Date
    $crashCount++
    
    Log "" "Gray"
    Log "Starting gateway (attempt #$crashCount)..." "Green"
    
    $processOutput = @()
    $processError = @()
    $isCriticalError = $false
    
    try {
        # Start process and capture output in real-time
        # Use cmd /c to invoke npx (more reliable on Windows)
        $process = Start-Process -FilePath "cmd" -ArgumentList "/c", "openclaw gateway --port $port --verbose" `
            -RedirectStandardOutput $env:TEMP\gateway_stdout.tmp `
            -RedirectStandardError $env:TEMP\gateway_stderr.tmp `
            -PassThru -NoNewWindow -ErrorAction Stop
        
        $processId = $process.Id
        Log "Gateway process started (PID: $processId)" "Green"
        
        # Monitor process and check for critical errors every 500ms
        $monitorInterval = 500  # milliseconds
        $lastCheckTime = Get-Date
        
        while ($null -ne $process -and !$process.HasExited) {
            # Check for critical errors in output files
            if (Test-Path $env:TEMP\gateway_stdout.tmp) {
                try {
                    $stdout = Get-Content $env:TEMP\gateway_stdout.tmp -Raw -ErrorAction SilentlyContinue
                    if ($null -ne $stdout -and $stdout.Length -gt 0) {
                        # Log new output lines
                        $newLines = $stdout.Split("`n") | Where-Object { $_ -and $_ -notin $processOutput }
                        foreach ($line in $newLines) {
                            if ($line.Trim()) {
                                # Clean up the log line - remove trailing content after parenthesis
                                $cleanLine = $line -replace '\s*\(.*$', ''
                                Log "[OpenClaw] $cleanLine" "Cyan"
                                
                                # Check if canvas/gateway is mounted and open browser
                                if ($line -match "canvas.*mounted at\s+(https?://[^\s]+)") {
                                    $url = $matches[1]
                                    Log "Gateway ready! Opening $url in browser..." "Green"
                                    Start-Process $url -ErrorAction SilentlyContinue
                                }
                                
                                $processOutput += $line
                            }
                        }
                    }
                } catch {
                    # Ignore file read errors
                }
            }
            
            if (Test-Path $env:TEMP\gateway_stderr.tmp) {
                try {
                    $stderr = Get-Content $env:TEMP\gateway_stderr.tmp -Raw -ErrorAction SilentlyContinue
                    if ($null -ne $stderr -and $stderr.Length -gt 0) {
                        # Log new error lines
                        $newLines = $stderr.Split("`n") | Where-Object { $_ -and $_ -notin $processError }
                        foreach ($line in $newLines) {
                            if ($line.Trim()) {
                                # Clean up the log line
                                $cleanLine = $line -replace '\s*\(.*$', ''
                                
                                # Identify auth errors and provide helpful context
                                if ($cleanLine -match "unauthorized|token_missing|connect failed") {
                                    Log "[OpenClaw] $cleanLine (authentication - configure OpenClaw token to fix)" "Magenta"
                                } else {
                                    Log "[OpenClaw ERROR] $cleanLine" "Yellow"
                                }
                                $processError += $line
                            }
                        }
                    }
                } catch {
                    # Ignore file read errors
                }
            }
            
            # Check for WhatsApp login errors first
            $hasWhatsAppError, $whatsappPattern = CheckForWhatsAppLogin ($processOutput -join "`n") ($processError -join "`n")
            
            if ($hasWhatsAppError) {
                Log "WhatsApp error detected: $whatsappPattern" "Yellow"
                Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                Start-Sleep -Milliseconds 500
                
                # Run WhatsApp login script
                $loginSuccess = RunWhatsAppLogin
                
                if ($loginSuccess) {
                    Log "Restarting gateway after WhatsApp login..." "Green"
                    $isCriticalError = $false  # Don't count this as critical for backoff
                } else {
                    Log "WhatsApp login failed, will retry..." "Red"
                    $isCriticalError = $true
                }
                
                break
            }
            
            # Check for critical error patterns
            $hasCriticalError, $matchedPattern = CheckForCriticalError ($processOutput -join "`n") ($processError -join "`n")
            
            if ($hasCriticalError) {
                Log "Critical error detected: $matchedPattern" "Red"
                Log "Terminating gateway process..." "Yellow"
                $isCriticalError = $true
                Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                Start-Sleep -Milliseconds 500
                break
            }
            
            Start-Sleep -Milliseconds $monitorInterval
        }
        
        # Ensure process object is valid before accessing ExitCode
        if ($null -ne $process) {
            $exitCode = $process.ExitCode
        } else {
            $exitCode = 1
        }
    }
    catch {
        $errorMsg = $_.Exception.Message
        $exitCode = 1
        Log "Exception: $errorMsg" "Red"
        
        # Check for specific Windows executable error
        if ($errorMsg -match "not a valid Win32 application|cannot find the path|npx") {
            Log "FATAL: OpenClaw could not be executed" "Red"
            Log "Please ensure npm and Node.js are installed: https://nodejs.org/" "Yellow"
            Log "Then install OpenClaw: npm install -g openclaw" "Yellow"
            Log "Daemon will exit." "Red"
            exit 1
        }
        
        $isCriticalError = $true
    }
    
    # Read final output and display any remaining logs
    $hasOutput = $false
    
    if (Test-Path $env:TEMP\gateway_stdout.tmp) {
        try {
            $finalStdout = Get-Content $env:TEMP\gateway_stdout.tmp -Raw -ErrorAction SilentlyContinue
            if ($null -ne $finalStdout -and $finalStdout.Length -gt 0) {
                $hasOutput = $true
                Log "=== OpenClaw Output ===" "Cyan"
                $finalStdout.Split("`n") | ForEach-Object {
                    if ($_.Trim()) {
                        $cleanLine = $_ -replace '\s*\(.*$', ''
                        Log $cleanLine "Cyan"
                    }
                }
            }
        } catch { }
        Remove-Item $env:TEMP\gateway_stdout.tmp -Force -ErrorAction SilentlyContinue
    }
    
    if (Test-Path $env:TEMP\gateway_stderr.tmp) {
        try {
            $finalStderr = Get-Content $env:TEMP\gateway_stderr.tmp -Raw -ErrorAction SilentlyContinue
            if ($null -ne $finalStderr -and $finalStderr.Length -gt 0) {
                $hasOutput = $true
                Log "=== OpenClaw Errors ===" "Yellow"
                $finalStderr.Split("`n") | ForEach-Object {
                    if ($_.Trim()) {
                        $cleanLine = $_ -replace '\s*\(.*$', ''
                        Log $cleanLine "Yellow"
                    }
                }
            }
        } catch { }
        Remove-Item $env:TEMP\gateway_stderr.tmp -Force -ErrorAction SilentlyContinue
    }
    
    if (-not $hasOutput -and $exitCode -ne 0) {
        Log "Gateway exited with no output. Check if OpenClaw CLI is properly configured." "Yellow"
    }
    
    $runtime = (Get-Date) - $startTime
    
    Log "Gateway exited with code $exitCode after $($runtime.TotalSeconds)s" $(if ($isCriticalError) { "Red" } else { "Yellow" })
    
    # Reset crash count if stable run
    if ($runtime.TotalSeconds -gt $stableRuntime) {
        Log "Stable run detected, resetting crash counter" "Green"
        $crashCount = 0
    }
    
    # Exponential backoff for rapid crashes (max 30 seconds)
    # But reduce delay if critical error (start immediately)
    if ($isCriticalError -and $crashCount -gt 1) {
        $delay = 1  # Quick restart on critical errors after first crash
        Log "Critical error mode: quick restart" "Cyan"
    } else {
        $delay = [Math]::Min($restartDelay * [Math]::Pow(2, [Math]::Min($crashCount - 1, 3)), 30)
    }
    
    if ($delay -gt 0) {
        Log "Respawning in $delay seconds..." "Cyan"
        Start-Sleep -Seconds $delay
    }
}

