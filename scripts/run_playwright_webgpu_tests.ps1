Param(
    [string]$ChromiumChannel = "chrome",
    [switch]$Headful
)

if ($Headful) {
    $env:PF_WEBGPU_HEADFUL = '1'
}
$env:PF_RUN_WEBGPU_PLAYWRIGHT = '1'
if (-not $env:PF_WEBGPU_CHROMIUM_CHANNEL) {
    $env:PF_WEBGPU_CHROMIUM_CHANNEL = $ChromiumChannel
}
$env:PYTHONPATH = '.'

Write-Host "Running Playwright WebGPU tests"
Write-Host "PF_WEBGPU_HEADFUL=$env:PF_WEBGPU_HEADFUL"
Write-Host "PF_WEBGPU_CHROMIUM_CHANNEL=$env:PF_WEBGPU_CHROMIUM_CHANNEL"

if (Test-Path -Path .\.venv\Scripts\Activate.ps1) {
    & .\.venv\Scripts\Activate.ps1
}

python -m pytest -q tests/test_webgpu_playwright.py -s
