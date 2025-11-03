# Type Checking Artifacts

MyPy type checking outputs from type hint addition phases.

## Key Files

### Progression
- `mypy-out.txt` - Initial type checking run
- `mypy-out2.txt` - After Phase 1 improvements
- `mypy_full_output.txt` - Comprehensive scan

### Module-Specific
- `.mypy_ci.txt` - CI/CD focused checks
- `.mypy_geom.txt` - Geometry module
- `.mypy_preview.txt` - Preview module
- `.mypy_supabase.txt` - Supabase integration

### Configuration
- See `mypy.ini` and `mypy_ci.ini` in root directory
- Progressive strictness approach
- Module-by-module configuration

## Type Hint Coverage Progress

### Phase 1: Core Modules (65 functions)
- potfoundry/geometry.py
- potfoundry/core/geometry.py
- potfoundry/yaml_api.py
- pfui/colors.py
- pfui/deeplink.py

### Phase 2: Support Modules (12 functions)
- potfoundry/core/io/stl.py
- pfui/state.py
- pfui/exporters.py

### Phase 3: UI Layer (13 functions)
- pfui/controls.py
- pfui/preview.py
- pfui/presets.py
- app.py utilities

**Total Coverage:** ~90 functions, 80% of codebase

## Related Documentation

See `docs/guides/TYPE_HINTS_GUIDE.md` for current conventions.

---

**Period:** Q4 2024  
**Tools:** mypy 1.7.x → 1.8.x  
**Coverage:** 80% → target 95%
