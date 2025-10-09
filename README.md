# 🏺 PotFoundry Lite v2.2

**Parametric, 3D-printable plant pots with a lightweight Streamlit UI.**

Generate beautiful, customizable flower pots with decorative patterns. Adjust dimensions and style, preview in your browser, and export production-ready STL files optimized for 3D printing.

[![Tests](https://img.shields.io/badge/tests-99%20passing-brightgreen)]()
[![Python](https://img.shields.io/badge/python-3.11%2B-blue)]()
[![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial-blue)]()

---

## ✨ Features

- **🎨 Five Artistic Styles** - Petal variations, spiral ridges, harmonic ripples, and more
- **⚡ Fast Binary STL Export** - 80% smaller files, 10x faster than ASCII
- **🔒 Watertight Meshes** - Production-ready geometry, every time
- **📐 Full Parametric Control** - Height, diameter, wall thickness, drainage, flare
- **🎯 Live 3D Preview** - Interactive Plotly visualization with synchronized colors
- **📸 Snapshot Capture** - Save and compare design variations
- **📦 Batch Processing** - Generate multiple designs from YAML config
- **📚 Public Library Publishing** - Share designs with the community (optional, requires Supabase)
- **🔗 Deep Link Sharing** - Share and restore designs via URL
- **✅ Comprehensive Testing** - 99 tests, golden mesh regression, performance benchmarks

---

## 🚀 Quick Start

### Prerequisites

- Python 3.11+ (tested on 3.11, 3.12, 3.13)
- pip

### Installation

```bash
# Clone repository
git clone https://github.com/patij212/PotFoundry-Lite-v2.0
cd PotFoundry-Lite-v2.0

# Install dependencies
pip install -r requirements.txt

# Run the app
streamlit run app.py
```

The app will open in your browser (usually http://localhost:8501).

### Basic Usage

1. **Choose a style** from the dropdown (SuperformulaBlossom, FourierBloom, etc.)
2. **Adjust parameters** using sliders (height, diameter, wall thickness)
3. **Preview in 3D** - rotate and zoom to inspect
4. **Export STL** - click download button for 3D printing

### Using the Core API

```python
from potfoundry import build_pot_mesh, write_stl_binary, STYLES

# Choose a style
style_fn = STYLES["SuperformulaBlossom"][0]

# Generate mesh
verts, faces, diagnostics = build_pot_mesh(
    H=120,        # Height (mm)
    Rt=70,        # Top radius (mm)
    Rb=50,        # Bottom radius (mm)
    t_wall=3,     # Wall thickness (mm)
    t_bottom=3,   # Bottom thickness (mm)
    r_drain=10,   # Drain hole radius (mm)
    expn=1.1,     # Flare exponent (>1 = flares toward top)
    n_theta=168,  # Angular resolution
    n_z=84,       # Vertical resolution
    r_outer_fn=style_fn,
    style_opts={}
)

# Export to STL
write_stl_binary("my_pot.stl", "FlowerPot", verts, faces)
print(f"Generated {len(faces)} triangles")
```

### Batch Processing

Create a YAML config and generate multiple pots:

```yaml
# config.yaml
version: 2
outdir: "output"
save_previews: true

defaults:
  height: 120
  top_od: 140
  bottom_od: 90
  wall: 3

recipes:
  - name: "SmallBlossom"
    style: "SuperformulaBlossom"
    size:
      height: 80
      top_od: 100
  
  - name: "LargeRipple"
    style: "HarmonicRipple"
    size:
      height: 150
      top_od: 180
```

```python
from potfoundry.yaml_api import build_from_yaml

build_from_yaml("config.yaml")
# Generates STL files in output/ directory
```

---

## 📚 Public Library Publishing (Optional)

Share your designs with the community! When configured, PotFoundry can publish your designs to a public library hosted on Supabase.

### Features

- **Content-addressed storage**: Duplicate designs are automatically deduplicated
- **Persistent hosting**: Designs survive app restarts (not stored in ephemeral containers)
- **Browse & download**: Anyone can view and download published STL files
- **Deep linking**: "Open in editor" button restores design parameters from URL
- **License control**: Choose from CC, MIT, Apache licenses
- **Tags & search**: Filter by style, tags, or title

### Setup

1. **Create a Supabase project** (free tier available):
   - Go to https://app.supabase.com
   - Create new project
   - Note your project URL and service key

2. **Configure storage**:
   - Create a bucket named `pots` (public read access)
   - Run the SQL migration from `db/migrations/0001_create_pots.sql`

3. **Add secrets**:
   ```toml
   # .streamlit/secrets.toml
   [connections.supabase]
   url = "https://YOUR_PROJECT.supabase.co"
   key = "YOUR_SERVICE_ROLE_KEY"
   bucket = "pots"
   ```

4. **Restart app** - The "Public Library" tab will appear automatically

### Usage

When exporting an STL:
1. Expand "📚 Publish to Public Library"
2. Check "Enable publishing"
3. Fill in title, tags, and license
4. Agree to license terms
5. Click "Export STL..." to publish

Published designs appear in the Library tab with:
- Thumbnail preview
- Download button
- "Open in editor" button (restores design state)

### Security & Privacy

⚠️ **All published designs are public.** Do not publish:
- Proprietary designs
- Designs with sensitive information
- Designs you don't own the rights to

✅ **Built-in protections:**
- Rate limiting (max 5 publishes per 60 seconds)
- Content validation (title/tag blocklist)
- Size limits (25MB max STL size)
- License consent required

### Alternative Storage

Don't want to use Supabase? See `docs/alt_s3_r2.md` for:
- AWS S3 + DynamoDB
- Cloudflare R2 + D1 (zero egress costs)

### Graceful Degradation

Library publishing is **optional**. If not configured:
- App works normally (local export still available)
- No Library tab shown
- No errors or warnings

---

## 📁 Project Structure

```
PotFoundry-Lite-v2.0/
├── app.py                      # Streamlit UI entry point
├── potfoundry/                 # Core library (UI-agnostic)
│   ├── geometry.py            # Mesh generation engine
│   ├── schema.py              # Pydantic v2 schemas
│   ├── yaml_api.py            # Batch processing
│   └── core/
│       ├── geometry.py        # Alternative geometry implementation
│       └── io/stl.py          # Binary STL writer
├── pfui/                      # Streamlit UI components
│   ├── controls.py            # UI widgets
│   ├── preview.py             # 3D visualization
│   ├── presets.py             # Preset management
│   └── ...
├── tests/                     # Test suite (58 tests)
│   ├── test_performance.py    # Performance benchmarks
│   ├── test_golden_meshes.py  # Regression tests
│   └── ...
├── docs/
│   ├── ARCHITECTURE.md        # System design guide
│   ├── CODE_QUALITY_GUIDE.md  # LLM-friendly coding standards
│   ├── DEVELOPMENT.md         # Developer workflows
│   └── ROADMAP.md             # Future Qt desktop app plan
└── requirements.txt
```

---

## 📚 Documentation

### For Users
- **README.md** (this file) - Getting started
- **STL_EXPORT_GUIDE.md** - Binary STL migration guide
- **CHANGELOG.md** - Version history

### For Developers
- **ARCHITECTURE.md** - Complete system architecture, data flow, algorithms
- **CODE_QUALITY_GUIDE.md** - LLM-friendly coding standards and best practices
- **DEVELOPMENT.md** - Developer workflows, testing, debugging
- **ROADMAP.md** - Evolution to Qt desktop app

### For LLMs
The codebase is extensively documented for AI assistants:
- Comprehensive docstrings on all public functions
- Inline comments explaining complex logic
- Type hints throughout
- Clear module organization
- Example usage patterns
- Performance notes

---

## 🎨 Available Styles

| Style | Description |
|-------|-------------|
| **SuperformulaBlossom** | Petal-like variations using Gielis superformula |
| **FourierBloom** | Floral profile from blended harmonics |
| **SpiralRidges** | Rising helical ribs with fine grooves |
| **SuperellipseMorph** | Circle → rounded square → soft diamond vs height |
| **HarmonicRipple** | Petals + ripples + gentle mid-height bell |

Each style has multiple parameters to customize the effect.

---

## 🧪 Testing

```bash
# Install test dependencies
pip install pytest

# Run all tests
PYTHONPATH=. pytest -v

# Run specific test category
PYTHONPATH=. pytest tests/test_performance.py -v
PYTHONPATH=. pytest tests/test_golden_meshes.py -v

# Run with coverage
PYTHONPATH=. pytest --cov=potfoundry --cov=pfui tests/
```

### Test Suite

- **99 tests total** (100% pass rate)
- **Unit tests** - Core functions, geometry, STL export
- **Integration tests** - End-to-end workflows
- **Performance benchmarks** - Verify speed targets met
- **Golden mesh regression** - Ensure deterministic output
- **Watertightness validation** - Verify closed surfaces
- **UI component tests** - State management, presets, snapshots

### Performance Targets (All Met ✅)

- Typical mesh (168×84): **132ms** (target: <200ms)
- Binary STL export: **15ms** (target: <100ms)
- End-to-end workflow: **144ms** (target: <500ms)

---

## 🛠️ Development

### Setup Development Environment

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install development tools
pip install pytest ruff

# Run tests
PYTHONPATH=. pytest -v

# Run linter
ruff check .
```

### Adding a New Style

See **DEVELOPMENT.md** for complete guide. Quick overview:

1. Define style function in `potfoundry/geometry.py`
2. Register in `STYLES` dict
3. Add UI schema in `pfui/schemas.py`
4. Add test in `tests/test_styles_and_parity.py`
5. Test in Streamlit app

### Contributing

Pull requests welcome! Please:
- Follow **CODE_QUALITY_GUIDE.md**
- Add tests for new features
- Update documentation
- Ensure all tests pass: `pytest -v`
- Run linter: `ruff check .`

---

## 🚀 Future Vision

### Planned: Qt Desktop Application (v3.0)

The roadmap includes evolution to a professional desktop application:

- **PySide6 + VTK** - High-performance 3D preview
- **Multi-threaded** - Non-blocking UI, cancellable operations
- **Advanced features** - Comparison view, design health, enhanced presets
- **Native packaging** - PyInstaller bundles for Windows/macOS/Linux

See **ROADMAP.md** for detailed evolution plan.

**Current focus:** Streamlit app enhancements (v2.x)  
**Future major version:** Qt desktop app (v3.0)

---

## 📊 Performance

### File Size Comparison

| Format | Size | Reduction |
|--------|------|-----------|
| ASCII STL | 8.5 MB | - |
| Binary STL | 1.7 MB | **80%** |

### Speed Comparison

| Operation | Time | vs ASCII |
|-----------|------|----------|
| Mesh generation (168×84) | 132ms | - |
| Binary STL export | 15ms | **10x faster** |
| Complete workflow | 144ms | - |

---

## 🔒 License & Commercial Use

- **Free for hobby, educational, and noncommercial use** under the **PolyForm Noncommercial 1.0.0** license
- **Commercial use** (selling printed pots, bundling in paid software, business use) **requires a commercial license**
- See `LICENSE` and `COMMERCIAL-LICENSE.md` for details

---

## 🙏 Acknowledgments

- **Gielis Superformula** - Mathematical foundation for petal patterns
- **Streamlit** - Rapid UI development
- **NumPy** - Vectorized mesh generation
- **Pydantic** - Schema validation
- **VTK/PyVista** - (Planned) High-performance 3D rendering

---

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/patij212/PotFoundry-Lite-v2.0/issues)
- **Discussions:** [GitHub Discussions](https://github.com/patij212/PotFoundry-Lite-v2.0/discussions)
- **Documentation:** See `docs/` directory

---

## 📈 Project Status

**Current Version:** v2.2  
**Status:** Production-ready  
**Test Coverage:** 99 tests (100% pass)  
**Performance:** All targets met ✅  
**Documentation:** Comprehensive ✅  
**Next Version:** v2.3 (Additional Streamlit enhancements)

---

**Made with ❤️ for the 3D printing community**

Last Updated: 2024
