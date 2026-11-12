# ==============================================================================
# start_mission_control.ps1 — Launcher Live Web Server (Windows 11 / PowerShell 7+)
# Espone Antigravity Mission Control su localhost e LAN aziendale (porta 8787)
# Eseguire con: pwsh -File .\scripts\start_mission_control.ps1
# ==============================================================================

[CmdletBinding()]
param(
    [string]$HostAddress = $(if ($env:HOST) { $env:HOST } else { '0.0.0.0' }),
    [string]$PortRaw = $(if ($env:PORT) { $env:PORT } else { '8787' })
)

$ErrorActionPreference = 'Stop'

[int]$Port = 0
if (-not [int]::TryParse($PortRaw, [ref]$Port) -or $Port -lt 1 -or $Port -gt 65535) {
    [Console]::Error.WriteLine("[ERROR] PORT non valida: '$PortRaw' (atteso intero 1..65535).")
    exit 1
}

$mutexName = 'Local\Antigravity_MissionControl_Lock'
$createdNew = $false
$mutex = [System.Threading.Mutex]::new($true, $mutexName, [ref]$createdNew)

try {
    if (-not $createdNew) {
        [Console]::Error.WriteLine("[ERROR] Un'altra istanza di Antigravity Mission Control Server e' gia' in esecuzione (Mutex: $mutexName).")
        exit 1
    }

    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        [Console]::Error.WriteLine("[ERROR] Node.js non trovato nel PATH. Installa Node.js >= 20 LTS.")
        exit 1
    }

    $repoRoot = Split-Path -Parent $PSScriptRoot
    $serverJs = Join-Path $repoRoot 'server\mission_control_server.mjs'
    if (-not (Test-Path -LiteralPath $serverJs -PathType Leaf)) {
        [Console]::Error.WriteLine("[ERROR] File server non trovato: $serverJs")
        exit 1
    }

    $existingListener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($existingListener) {
        [Console]::Error.WriteLine("[ERROR] La porta TCP $Port e' gia' in ascolto. Specifica un'altra porta con -PortRaw <numero> o `$env:PORT.")
        exit 1
    }

    $activeIfaces = Get-NetAdapter -ErrorAction SilentlyContinue |
        Where-Object { $_.Status -eq 'Up' -and $_.InterfaceDescription -notmatch 'Hyper-V|WSL|vEthernet|Loopback' }

    $lanIps = @()
    if ($activeIfaces) {
        $ifIndexes = $activeIfaces | Select-Object -ExpandProperty ifIndex
        $lanIps = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object {
                $_.InterfaceIndex -in $ifIndexes -and
                $_.IPAddress -notlike '127.*' -and
                $_.IPAddress -notlike '169.254.*'
            } |
            Select-Object -ExpandProperty IPAddress -Unique
    }

    if ($HostAddress -eq '0.0.0.0' -and $lanIps.Count -gt 0) {
        Write-Host "[INFO] IP LAN rilevati: $($lanIps -join ', ')" -ForegroundColor Cyan
        Write-Host "[INFO] Nota Windows Firewall: consenti Node.js su rete privata per accesso colleghi." -ForegroundColor Yellow
    }

    $env:HOST = $HostAddress
    $env:PORT = [string]$Port
    & $nodeCmd.Source $serverJs
}
finally {
    if ($mutex) {
        try { $mutex.ReleaseMutex() } catch {}
        $mutex.Dispose()
    }
}
