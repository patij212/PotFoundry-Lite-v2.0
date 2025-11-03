# File Migration Guide - Phase 1 Documentation Cleanup

This document provides the exact commands and validation steps for Phase 1
of the repository refactoring plan.

## Prerequisites

```bash
# Ensure you're in the repository root
cd /path/to/PotFoundry-Lite-v2.0

# Ensure clean git state
git status
git add -A
git commit -m "Checkpoint before refactoring Phase 1"

# Create a backup branch (recommended)
git checkout -b backup-pre-refactoring
git checkout main  # or your working branch
```

## Step 1: Move Evolution Documents to Archive

### Files to Move
```bash
# Create archive structure (already done if following scaffolding)
mkdir -p archive/evolution/2024-q4

# Move improvement summaries
mv CODE_QUALITY_IMPROVEMENTS.md archive/evolution/2024-q4/
mv COMPREHENSIVE_IMPROVEMENTS_SUMMARY.md archive/evolution/2024-q4/
mv IMPLEMENTATION_SUMMARY.md archive/evolution/2024-q4/
mv TEST_COVERAGE_IMPROVEMENTS.md archive/evolution/2024-q4/
mv TEST_VALIDATION_REPORT.md archive/evolution/2024-q4/
mv NEXT_STEPS_ANALYSIS.md archive/evolution/2024-q4/
mv FINAL_REPORT.md archive/evolution/2024-q4/
mv REVIEW_SUMMARY.md archive/evolution/2024-q4/
mv EDGEFLOW_PROGRESS.md archive/evolution/2024-q4/
mv RELEASE_NOTES_v2.1.0.md archive/evolution/2024-q4/

# Move mypy triage documents (superseded by current mypy.ini)
mv MYPY_TRIAGE.md archive/evolution/2024-q4/
mv MYPY_TRIAGE_FULL.md archive/evolution/2024-q4/

# Move edge flow log (historical)
mv .pf_edge_flow_log.md archive/evolution/2024-q4/
```

### Validation
```bash
# Verify files moved
ls -la archive/evolution/2024-q4/ | wc -l  # Should show 13+ files

# Verify root cleanup
ls *.md | wc -l  # Should be significantly reduced
```

## Step 2: Move CI/CD Logs to Archive

### Files to Move
```bash
# Create CI logs archive
mkdir -p archive/ci-logs/2024-q4

# Move GitHub Actions logs
mv .gha_run_*.log archive/ci-logs/2024-q4/ 2>/dev/null || echo "No GHA logs found"

# Move local run logs
mv run_*.log archive/ci-logs/2024-q4/ 2>/dev/null || echo "No run logs found"
```

### Validation
```bash
# Check archived logs
ls archive/ci-logs/2024-q4/ | wc -l

# Verify no logs in root
ls *.log 2>/dev/null | wc -l  # Should be 0
```

## Step 3: Move Refactoring Artifacts to Archive

### Files to Move
```bash
# Create refactoring artifact structure
mkdir -p archive/refactoring/linting
mkdir -p archive/refactoring/type-checking

# Move linting artifacts
mv ruff-*.txt archive/refactoring/linting/ 2>/dev/null || echo "No ruff files found"
mv .ruff_*.txt archive/refactoring/linting/ 2>/dev/null || echo "No .ruff files found"

# Move type checking artifacts
mv mypy-out*.txt archive/refactoring/type-checking/ 2>/dev/null || echo "No mypy-out files found"
mv .mypy_*.txt archive/refactoring/type-checking/ 2>/dev/null || echo "No .mypy files found"
mv mypy_full_output.txt archive/refactoring/type-checking/ 2>/dev/null || echo "No mypy_full_output found"

# Move other analysis files
mv .runs_grep.txt archive/ci-logs/2024-q4/ 2>/dev/null || echo "No .runs_grep.txt found"
mv _runs_all.json archive/ci-logs/2024-q4/ 2>/dev/null || echo "No _runs_all.json found"
```

### Validation
```bash
# Check linting archives
ls archive/refactoring/linting/ | wc -l

# Check type-checking archives
ls archive/refactoring/type-checking/ | wc -l

# Verify root cleanup
ls *.txt 2>/dev/null | grep -v requirements | wc -l  # Should be minimal
```

## Step 4: Delete Temporary Files

### Files to Delete (Safe)
```bash
# Temporary Python scripts
rm -f tmp_*.py

# Temporary commit messages
rm -f BATCH2_COMMIT_MSG.txt
rm -f IMPROVEMENT_SUMMARY.txt
rm -f TERMINAL_OUTPUT_CHECK.txt

# Temporary PR bodies and debug files
rm -f .tmp_*.txt

# Old pytest outputs (if any remain)
rm -f pytest_output.txt
rm -f .tmp_pytest_*.txt
rm -f tmp_pytest_*.txt

# Old validation scripts
rm -f validate_migration.py  # If it's temporary; check first
```

### Validation
```bash
# Verify deletions
ls tmp_* 2>/dev/null  # Should show nothing
ls *.txt | grep -E "(tmp_|BATCH|IMPROVEMENT|TERMINAL)" | wc -l  # Should be 0
```

## Step 5: Reorganize docs/ Directory

### Create New Structure
```bash
# Create guides directory
mkdir -p docs/guides

# Move technical guides to docs/guides/
mv STL_EXPORT_GUIDE.md docs/guides/ 2>/dev/null || echo "Already in docs/"
mv TYPE_HINTS_GUIDE.md docs/guides/ 2>/dev/null || echo "Already in docs/"
mv CODE_QUALITY_GUIDE.md docs/guides/ 2>/dev/null || echo "Already in docs/"
mv DEVELOPMENT.md docs/guides/ 2>/dev/null || echo "Already in docs/"
mv PROPERTY_BASED_TESTING_IMPLEMENTATION.md docs/guides/ 2>/dev/null || echo "Already in docs/"

# If they're already in docs/, move them to docs/guides/
cd docs
mv STL_EXPORT_GUIDE.md guides/ 2>/dev/null || echo "Already in guides/"
mv TYPE_HINTS_GUIDE.md guides/ 2>/dev/null || echo "Already in guides/"
mv CODE_QUALITY_GUIDE.md guides/ 2>/dev/null || echo "Already in guides/"
mv DEVELOPMENT.md guides/ 2>/dev/null || echo "Already in guides/"
mv PROPERTY_BASED_TESTING_IMPLEMENTATION.md guides/ 2>/dev/null || echo "Already in guides/"
cd ..

# Ensure deeplink.md and alt_s3_r2.md are directly in docs/
# (they should already be there based on current structure)
```

### Create Documentation Index
```bash
# Create docs/README.md if it doesn't exist
cat > docs/README.md << 'EOF'
# PotFoundry Documentation

Comprehensive documentation for PotFoundry-Lite v2.x.

## Quick Links

### Essential Reading
- [Main README](../README.md) - Project overview and quick start
- [Architecture Guide](../ARCHITECTURE.md) - System design and structure
- [Roadmap](../ROADMAP.md) - Future vision (Qt desktop app)
- [TODO List](../TODO.md) - Current development priorities

### Development Guides
- [Development Guide](guides/DEVELOPMENT.md) - Setup, workflows, testing
- [Code Quality Guide](guides/CODE_QUALITY_GUIDE.md) - Coding standards and best practices
- [Type Hints Guide](guides/TYPE_HINTS_GUIDE.md) - Type annotation conventions
- [STL Export Guide](guides/STL_EXPORT_GUIDE.md) - Binary STL implementation details

### Feature Documentation
- [Deep Link System](deeplink.md) - URL-based state sharing
- [Alternative Storage](alt_s3_r2.md) - S3/R2 integration options
- [Library Implementation](LIBRARY_IMPLEMENTATION_SUMMARY.md) - Public library features
- [Property-Based Testing](guides/PROPERTY_BASED_TESTING_IMPLEMENTATION.md) - Hypothesis integration

### Architecture Decision Records
- [ADR Index](adr/README.md) - Design decisions and rationale

---

**Last Updated:** January 2025
**Version:** v2.1.0+
EOF
```

### Validation
```bash
# Check docs structure
tree docs/ -L 2

# Verify guides directory
ls docs/guides/ | wc -l  # Should show 5+ files

# Verify root cleanup
ls *.md | grep -E "(STL_EXPORT|TYPE_HINTS|CODE_QUALITY|DEVELOPMENT|PROPERTY)" | wc -l  # Should be 0
```

## Step 6: Update .gitignore

### Add New Entries
```bash
# Append to .gitignore
cat >> .gitignore << 'EOF'

# === Temporary Analysis Files ===
# Prevent future accumulation of temporary files

# Linting and type checking outputs
*.log
*_output.txt
ruff-*.txt
.ruff_*.txt
mypy-out*.txt
.mypy_*.txt

# Temporary Python scripts
tmp_*.py

# Temporary text files
.tmp_*.txt
*_COMMIT_MSG.txt
IMPROVEMENT_SUMMARY.txt
TERMINAL_OUTPUT_CHECK.txt

# CI/CD artifacts
run_*.log
.gha_run_*.log
_runs_all.json
.runs_grep.txt

# Note: archive/ is intentionally tracked for historical reference
# but should not receive new files in normal development
EOF
```

### Validation
```bash
# Verify .gitignore updated
tail -20 .gitignore

# Test that temporary files are now ignored
touch test_tmp_file.py
touch test_output.txt
git status | grep "test_tmp_file.py"  # Should not appear
git status | grep "test_output.txt"  # Should not appear
rm test_tmp_file.py test_output.txt
```

## Step 7: Create CONTRIBUTING.md

### Create File
```bash
cat > CONTRIBUTING.md << 'EOF'
# Contributing to PotFoundry

Thank you for your interest in contributing to PotFoundry!

## Quick Start

1. **Read the Documentation**
   - [README.md](README.md) - Project overview
   - [ARCHITECTURE.md](ARCHITECTURE.md) - System design
   - [docs/guides/DEVELOPMENT.md](docs/guides/DEVELOPMENT.md) - Development setup
   - [docs/guides/CODE_QUALITY_GUIDE.md](docs/guides/CODE_QUALITY_GUIDE.md) - Coding standards

2. **Set Up Development Environment**
   ```bash
   # Clone repository
   git clone https://github.com/patij212/PotFoundry-Lite-v2.0
   cd PotFoundry-Lite-v2.0

   # Create virtual environment
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate

   # Install dependencies
   pip install -r requirements.txt
   pip install -r requirements-dev.txt

   # Run tests
   PYTHONPATH=. pytest -v

   # Run linting
   ruff check .
   ```

3. **Make Your Changes**
   - Create a feature branch: `git checkout -b feature/your-feature-name`
   - Follow coding standards in [CODE_QUALITY_GUIDE.md](docs/guides/CODE_QUALITY_GUIDE.md)
   - Write tests for new functionality
   - Update documentation as needed

4. **Test Your Changes**
   ```bash
   # Run tests
   PYTHONPATH=. pytest -v

   # Run linting
   ruff check .

   # Test the app
   streamlit run app.py
   ```

5. **Submit a Pull Request**
   - Push your branch to GitHub
   - Create a pull request with clear description
   - Wait for CI checks to pass
   - Address review feedback

## Development Guidelines

### Code Style
- Follow [CODE_QUALITY_GUIDE.md](docs/guides/CODE_QUALITY_GUIDE.md)
- Use type hints for all function signatures
- Write comprehensive docstrings (Google style)
- Keep functions small and focused (<100 lines)
- Use descriptive variable names

### Testing
- Write tests for all new functionality
- Maintain 90%+ test coverage
- All tests must pass before merging
- Add regression tests for bug fixes

### Commit Messages
Use conventional commit format:
```
<type>: <short summary>

<optional body>

<optional footer>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `refactor`: Code restructuring (no behavior change)
- `perf`: Performance improvement
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat: Add elliptical cross-section support
fix: Prevent mesh collapse for large wall thickness
docs: Update architecture guide with new modules
```

### Pull Request Checklist

Before submitting, ensure:
- [ ] Code follows style guide
- [ ] All functions have docstrings
- [ ] Type hints added
- [ ] Tests added/updated
- [ ] Tests pass: `pytest -v`
- [ ] Linting clean: `ruff check .`
- [ ] App runs: `streamlit run app.py`
- [ ] Documentation updated
- [ ] CHANGELOG.md updated (for significant changes)

## Questions?

- Open a [GitHub Discussion](https://github.com/patij212/PotFoundry-Lite-v2.0/discussions)
- Check [docs/](docs/) for guides
- Review existing code for examples

---

**License:** PolyForm Noncommercial 1.0.0 (see [LICENSE](LICENSE))
**Commercial Use:** Requires separate license (see [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md))
EOF
```

### Validation
```bash
# Verify file created
ls -lh CONTRIBUTING.md
cat CONTRIBUTING.md | head -20
```

## Step 8: Final Verification

### Run Full Test Suite
```bash
# Ensure all tests still pass
PYTHONPATH=. pytest -v

# Expected: 99 tests passing, 0 failures
```

### Verify App Still Works
```bash
# Run Streamlit app
streamlit run app.py

# Manually verify:
# 1. App loads without errors
# 2. Can generate mesh
# 3. Can export STL
# 4. All tabs work
```

### Check Git Status
```bash
# See what changed
git status

# Should show:
# - New archive/ directory with files
# - Modified .gitignore
# - New CONTRIBUTING.md
# - New docs/README.md
# - Deleted temporary files
# - Moved markdown files
```

### Create Summary
```bash
# Count files in root before and after
ls *.md *.txt *.log 2>/dev/null | wc -l  # Compare to original 58

# Count archive files
find archive/ -type f | wc -l

# Verify docs organization
tree docs/ -L 2
```

## Step 9: Commit Changes

### Stage All Changes
```bash
git add -A
```

### Review Changes
```bash
# Review what will be committed
git status
git diff --cached --stat

# Review specific changes if needed
git diff --cached archive/README.md
git diff --cached .gitignore
```

### Commit
```bash
git commit -m "refactor: Reorganize documentation and archive historical files

Phase 1 of repository refactoring - Documentation cleanup:

Archive Structure:
- Created archive/evolution/2024-q4/ for improvement summaries
- Created archive/ci-logs/2024-q4/ for historical logs
- Created archive/refactoring/ for linting/type-check artifacts
- Added comprehensive READMEs for all archive directories

File Organization:
- Moved 13 historical docs to archive/evolution/2024-q4/
- Moved CI/CD logs to archive/ci-logs/2024-q4/
- Moved linting/type-check outputs to archive/refactoring/
- Deleted temporary files (tmp_*.py, *_COMMIT_MSG.txt, etc.)

Documentation:
- Reorganized docs/ with new guides/ subdirectory
- Created docs/README.md as documentation index
- Created CONTRIBUTING.md for contributor guidelines
- Updated .gitignore to prevent future temporary file accumulation

Result: Root directory reduced from 58 files to ~20 essential files

See REFACTORING_PLAN.md for complete refactoring roadmap.
"
```

### Push Changes (Optional)
```bash
# Push to feature branch
git push origin feature/refactor-documentation

# Or create PR via GitHub UI
```

## Rollback Procedure (If Needed)

### If Issues Found Before Commit
```bash
# Discard all changes
git reset --hard HEAD

# Or restore specific files
git checkout HEAD -- path/to/file
```

### If Issues Found After Commit
```bash
# Revert the commit
git revert HEAD

# Or reset to before commit (destructive)
git reset --hard HEAD~1
```

### Restore from Backup Branch
```bash
# Switch to backup
git checkout backup-pre-refactoring

# Create new working branch
git checkout -b feature/refactor-documentation-v2

# Cherry-pick specific changes if needed
git cherry-pick <commit-hash>
```

## Success Criteria

✅ **Phase 1 Complete When:**
- [ ] Root directory has ≤20 markdown/text files
- [ ] All historical documents in archive/ with READMEs
- [ ] All temporary files deleted
- [ ] docs/ reorganized with guides/ subdirectory
- [ ] .gitignore prevents future temporary file accumulation
- [ ] CONTRIBUTING.md created
- [ ] All 99 tests still pass
- [ ] App runs without errors
- [ ] Changes committed with descriptive message

## Troubleshooting

### "File not found" errors
- Some files may have already been moved in previous work
- Use `|| echo "Not found"` for graceful handling
- Check if file exists before moving: `[ -f file.md ] && mv file.md dest/`

### Git conflicts
- Ensure clean state before starting: `git status`
- Commit or stash changes before proceeding
- Use `git stash` to temporarily save work

### Tests fail after reorganization
- Most likely import path issues
- Check that no test files were accidentally moved
- Verify PYTHONPATH still correct: `PYTHONPATH=.`

---

**Document Version:** 1.0
**Last Updated:** January 2025
**Phase:** 1 - Documentation Cleanup
**Status:** Ready for Execution
