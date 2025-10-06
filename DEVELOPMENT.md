# Development Guide

## Quick Start

### Prerequisites

- Python 3.11+ (tested on 3.11, 3.12, 3.13)
- pip
- Git

### Initial Setup

```bash
# Clone repository
git clone https://github.com/patij212/PotFoundry-Lite-v2.0
cd PotFoundry-Lite-v2.0

# Create virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install development tools
pip install pytest ruff

# Verify installation
pytest -v
streamlit run app.py
```

---

## Development Workflow

### 1. Before Making Changes

```bash
# Pull latest changes
git pull origin main

# Create feature branch
git checkout -b feature/your-feature-name

# Run tests to establish baseline
PYTHONPATH=. pytest -v

# Check code quality
ruff check .
```

### 2. Making Changes

Follow these guidelines:
- Read `ARCHITECTURE.md` to understand codebase structure
- Follow `CODE_QUALITY_GUIDE.md` for coding standards
- Make small, focused commits
- Write tests for new functionality
- Update documentation as you go

### 3. Testing Your Changes

```bash
# Run all tests
PYTHONPATH=. pytest -v

# Run specific test file
PYTHONPATH=. pytest tests/test_geometry.py -v

# Run tests with coverage
PYTHONPATH=. pytest --cov=potfoundry --cov=pfui tests/

# Run linting
ruff check .

# Auto-fix linting issues
ruff check . --fix
```

### 4. Manual Testing

```bash
# Test Streamlit app
streamlit run app.py
# Then interact with UI to verify changes work

# Test batch processing
python -c "
from potfoundry.yaml_api import build_from_yaml
build_from_yaml('path/to/config.yaml')
"

# Test core API
python -c "
from potfoundry import build_pot_mesh, write_stl_binary, STYLES
verts, faces, diag = build_pot_mesh(
    H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
    expn=1.1, n_theta=168, n_z=84,
    r_outer_fn=STYLES['SuperformulaBlossom'][0], style_opts={}
)
write_stl_binary('test.stl', 'Test', verts, faces)
print(f'Generated {len(faces)} triangles')
"
```

### 5. Committing Changes

```bash
# Stage changes
git add <files>

# Commit with descriptive message
git commit -m "feat: Add support for elliptical cross-sections"

# Push to remote
git push origin feature/your-feature-name
```

### 6. Creating Pull Request

- Create PR on GitHub
- Fill out PR template
- Wait for CI checks to pass
- Address review feedback
- Merge when approved

---

## Project Structure

```
PotFoundry-Lite-v2.0/
├── app.py                      # Streamlit UI entry point
├── potfoundry/                 # Core library (UI-agnostic)
│   ├── __init__.py            # Public API
│   ├── geometry.py            # Mesh generation
│   ├── schema.py              # Pydantic validation
│   ├── yaml_api.py            # Batch processing
│   └── core/                  # Alternative layout
│       ├── geometry.py
│       └── io/stl.py          # Binary STL writer
├── pfui/                      # Streamlit UI components
│   ├── imports.py             # Flexible imports
│   ├── state.py               # State management
│   ├── controls.py            # UI controls
│   ├── preview.py             # 3D preview
│   ├── presets.py             # Preset management
│   └── ...
├── tests/                     # Test suite
│   ├── test_geometry.py
│   ├── test_stl_binary.py
│   └── pfui/
├── docs/                      # Documentation
│   ├── ARCHITECTURE.md        # Architecture guide
│   ├── CODE_QUALITY_GUIDE.md  # Coding standards
│   └── DEVELOPMENT.md         # This file
├── requirements.txt           # Python dependencies
└── .gitignore                # Git ignore patterns
```

---

## Common Development Tasks

### Adding a New Style

1. **Define style function** in `potfoundry/geometry.py`:

```python
def r_outer_my_style(
    theta: float, z: float, r0: float, H: float, opts: Dict[str, float]
) -> float:
    """My custom decorative style.
    
    Args:
        theta: Angle around pot (0 to 2π radians)
        z: Height above bottom (0 to H millimeters)
        r0: Base radius at this height (before modulation)
        H: Total pot height in millimeters
        opts: Style-specific parameters from UI/config
    
    Returns:
        Modulated radius at this angle and height
    """
    # Extract parameters with defaults
    amplitude = float(opts.get('my_amplitude', 0.1))
    frequency = float(opts.get('my_frequency', 5))
    
    # Compute normalized height (0 to 1)
    t = z / H if H > 0 else 0.0
    
    # Apply modulation
    modulation = amplitude * math.sin(frequency * theta)
    return r0 * (1.0 + modulation * t)
```

2. **Register in STYLES dict**:

```python
STYLES = {
    "MyStyle": (r_outer_my_style, "Description of style effect"),
    # ... other styles
}
```

3. **Define UI schema** in `pfui/schemas.py`:

```python
STYLE_SCHEMAS = {
    "MyStyle": [
        ("my_amplitude", "range", 0.0, 0.5, 0.1, 0.01, "Amplitude"),
        ("my_frequency", "int", 1, 20, 5, 1, "Frequency"),
    ],
    # ... other styles
}
```

4. **Add test** in `tests/test_styles_and_parity.py`:

```python
def test_my_style_generates_valid_mesh():
    """Verify MyStyle produces valid mesh."""
    r_fn = STYLES["MyStyle"][0]
    verts, faces, diag = build_pot_mesh(
        H=100, Rt=60, Rb=40, t_wall=3, t_bottom=3, r_drain=8,
        expn=1.1, n_theta=120, n_z=60,
        r_outer_fn=r_fn, style_opts={'my_amplitude': 0.2, 'my_frequency': 7}
    )
    assert faces.shape[0] > 0
    assert verts.shape[0] > 0
```

5. **Test manually**:

```bash
# Run Streamlit app
streamlit run app.py

# Select "MyStyle" from dropdown
# Adjust parameters
# Verify preview looks correct
# Export STL and check in slicer
```

### Modifying Core Geometry

**IMPORTANT:** Changes to `build_pot_mesh()` affect all users.

1. **Understand current behavior** - Read `ARCHITECTURE.md` section on geometry
2. **Write tests first** (TDD approach):

```python
def test_new_feature_works():
    """Verify new feature produces expected results."""
    # Expected behavior with new feature
    pass

def test_backward_compatibility():
    """Ensure existing usage still works."""
    # Regression test with old-style calls
    pass
```

3. **Make minimal changes** - Add new optional parameters, don't modify existing behavior
4. **Update diagnostics** if adding new metrics
5. **Document thoroughly** - Update docstrings, add inline comments
6. **Performance test** - Ensure no regression:

```python
import time

def test_performance_no_regression():
    start = time.time()
    verts, faces, diag = build_pot_mesh(...)
    elapsed = time.time() - start
    assert elapsed < 0.5, f"Too slow: {elapsed:.3f}s"
```

### Adding UI Features

1. **Keep UI logic in `pfui/` directory** - Don't mix with core
2. **Use session state properly**:

```python
from pfui.state import queue_update, apply_pending_updates

# At start of Streamlit script
apply_pending_updates()

# When user changes value
if st.button("Apply"):
    queue_update({"param": new_value})
    st.rerun()
```

3. **Test UI components** (in `tests/pfui/`):

```python
def test_control_widget_returns_expected_type():
    """Verify control returns correct data type."""
    from pfui.controls import my_control
    result = my_control("test_key")
    assert isinstance(result, dict)
    assert "param" in result
```

### Debugging

#### Enable Debug Logging

```python
import logging
logging.basicConfig(level=logging.DEBUG)

# In code
logging.debug(f"Mesh has {len(faces)} faces")
```

#### Interactive Debugging

```python
# Add breakpoint
import pdb; pdb.set_trace()

# Or use ipdb for better experience
pip install ipdb
import ipdb; ipdb.set_trace()
```

#### Visualize Mesh

```python
# Quick visualization with matplotlib
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D

fig = plt.figure()
ax = fig.add_subplot(111, projection='3d')
ax.plot_trisurf(verts[:, 0], verts[:, 1], verts[:, 2], triangles=faces)
plt.show()
```

#### Validate STL Files

```bash
# Use online validators
# Upload to https://www.viewstl.com/

# Or use command-line tools
admesh --normal-values test.stl
```

---

## Testing

### Test Organization

```
tests/
├── test_geometry.py           # Core geometry tests
├── test_stl_binary.py         # STL export tests
├── test_stl_migration.py      # Migration tests
├── test_styles_and_parity.py  # Style function tests
├── test_integration_binary_stl.py  # End-to-end tests
└── pfui/                      # UI component tests
    ├── test_state.py
    ├── test_schemas.py
    └── test_state_history.py
```

### Writing Tests

#### Unit Test Example

```python
def test_base_radius_computes_correct_interpolation():
    """Verify base_radius interpolates correctly between Rb and Rt."""
    from potfoundry.geometry import base_radius
    
    opts = {}
    
    # At bottom (z=0), should return Rb
    r_bottom = base_radius(z=0, H=100, Rb=40, Rt=60, expn=1.0, opts=opts)
    assert abs(r_bottom - 40) < 0.01
    
    # At top (z=H), should return Rt
    r_top = base_radius(z=100, H=100, Rb=40, Rt=60, expn=1.0, opts=opts)
    assert abs(r_top - 60) < 0.01
    
    # At middle with expn=1.0 (linear), should be halfway
    r_mid = base_radius(z=50, H=100, Rb=40, Rt=60, expn=1.0, opts=opts)
    assert abs(r_mid - 50) < 0.01
```

#### Integration Test Example

```python
def test_end_to_end_pot_generation():
    """Test complete workflow from parameters to STL file."""
    import tempfile
    from pathlib import Path
    from potfoundry import build_pot_mesh, write_stl_binary, STYLES
    
    # Generate mesh
    style_fn = STYLES["SuperformulaBlossom"][0]
    verts, faces, diag = build_pot_mesh(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=168, n_z=84,
        r_outer_fn=style_fn, style_opts={}
    )
    
    # Export to temporary file
    with tempfile.TemporaryDirectory() as tmpdir:
        stl_path = Path(tmpdir) / "test.stl"
        write_stl_binary(stl_path, "TestPot", verts, faces)
        
        # Verify file exists and has expected size
        assert stl_path.exists()
        size = stl_path.stat().st_size
        expected_size = 84 + (50 * len(faces))  # Header + facets
        assert size == expected_size
```

#### Parametric Test Example

```python
import pytest

@pytest.mark.parametrize("style_name", [
    "SuperformulaBlossom",
    "FourierBloom",
    "SpiralRidges",
    "SuperellipseMorph",
    "HarmonicRipple",
])
def test_all_styles_generate_valid_meshes(style_name):
    """Verify each style produces valid mesh."""
    from potfoundry import build_pot_mesh, STYLES
    
    style_fn = STYLES[style_name][0]
    verts, faces, diag = build_pot_mesh(
        H=100, Rt=60, Rb=40, t_wall=3, t_bottom=3, r_drain=8,
        expn=1.1, n_theta=120, n_z=60,
        r_outer_fn=style_fn, style_opts={}
    )
    
    assert faces.shape[0] > 0, f"{style_name} produced no faces"
    assert verts.shape[0] > 0, f"{style_name} produced no vertices"
```

### Running Specific Tests

```bash
# Run single test function
PYTHONPATH=. pytest tests/test_geometry.py::test_base_radius_computes_correct_interpolation -v

# Run all tests in file
PYTHONPATH=. pytest tests/test_geometry.py -v

# Run tests matching pattern
PYTHONPATH=. pytest -k "style" -v

# Run with output
PYTHONPATH=. pytest tests/ -v -s

# Run with coverage report
PYTHONPATH=. pytest --cov=potfoundry --cov=pfui --cov-report=html tests/
# Then open htmlcov/index.html
```

---

## Performance Optimization

### Profiling

```python
import cProfile
import pstats
from potfoundry import build_pot_mesh, STYLES

def profile_mesh_generation():
    style_fn = STYLES["SuperformulaBlossom"][0]
    verts, faces, diag = build_pot_mesh(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=168, n_z=84,
        r_outer_fn=style_fn, style_opts={}
    )

# Profile it
profiler = cProfile.Profile()
profiler.enable()
profile_mesh_generation()
profiler.disable()

# Print stats
stats = pstats.Stats(profiler)
stats.sort_stats('cumulative')
stats.print_stats(20)  # Top 20 functions
```

### Benchmarking

```python
import time
import numpy as np

def benchmark_operation(func, *args, iterations=100, **kwargs):
    """Benchmark function execution time."""
    times = []
    for _ in range(iterations):
        start = time.perf_counter()
        result = func(*args, **kwargs)
        elapsed = time.perf_counter() - start
        times.append(elapsed)
    
    times = np.array(times)
    print(f"Mean: {times.mean()*1000:.2f}ms")
    print(f"Std: {times.std()*1000:.2f}ms")
    print(f"Min: {times.min()*1000:.2f}ms")
    print(f"Max: {times.max()*1000:.2f}ms")
    
    return result

# Usage
result = benchmark_operation(build_pot_mesh, H=120, Rt=70, ...)
```

### Optimization Checklist

- [ ] Use NumPy vectorized operations (not Python loops)
- [ ] Pre-allocate arrays when size is known
- [ ] Cache expensive, pure computations with `@lru_cache`
- [ ] Avoid unnecessary array copies
- [ ] Use in-place operations where safe
- [ ] Profile before optimizing (don't guess!)
- [ ] Verify performance with benchmarks
- [ ] Document why optimization is needed

---

## Continuous Integration

### GitHub Actions (Planned)

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        python-version: ['3.11', '3.12', '3.13']
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: ${{ matrix.python-version }}
      - run: pip install -r requirements.txt pytest ruff
      - run: ruff check .
      - run: pytest -v
```

### Local Pre-Commit Hook

```bash
# .git/hooks/pre-commit
#!/bin/bash
echo "Running pre-commit checks..."

# Run tests
PYTHONPATH=. pytest -v
if [ $? -ne 0 ]; then
    echo "Tests failed. Commit aborted."
    exit 1
fi

# Run linting
ruff check .
if [ $? -ne 0 ]; then
    echo "Linting failed. Commit aborted."
    exit 1
fi

echo "All checks passed!"
```

---

## Troubleshooting

### Common Issues

#### Import Errors

```
ModuleNotFoundError: No module named 'potfoundry'
```

**Solution:** Set PYTHONPATH:
```bash
export PYTHONPATH=/path/to/PotFoundry-Lite-v2.0:$PYTHONPATH
```

Or add to test command:
```bash
PYTHONPATH=. pytest -v
```

#### Streamlit State Errors

```
StreamlitAPIException: Session state does not function without streamlit run
```

**Solution:** Don't test Streamlit-specific code outside of Streamlit context.
Extract testable logic to separate functions.

#### Mesh Generation Failures

```
AssertionError: Drain hole too large for base
```

**Solution:** Adjust parameters to satisfy constraints:
- `r_drain < Rb - t_wall - 2.0`
- `t_wall > 0`
- `t_bottom >= 2.0`

### Getting Help

1. **Read documentation:**
   - `ARCHITECTURE.md` - Understand structure
   - `CODE_QUALITY_GUIDE.md` - Learn standards
   - This file - Development workflows

2. **Check tests:**
   - Look for similar test cases
   - Tests serve as examples

3. **Debug interactively:**
   - Use `ipdb` for step-through debugging
   - Add print statements
   - Visualize intermediate results

4. **Ask for help:**
   - Open GitHub issue with details
   - Provide minimal reproducing example
   - Include error messages and context

---

## Release Process (Planned)

### Version Numbering

Semantic Versioning (SemVer): `MAJOR.MINOR.PATCH`

- **MAJOR:** Breaking changes
- **MINOR:** New features (backward compatible)
- **PATCH:** Bug fixes

### Release Checklist

- [ ] All tests passing on all platforms
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version bumped in `app.py` and `__init__.py`
- [ ] Git tag created: `git tag v2.1.0`
- [ ] Tag pushed: `git push --tags`
- [ ] GitHub release created with notes
- [ ] PyPI package published (if applicable)

---

## Resources

### Documentation

- **ARCHITECTURE.md** - System design and structure
- **CODE_QUALITY_GUIDE.md** - Coding standards and best practices
- **STL_EXPORT_GUIDE.md** - STL export migration guide
- **IMPLEMENTATION_SUMMARY.md** - Binary STL implementation details

### External Resources

- [NumPy Documentation](https://numpy.org/doc/stable/)
- [Pydantic Documentation](https://docs.pydantic.dev/)
- [Streamlit Documentation](https://docs.streamlit.io/)
- [pytest Documentation](https://docs.pytest.org/)
- [Ruff Documentation](https://docs.astral.sh/ruff/)

### STL Format

- [STL Format Specification](https://en.wikipedia.org/wiki/STL_(file_format))
- [Binary STL Structure](https://www.fabbers.com/tech/STL_Format)

---

**Last Updated:** 2024  
**For Version:** PotFoundry v2.0+
