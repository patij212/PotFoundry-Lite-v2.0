$run = 'https://api.github.com/repos/patij212/PotFoundry-Lite-v2.0/actions/runs/19022921478/logs'
Write-Output "Downloading $run"
$hdr = @{ Authorization = "Bearer $env:GH_TOKEN" }
try {
    Invoke-WebRequest -Uri $run -Headers $hdr -OutFile ".\\.tmp_run_19022921478_logs.zip" -UseBasicParsing -ErrorAction Stop
    Write-Output "Saved .\.tmp_run_19022921478_logs.zip"
} catch {
    Write-Output "Download failed: $_"
    exit 1
}
