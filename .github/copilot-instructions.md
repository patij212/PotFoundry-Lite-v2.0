# Copilot Instructions for PotFoundry

## Project Overview

PotFoundry is a parametric 3D pot generator that creates customizable, 3D-printable plant pots with decorative patterns. The project uses a Streamlit UI for user interaction and generates production-ready STL files optimized for 3D printing.

**Key Features:**
- Five artistic styles (Petal variations, Spiral ridges, Harmonic ripples, etc.)
- Fast binary STL export (80% smaller files, 10x faster than ASCII)
- Watertight meshes with full parametric control
- Live 3D preview with Plotly
- Public library publishing and deep link sharing
- Comprehensive testing (99 tests, 100% pass rate)

## Architecture

### Core Principles

1. **UI-Agnostic Core**: The `potfoundry/` module is UI-independent
2. **Clean Separation**: Core logic separate from UI layer (`pfui/`)
3. **Type Safety**: Pydantic v2 for schema validation
4. **LLM-Friendly**: Comprehensive docstrings, clear structure

### Directory Structure

```
PotFoundry-Lite-v2.0/
├── app.py                  # Streamlit entry point
├── potfoundry/            # Core library (UI-agnostic)
│   ├── geometry.py        # Main geometry engine
│   ├── schema.py          # Pydantic v2 schemas
│   ├── yaml_api.py        # YAML config and batch builds
│   └── core/io/stl.py     # Binary STL writer
├── pfui/                  # Streamlit UI components
│   ├── state.py           # Session state management
│   ├── controls.py        # UI widgets
│   ├── preview.py         # 3D preview
│   └── presets.py         # Preset management
└── tests/                 # Test suite (pytest)
```

## Coding Standards

### Python Style

- **Python Version**: 3.11+ (tested on 3.11, 3.12, 3.13)
- **Linter**: `ruff` for code quality checks
- **Type Hints**: Required for all function signatures
- **Docstrings**: Google-style docstrings for all public functions

### Import Organization

```python
# Standard library
from __future__ import annotations
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

# Third-party
import numpy as np
from pydantic import BaseModel, Field

# Local/relative
from .core.io.stl import write_stl_binary
from .schema import ConfigV2
```

### Naming Conventions

- **Variables**: `snake_case` (e.g., `wall_thickness`, `n_theta`)
- **Functions**: `snake_case` (e.g., `build_pot_mesh`, `write_stl_binary`)
- **Classes**: `PascalCase` (e.g., `ConfigV2`, `StyleFunction`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `PETAL_AMPLITUDE_FACTOR`)

### Documentation Requirements

Every public function must have:
1. Brief one-line description
2. Detailed explanation of purpose and behavior
3. All parameters documented with types and constraints
4. Return value(s) documented with types
5. Raises section for exceptions
6. Example usage (for complex functions)
7. Performance notes (for critical paths)

Example:
```python
def build_pot_mesh(
    H: float, Rt: float, Rb: float,
    t_wall: float, t_bottom: float, r_drain: float,
    expn: float, n_theta: int, n_z: int,
    r_outer_fn: Callable[[float, float, float, float, dict], float],
    style_opts: dict
) -> tuple[np.ndarray, np.ndarray, dict]:
    """Generate a watertight triangular mesh for a parametric flower pot.

    Args:
        H: Total height in mm (must be > 0)
        Rt: Top radius in mm (must be > 0)
        Rb: Bottom radius in mm (must be > 0)
        ...

    Returns:
        Tuple of (vertices, faces, diagnostics)

    Raises:
        AssertionError: If parameters are invalid
        ValueError: If style function is malformed
    """
```

### Anti-Patterns to Avoid

**❌ Magic Numbers**
```python
# Bad
radius = base_radius * 0.35

# Good
PETAL_AMPLITUDE_FACTOR = 0.35  # Calibrated for aesthetic balance
radius = base_radius * PETAL_AMPLITUDE_FACTOR
```

**❌ Mutable Default Arguments**
```python
# Bad
def style_function(theta, z, opts={}):
    opts.setdefault('param', 1.0)

# Good
def style_function(theta, z, opts=None):
    if opts is None:
        opts = {}
    param = opts.get('param', 1.0)
```

## Testing

### Test Organization

- Tests mirror module structure: `potfoundry/geometry.py` → `tests/test_geometry.py`
- Use `pytest` for all testing
- Use `PYTHONPATH=. pytest -v` to run tests

### Test Requirements

- **Unit tests**: For individual functions and components
- **Integration tests**: For end-to-end workflows
- **Regression tests**: Golden mesh comparisons for geometry changes
- **Performance tests**: For critical paths (mesh generation, STL export)

### Running Tests

```bash
# Run all tests
PYTHONPATH=. pytest -v

# Run specific test file
PYTHONPATH=. pytest tests/test_geometry.py -v

# Run with coverage
PYTHONPATH=. pytest --cov=potfoundry --cov=pfui tests/

# Run linting
ruff check .

# Auto-fix linting issues
ruff check . --fix
```

## Build and Run

### Development Setup

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install dev tools
pip install pytest ruff

# Verify installation
pytest -v
streamlit run app.py
```

### Running the Application

```bash
# Start Streamlit app
streamlit run app.py

# Or use the convenience script
./start_streamlit.sh
```

## Git Workflow

### Commit Message Format

Use conventional commit format: `<type>: <short summary>`

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `refactor`: Code restructuring (no behavior change)
- `perf`: Performance improvement
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat: Add new HarmonicRipple style with petal variations
fix: Prevent mesh collapse when wall thickness exceeds radius
docs: Add comprehensive docstrings to geometry functions
refactor: Extract rim bridging logic to separate function
perf: Vectorize inner wall vertex generation
test: Add golden mesh regression tests
```

### Pull Request Checklist

Before submitting a PR:

- [ ] Code follows style guide
- [ ] All functions have docstrings
- [ ] Type hints added
- [ ] Tests added/updated
- [ ] Tests pass: `pytest -v`
- [ ] Linting clean: `ruff check .`
- [ ] App runs: `streamlit run app.py`
- [ ] No performance regressions
- [ ] Documentation updated
- [ ] CHANGELOG.md updated (if applicable)

## Key Files to Reference

When working on the codebase, consult these documentation files:

- **ARCHITECTURE.md** - System design and structure
- **CODE_QUALITY_GUIDE.md** - Detailed coding standards and best practices
- **DEVELOPMENT.md** - Development workflow and setup
- **STL_EXPORT_GUIDE.md** - STL export implementation details
- **TODO.md** - Development roadmap and planned features
- **README.md** - Project overview and quick start

## Performance Guidelines

- Use NumPy vectorization for array operations
- Cache expensive computations with `functools.lru_cache`
- Profile critical paths before optimizing
- Target: 50-100ms for mesh generation at default resolution
- Memory usage: O(n_theta * n_z) for vertex arrays

## Error Handling

### Input Validation

Validate inputs early with clear error messages:

```python
assert H > 0, f"Height must be positive, got {H}"
assert t_wall > 0, f"Wall thickness must be positive, got {t_wall}"
assert r_drain < Rb - t_wall, f"Drain radius {r_drain} too large for bottom radius {Rb}"
```

### Assertions for Internal Invariants

```python
assert len(vertices) > 0, "Mesh must have vertices"
assert np.all(np.isfinite(vertices)), "Vertices contain NaN/Inf"
```

## Security Notes

- Use `pre-commit` hooks with `detect-secrets` to prevent secret commits
- Never commit Supabase `service_role` keys or other sensitive credentials
- Review `.pre-commit-config.yaml` for security scanning rules

## Common Tasks

### Adding a New Style

1. Add style function to `potfoundry/geometry.py`
2. Register in `STYLES` dictionary
3. Add schema to `pfui/schemas.py` (if parameters needed)
4. Add preset to `pfui/presets.py`
5. Add tests to `tests/test_styles_and_parity.py`
6. Update documentation

### Modifying Core Geometry

1. Review `ARCHITECTURE.md` for design principles
2. Update `potfoundry/geometry.py`
3. Add/update tests in `tests/`
4. Run golden mesh regression tests
5. Check performance benchmarks
6. Update docstrings

### UI Changes

1. Modify components in `pfui/`
2. Maintain separation from core logic
3. Test with `streamlit run app.py`
4. Ensure responsive behavior
5. Update UI-related tests

## Additional Context

- **License**: PolyForm Noncommercial 1.0.0 (free for non-commercial use)
- **Commercial use** requires a separate license
- **Current Version**: v2.1.0
- **Future Plans**: Qt desktop app (v2.5.0), production release (v3.0.0)

## Working with LLMs

When providing code changes:
1. Include context about the overall design (reference ARCHITECTURE.md)
2. Specify constraints (backward compatibility, performance requirements)
3. Request tests for new functionality
4. Follow the existing code style and patterns
5. Make minimal, focused changes

When requesting changes from LLMs:
1. Be specific about which files to modify
2. Provide examples of desired behavior
3. Mention edge cases to handle
4. Request performance considerations
