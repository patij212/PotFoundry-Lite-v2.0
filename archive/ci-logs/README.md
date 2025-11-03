# CI/CD Logs Archive

This directory contains historical CI/CD run logs and workflow outputs.

## Purpose

Preserve historical build and test execution logs for:
- Debugging recurring issues
- Performance trend analysis
- Understanding past CI/CD configuration
- Historical reference for workflow changes

## Directory Structure

```
ci-logs/
├── 2024-q4/          # Q4 2024 logs
│   ├── .gha_run_*.log     # GitHub Actions workflow runs
│   └── run_*.log          # Local test runs
└── README.md
```

## Log File Naming Convention

- `.gha_run_<run_id>.log` - GitHub Actions workflow run outputs
- `run_<timestamp>.log` - Local test/build run outputs
- Timestamp format: YYYYMMDDHHmmss or GitHub run ID

## Usage

### Finding Specific Runs
```bash
# Find logs from specific date
ls ci-logs/2024-q4/*.log | grep "20241215"

# Find GitHub Actions runs
ls ci-logs/2024-q4/.gha_run_*.log

# Search for specific errors
grep -r "ERROR" ci-logs/2024-q4/
```

### Analyzing Trends
- Compare execution times across runs
- Identify flaky tests
- Track performance regressions
- Review failure patterns

## Retention Policy

- Keep logs for current quarter + 2 previous quarters
- Archive older logs to compressed format
- Delete logs older than 12 months (unless significant)

## Important Notes

⚠️ **These logs may contain sensitive information:**
- Do not share publicly without review
- Redact any secrets or credentials before sharing
- Be cautious with error messages containing paths

✅ **These logs are safe to delete:**
- They are generated artifacts, not source material
- Original runs are preserved in GitHub Actions (90 day retention)
- Logs are primarily for local reference

---

**Last Updated:** January 2025  
**Retention Period:** 12 months  
**Next Review:** End of Q1 2025
