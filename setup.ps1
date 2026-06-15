<#
.SYNOPSIS
    One-click local setup / run for Zoomy (Windows).

.DESCRIPTION
    Verifies prerequisites, starts the Docker data tier (Kafka, Redis, MongoDB,
    Postgres), installs frontend dependencies, then launches the backend, the
    frontend, and (optionally) the desktop Safe Agent — each in its own window.

.PARAMETER InfraOnly
    Start only the Docker data tier and exit.

.PARAMETER SkipAgent
    Do not launch the desktop Safe Agent.

.PARAMETER JavaHome
    Path to a JDK 21 install. Defaults to $env:JAVA_HOME or whatever 'java' is on PATH.

.EXAMPLE
    ./setup.ps1
.EXAMPLE
    ./setup.ps1 -InfraOnly
.EXAMPLE
    ./setup.ps1 -SkipAgent -JavaHome 'C:\path\to\jdk-21'
#>
[CmdletBinding()]
param(
    [switch]$InfraOnly,
    [switch]$SkipAgent,
    [string]$JavaHome = $env:JAVA_HOME
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$backend  = Join-Path $root 'web-application\backend'
$frontend = Join-Path $root 'web-application\frontend'
$infra    = Join-Path $root 'web-application\infra'
$agent    = Join-Path $root 'desktop-application\safe-agent-proctor'

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

# ---- 1. Prerequisite check -------------------------------------------------
Write-Step 'Checking prerequisites'
$missing = @()
if (-not (Have 'docker')) { $missing += 'Docker Desktop (docker)' }
if (-not (Have 'mvn'))    { $missing += 'Maven (mvn)' }
if (-not (Have 'node'))   { $missing += 'Node.js (node)' }
if ($JavaHome -and (Test-Path "$JavaHome\bin\java.exe")) {
    $env:JAVA_HOME = $JavaHome
    $env:PATH = "$JavaHome\bin;$env:PATH"
} elseif (-not (Have 'java')) {
    $missing += 'JDK 21 (java) — set -JavaHome or JAVA_HOME'
}
if ($missing.Count) {
    Write-Host 'Missing prerequisites:' -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host 'Install them and re-run. See the component READMEs for versions.'
    exit 1
}
# Help Maven trust a corporate TLS proxy (harmless otherwise).
if (-not $env:MAVEN_OPTS) { $env:MAVEN_OPTS = '-Djavax.net.ssl.trustStoreType=Windows-ROOT' }
Write-Host 'All prerequisites found.' -ForegroundColor Green

# ---- 2. Data tier ----------------------------------------------------------
Write-Step 'Starting Docker data tier (Kafka, Redis, MongoDB, Postgres)'
Push-Location $infra
docker compose up -d
Pop-Location

if ($InfraOnly) {
    Write-Host "`nData tier is up. Re-run without -InfraOnly to start the apps." -ForegroundColor Green
    exit 0
}

# ---- 3. Frontend dependencies ---------------------------------------------
Write-Step 'Installing frontend dependencies (npm install)'
Push-Location $frontend
if (-not (Test-Path 'node_modules')) { cmd /c 'npm.cmd install' } else { Write-Host 'node_modules present — skipping install.' }
Pop-Location

# ---- 4. Launch the apps, each in its own window ----------------------------
Write-Step 'Launching backend (http://localhost:8080, gRPC 9090)'
Start-Process powershell -ArgumentList @(
    '-NoExit','-Command',
    "`$env:JAVA_HOME='$env:JAVA_HOME'; `$env:PATH='$env:JAVA_HOME\bin;'+`$env:PATH; `$env:MAVEN_OPTS='$env:MAVEN_OPTS'; Set-Location '$backend'; mvn -DskipTests spring-boot:run"
)

Write-Step 'Launching frontend (http://localhost:4200)'
Start-Process powershell -ArgumentList @(
    '-NoExit','-Command',
    "Set-Location '$frontend'; cmd /c 'npm.cmd start'"
)

if (-not $SkipAgent) {
    Write-Step 'Launching desktop Safe Agent'
    Start-Process powershell -ArgumentList @(
        '-NoExit','-Command',
        "`$env:JAVA_HOME='$env:JAVA_HOME'; `$env:PATH='$env:JAVA_HOME\bin;'+`$env:PATH; `$env:MAVEN_OPTS='$env:MAVEN_OPTS'; Set-Location '$agent'; mvn -q javafx:run"
    )
}

Write-Host "`nZoomy is starting up in separate windows." -ForegroundColor Green
Write-Host '  Web app : http://localhost:4200'
Write-Host '  API     : http://localhost:8080/actuator/health'
Write-Host 'The first backend/agent build downloads Maven dependencies and may take a few minutes.'
