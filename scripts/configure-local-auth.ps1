# CommuteCircle V2 local setup: copies and fills PUBLIC OIDC settings only.
# This script does not contact Auth0 or modify remote accounts or secrets.
param([string]$EnvironmentFile = ".env")

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root $EnvironmentFile
$sample = Join-Path $root ".env.example"
if (-not (Test-Path -LiteralPath $sample)) {
    throw "Cannot find .env.example. Run this script from a Git checkout."
}
if (-not (Test-Path -LiteralPath $target)) {
    Copy-Item -LiteralPath $sample -Destination $target
    Write-Host "Created local .env from .env.example."
}
$defaults = @{}
foreach ($line in [System.IO.File]::ReadAllLines($sample)) {
    if ($line -match '^([A-Z][A-Z_0-9]*)=(.*)$') {
        $defaults[$Matches[1]] = $Matches[2]
    }
}
$lines = [System.Collections.Generic.List[string]]::new()
foreach ($line in [System.IO.File]::ReadAllLines($target)) {
    $lines.Add($line)
}
foreach ($key in @("OIDC_ISSUER", "OIDC_AUDIENCE", "OIDC_JWKS_URL", "DOCS_OAUTH_CLIENT_ID")) {
    if (-not $defaults.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($defaults[$key])) {
        throw "Missing public development configuration for $key in .env.example"
    }
    $index = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i].StartsWith("$key=")) { $index = $i; break }
    }
    if ($index -eq -1) {
        $lines.Add("$key=$($defaults[$key])")
    } elseif ([string]::IsNullOrWhiteSpace(($lines[$index] -split '=', 2)[1])) {
        $lines[$index] = "$key=$($defaults[$key])"
    }
}
# Write UTF-8 without BOM to keep Docker's .env parser happy.
[System.IO.File]::WriteAllText(
    $target,
    ($lines -join [Environment]::NewLine) + [Environment]::NewLine,
    (New-Object System.Text.UTF8Encoding($false))
)
Write-Host "Public Auth0 environment settings are populated. Existing non-empty settings and secrets were preserved."
Write-Host "In the Auth0 dashboard, add allowed callbacks:"
Write-Host "  http://localhost:8000/studio/"
Write-Host "  http://localhost:8000/docs/oauth2-redirect"
Write-Host "Allowed Web Origin and CORS Origin: http://localhost:8000"
Write-Host "Grant user-delegated rides:read and rides:write to the public application."
Write-Host "Then run: docker compose up -d --build"
Write-Host "Verify http://localhost:8000/v1/studio-config"
