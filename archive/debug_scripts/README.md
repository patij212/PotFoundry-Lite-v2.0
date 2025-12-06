# Debug Scripts Archive

This directory contains archived debug and temporary scripts used during development.
**These files are for reference only and are not part of the production codebase.**

## Purpose

During development, various debug scripts were created to:
- Test specific geometry calculations
- Debug mesh generation issues
- Validate STL export correctness
- Troubleshoot Numba/acceleration integrations
- Investigate drain hole geometry

## Contents

| Script Pattern | Purpose |
|----------------|---------|
| `tmp_check_*.py` | Validation checks for specific features |
| `tmp_debug_*.py` | Debug scripts for troubleshooting issues |
| `tmp_compare_*.py` | A/B comparison scripts for testing changes |
| `tmp_inspect_*.py` | Inspection scripts for mesh/geometry analysis |
| `debug_*.py` | Various debugging utilities |

## Notes

- These scripts may reference old API patterns
- They are not maintained and may not work with current code
- Useful as reference for understanding past debugging approaches

## When to Use

- If investigating similar issues in the future
- As templates for new debug scripts
- To understand historical debugging approaches

---

*Archived from repository root on code review cleanup*
