$sha = (git rev-parse HEAD).Trim()
Write-Output "Polling GH Actions for commit: $sha"
$end = (Get-Date).AddMinutes(6)
while((Get-Date) -lt $end) {
    try {
        $runsJson = gh run list --commit $sha --json status,conclusion,name,url --limit 50
        $runs = $null
        if ($runsJson) { $runs = $runsJson | ConvertFrom-Json }
    } catch {
        Write-Output "gh run list failed: $_"
        Start-Sleep -Seconds 30
        continue
    }
    if (-not $runs) {
        Write-Output 'No workflow runs found yet for this commit'
        Start-Sleep -Seconds 10
        continue
    }
    foreach ($r in $runs) {
        Write-Output ("{0} | status={1} | conclusion={2} | {3}" -f $r.name, $r.status, $r.conclusion, $r.url)
    }
    $incomplete = $runs | Where-Object { $_.status -ne 'completed' }
    if (-not $incomplete) {
        Write-Output 'All runs completed'
        break
    }
    Write-Output 'Some runs still in-progress; sleeping 30s'
    Start-Sleep -Seconds 30
}
Write-Output 'Polling finished'
