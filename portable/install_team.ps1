# ==============================================================================
# install_team.ps1 - Standalone 1-Click Installer for Windows 11 (PowerShell 7+)
# Supported OS: Windows 11 (x64 / ARM64)
# Author: Manuele Francescon (@tennet) - Suite v3.1.0
# ==============================================================================

#Requires -Version 7.0
[CmdletBinding()]
param(
    [switch]$Copy = $false
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "   🚀 Antigravity Engineering Team - Private Portable Installer  " -ForegroundColor Cyan
Write-Host "   Windows 11 Native Installer (No Admin Elevation Required)    " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$GeminiHome = Join-Path $env:USERPROFILE ".gemini"
$PluginsDir = Join-Path $GeminiHome "config\plugins"
$PluginTarget = Join-Path $PluginsDir "engineering-team"

# 1. Ensure target directory exists
if (-not (Test-Path $PluginsDir)) {
    New-Item -ItemType Directory -Path $PluginsDir -Force | Out-Null
}

Write-Host "`n[1/4] Rilevamento sorgente del team..." -ForegroundColor Blue

$SourceDir = $null

# Check if next to plugin/ directory in workspace
$WorkspacePlugin = Join-Path $ScriptDir "..\plugin"
if (Test-Path (Join-Path $WorkspacePlugin "agents")) {
    $SourceDir = (Resolve-Path $WorkspacePlugin).Path
    Write-Host "  [OK] Sorgente trovata nel workspace: $SourceDir" -ForegroundColor Green
}
# Check if unpacked engineering-team folder exists
elseif (Test-Path (Join-Path $ScriptDir "engineering-team\agents")) {
    $SourceDir = (Resolve-Path (Join-Path $ScriptDir "engineering-team")).Path
    Write-Host "  [OK] Sorgente trovata nel bundle locale: $SourceDir" -ForegroundColor Green
}
# Check for zip archive
elseif (Test-Path (Join-Path $ScriptDir "antigravity_team_bundle.zip")) {
    Write-Host "  [INFO] Estraggo archivio antigravity_team_bundle.zip..." -ForegroundColor Blue
    Expand-Archive -Path (Join-Path $ScriptDir "antigravity_team_bundle.zip") -DestinationPath $ScriptDir -Force
    $SourceDir = (Resolve-Path (Join-Path $ScriptDir "engineering-team")).Path
    Write-Host "  [OK] Bundle estratto con successo: $SourceDir" -ForegroundColor Green
}

# Fallback: Check Google Drive Brain on common drive letters
if (-not $SourceDir -or -not (Test-Path (Join-Path $SourceDir "agents"))) {
    $DriveLetters = @("G", "H", "D", "E", "C")
    foreach ($Drive in $DriveLetters) {
        $Candidate = "$($Drive):\Il mio Drive\Antigravity_Brain\private_suite\engineering-team"
        if (Test-Path (Join-Path $Candidate "agents")) {
            $SourceDir = $Candidate
            Write-Host "  [OK] Sorgente trovata su Google Drive: $SourceDir" -ForegroundColor Green
            break
        }
        $CandidateEn = "$($Drive):\My Drive\Antigravity_Brain\private_suite\engineering-team"
        if (Test-Path (Join-Path $CandidateEn "agents")) {
            $SourceDir = $CandidateEn
            Write-Host "  [OK] Sorgente trovata su Google Drive: $SourceDir" -ForegroundColor Green
            break
        }
    }
}

if (-not $SourceDir -or -not (Test-Path (Join-Path $SourceDir "agents"))) {
    Write-Error "Impossibile trovare la suite del team! Posiziona 'antigravity_team_bundle.zip' o la cartella 'engineering-team' accanto a questo script."
}

# 2. Preventative Backup of existing installation
Write-Host "`n[2/4] Verifica e backup installazione preesistente..." -ForegroundColor Blue
if (Test-Path $PluginTarget) {
    $Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $BackupPath = Join-Path $PluginsDir "engineering-team_backup_$Timestamp"
    Write-Host "  [WARN] Installazione esistente rilevata. Archiviazione in: $BackupPath" -ForegroundColor Yellow
    Move-Item -Path $PluginTarget -Destination $BackupPath -Force
}

# 3. Installation via Native Junction or Recursive Copy
Write-Host "`n[3/4] Installazione dei 9 Specialisti e del Canone su Windows 11..." -ForegroundColor Blue

if ($Copy -or $SourceDir -like "*Google Drive*") {
    Copy-Item -Path $SourceDir -Destination $PluginTarget -Recurse -Force
    Write-Host "  [OK] Suite copiata integralmente in: $PluginTarget" -ForegroundColor Green
} else {
    # Native Junction: Works for unprivileged non-admin users on Windows 11!
    New-Item -ItemType Junction -Path $PluginTarget -Target $SourceDir -Force | Out-Null
    Write-Host "  [OK] Junction nativa creata (Zero Admin Elevation): $PluginTarget -> $SourceDir" -ForegroundColor Green
}

# 4. Verify all 9 agents
Write-Host "`n[4/4] Validazione integrità squadra..." -ForegroundColor Blue
$Agents = @("turing", "werner", "taylor", "linus", "steve", "carmack", "rauch", "geohot", "guido")
$AllOk = $true

foreach ($Agent in $Agents) {
    $AgentFile = Join-Path $PluginTarget "agents\$Agent.md"
    if (Test-Path $AgentFile) {
        Write-Host "  [OK] Specialista @$Agent pronto." -ForegroundColor Green
    } else {
        Write-Host "  [ERRORE] Specialista @$Agent MANCANTE!" -ForegroundColor Red
        $AllOk = $false
    }
}

if ($AllOk) {
    Write-Host "`n================================================================" -ForegroundColor Green
    Write-Host "   ✨ INSTALLAZIONE COMPLETATA CON SUCCESSO SU QUESTO PC!       " -ForegroundColor Green
    Write-Host "   Tutti i 9 Specialisti sono immediatamente pronti in chat:    " -ForegroundColor Green
    Write-Host "   @turing, @werner, @taylor, @linus, @steve,                   " -ForegroundColor Green
    Write-Host "   @carmack, @rauch, @geohot, @guido                            " -ForegroundColor Green
    Write-Host "================================================================" -ForegroundColor Green
} else {
    Write-Host "`n[ATTENZIONE] Alcuni agenti risultano mancanti. Verifica l'integrità del bundle." -ForegroundColor Yellow
}
