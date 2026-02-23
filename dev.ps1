<#
.SYNOPSIS
    Development server with live-reload. Watches for file changes in src/,
    rebuilds TypeScript, copies public assets, and restarts the server.

.DESCRIPTION
    Uses Node --watch to monitor source files. On any change the process
    is automatically restarted with a fresh build.

.EXAMPLE
    .\dev.ps1
    .\dev.ps1 -Verbose
#>
param(
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "`n=== github-copilot-proxy  |  dev mode ===" -ForegroundColor Cyan
Write-Host "Watching src/ for changes - auto-rebuild and restart`n" -ForegroundColor DarkGray

# Set environment
$env:NODE_ENV = "development"
if ($Verbose) { $env:LOG_LEVEL = "debug" }

# Launch Node with --watch pointed at src/
# .dev-entry.mjs handles: tsc build -> copy public -> start server
node --watch --watch-path=src --watch-preserve-output .dev-entry.mjs
