param(
    [string]$sha='106e3db6a49a162f714b012518b590fd44b1452a',
    [int]$timeoutMinutes=20
)
$deadline=(Get-Date).AddMinutes($timeoutMinutes)
Write-Output "Polling GitHub Actions runs for SHA $sha until $deadline (every 30s)"
$finalSummary=@()
while ((Get-Date) -lt $deadline) {
  $runsJson = gh run list --commit $sha --json status,conclusion,name,url --limit 50 2>&1
  if ($LASTEXITCODE -ne 0) { Write-Output "gh run list failed: $runsJson"; exit 1 }
  $runs = $runsJson | ConvertFrom-Json
  if (-not $runs) { Write-Output 'No runs found yet; sleeping 30s...'; Start-Sleep -Seconds 30; continue }
  $allCompleted = $true
  $lines=@()
  foreach ($r in $runs) {
    $lines += ("{0} | status={1} | conclusion={2} | {3}" -f $r.name,$r.status,$r.conclusion,$r.htmlUrl)
    if ($r.status -ne 'completed') { $allCompleted = $false }
  }
  Write-Output ($lines -join "`n")
  if ($allCompleted) { $finalSummary = $lines; break }
  Start-Sleep -Seconds 30
}
if ($finalSummary.Count -gt 0) {
  Write-Output 'Final run conclusions:'
  Write-Output ($finalSummary -join "`n")
  exit 0
} else {
  Write-Output 'Polling ended without finding all completed runs or no runs found.'
  exit 2
}
