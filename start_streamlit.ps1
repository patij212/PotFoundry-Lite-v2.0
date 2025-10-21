#Requires -Version 5.1
param(
  [switch]$PinPort,
  # When set, Streamlit auto-reruns on save; otherwise it will prompt you to rerun (classic banner)
  [switch]$AutoRerun
)

# Start Streamlit app on Windows PowerShell
# Usage: .\start_streamlit.ps1 [-PinPort]
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# Ensure venv python exists
$venvPython = Join-Path $scriptDir '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
  Write-Error "Python venv not found at $venvPython. Create it and install requirements first."
}

# Ensure PYTHONPATH includes workspace root
$env:PYTHONPATH = "${env:PYTHONPATH};$scriptDir"

# Make Streamlit file watching more robust on Windows by forcing polling
# (helps when native watchers are flaky). We keep the prompt-to-rerun UX by default.
$env:WATCHFILES_FORCE_POLLING = "1"

# Log files
$logOut = Join-Path $env:TEMP 'streamlit.out.log'
$logErr = Join-Path $env:TEMP 'streamlit.err.log'
if (Test-Path $logOut) { Remove-Item $logOut -Force }
if (Test-Path $logErr) { Remove-Item $logErr -Force }

# Kill any previous Streamlit instances started via 'python -m streamlit'
Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%python -m streamlit%'" | ForEach-Object {
  try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
}

# Start streamlit (background) and redirect logs
$runOnSave = if ($AutoRerun) { "true" } else { "false" }
$argsList = "-m streamlit run app.py --server.headless true --server.fileWatcherType poll --server.runOnSave $runOnSave"
if ($PinPort) { $argsList = "$argsList --server.port 8501" }
$proc = Start-Process -FilePath $venvPython `
  -ArgumentList $argsList `
  -WorkingDirectory $scriptDir `
  -RedirectStandardOutput $logOut `
  -RedirectStandardError $logErr `
  -PassThru

Write-Host "Streamlit launched (PID: $($proc.Id))" -ForegroundColor Green
Write-Host "Logs: $logOut (stdout), $logErr (stderr)"
Write-Host "Open http://localhost:8501 in your browser."
if ($AutoRerun) {
  Write-Host "Auto-rerun is ON (server.runOnSave=true)." -ForegroundColor Yellow
} else {
  Write-Host "Auto-rerun is OFF; you'll get the 'Rerun' banner on changes." -ForegroundColor Yellow
}
