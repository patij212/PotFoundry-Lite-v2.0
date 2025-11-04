# PotFoundry Documentation

Comprehensive documentation for PotFoundry-Lite v2.x and beyond.

## Quick Links

### Essential Reading
- [Main README](../README.md) - Project overview and quick start
- [Architecture Guide](../ARCHITECTURE.md) - System design and structure
- [Roadmap](../ROADMAP.md) - Future vision (Qt desktop app, v3.0)
- [TODO List](../TODO.md) - Current development priorities
- [Contributing](../CONTRIBUTING.md) - How to contribute

### Development Guides
- [Development Setup](guides/DEVELOPMENT.md) - Environment setup, workflows, testing
- [Code Quality Guide](guides/CODE_QUALITY_GUIDE.md) - Coding standards and best practices
- [Type Hints Guide](guides/TYPE_HINTS_GUIDE.md) - Type annotation conventions
- [STL Export Guide](guides/STL_EXPORT_GUIDE.md) - Binary STL implementation details
- [Property-Based Testing](guides/PROPERTY_BASED_TESTING_IMPLEMENTATION.md) - Hypothesis integration

### Feature Documentation
- [Deep Link System](deeplink.md) - URL-based state sharing
- [Public Library](feature_public_library.md) - Public library features
- [Library Implementation](LIBRARY_IMPLEMENTATION_SUMMARY.md) - Implementation details
- [Alternative Storage](alt_s3_r2.md) - S3/R2 integration options
- [EdgeFlow Diagnostics](edgeflow_diagnostics.md) - Diagnostic features
- [CI MyPy Policy](CI_MYPY_POLICY.md) - Type checking policy

### Refactoring Documentation
- [Refactoring Overview](refactoring/README.md) - Complete refactoring plan and guides
- [Phase 1: Documentation](refactoring/MIGRATION_GUIDE_PHASE1.md) - Cleanup (✅ Complete)
- [Phase 2: Code Structure](refactoring/MIGRATION_GUIDE_PHASE2.md) - Split large files (🔄 In Progress)
- [Phase 3: Components](refactoring/MIGRATION_GUIDE_PHASE3.md) - Extract widgets/validators
- [Phase 4: Testing](refactoring/MIGRATION_GUIDE_PHASE4.md) - Reorganize test structure
- [Phase 5: CI/CD](refactoring/MIGRATION_GUIDE_PHASE5.md) - GitHub Actions automation

### Architecture Decision Records
- [ADR Index](../adr/README.md) - Design decisions and rationale

## Directory Structure

```
docs/
├── README.md                              # This file
├── guides/                                # How-to guides
│   ├── CODE_QUALITY_GUIDE.md
│   ├── DEVELOPMENT.md
│   ├── STL_EXPORT_GUIDE.md
│   ├── TYPE_HINTS_GUIDE.md
│   └── PROPERTY_BASED_TESTING_IMPLEMENTATION.md
├── refactoring/                           # Refactoring plans and guides
│   ├── README.md
│   ├── REFACTORING_PLAN.md
│   ├── REFACTORING_INDEX.md
│   ├── REFACTORING_EXECUTIVE_SUMMARY.md
│   ├── REFACTORING_ANALYSIS.md
│   ├── REFACTORING_QUICKREF.md
│   └── MIGRATION_GUIDE_PHASE*.md
├── deeplink.md                            # Feature docs
├── feature_public_library.md
├── LIBRARY_IMPLEMENTATION_SUMMARY.md
├── alt_s3_r2.md
├── edgeflow_diagnostics.md
└── CI_MYPY_POLICY.md
```

## Archive

Historical documents and evolution logs are preserved in:
- [archive/evolution/2024-q4/](../archive/evolution/2024-q4/) - Improvement summaries, reports
- [archive/ci-logs/2024-q4/](../archive/ci-logs/2024-q4/) - Historical CI logs
- [archive/refactoring/](../archive/refactoring/) - Linting/type-check artifacts

---

**Last Updated:** January 2025  
**Version:** v2.1.0+  
**Questions?** Open a [GitHub Discussion](https://github.com/patij212/PotFoundry-Lite-v2.0/discussions)
