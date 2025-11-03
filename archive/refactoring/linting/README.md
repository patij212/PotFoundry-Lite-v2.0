# Linting Artifacts

Ruff and other linting tool outputs from code quality improvement phases.

## Key Files

### Before/After Comparisons
- `ruff-before.txt` - Pre-improvement state (135 errors)
- `ruff-after.txt` - Post-improvement state (11 errors)
- Shows 93% error reduction

### Intermediate States
- `ruff-after2.txt`, `ruff-after3.txt` - Incremental progress
- Documents step-by-step improvement approach

### Module-Specific Outputs
- `.ruff_E702_E731.txt` - Semicolon and lambda analysis
- `.ruff_ci_format.txt` - CI formatting checks
- `.ruff_ci_ruff.txt` - CI linting checks
- `.ruff_full.txt`, `.ruff_full2.txt`, etc. - Comprehensive scans
- `.ruff_pfui_yaml.txt` - PFUI module specific

## Improvements Documented

1. **E702 (Multiple statements on one line):** 124 → 0
2. **F841 (Unused variable):** 10 → 0
3. **F811 (Redefinition of unused):** 1 → 0
4. **E402 (Module level import not at top):** Documented as intentional

---

**Period:** Q4 2024
**Tools:** ruff 0.1.x → 0.2.x
