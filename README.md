# 🏺 PotFoundry Lite v2.1

**Parametric, 3D-printable plant pots with a lightweight Streamlit UI.**

Generate beautiful, customizable flower pots with decorative patterns. Adjust dimensions and style, preview in your browser, and export production-ready STL files optimized for 3D printing.

[![Tests](https://img.shields.io/badge/tests-99%20passing-brightgreen)]()
[![Python](https://img.shields.io/badge/python-3.11%2B-blue)]()
[![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial-blue)]()

> **License & Commercial Use**
>
> - Free for **hobby, educational, and other noncommercial use** under the **PolyForm Noncommercial 1.0.0** license.
> - **Commercial use** (selling printed pots, bundling in paid software, use in for-profit business) **requires a commercial license** — see [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).

---

## ✨ Features

- **🎨 Five Artistic Styles** - Petal variations, spiral ridges, harmonic ripples, and more
- **⚡ Fast Binary STL Export** - 80% smaller files, 10x faster than ASCII
- **🔒 Watertight Meshes** - Production-ready geometry, every time
- **📐 Full Parametric Control** - Height, diameter, wall thickness, drainage, flare
- **🎯 Live 3D Preview** - Interactive Plotly visualization
- **📦 Batch Processing** - Generate multiple designs from YAML config
- **📚 Public Library Publishing** - Share designs with the community (optional, requires Supabase)
- **🔗 Deep Link Sharing** - Share and restore designs via URL
- **✅ Comprehensive Testing** - 99 tests, 100% pass rate, golden mesh regression, performance benchmarks
- **🧹 High Code Quality** - Type hints, docstrings, LLM-friendly architecture

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

# Create virtual environment (recommended)
python -m venv .venv
source .venv/bin/activate  # On Windows: .\.venv\Scripts\Activate.ps1

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

# Generate mesh
r_outer_fn, _ = STYLES["SuperformulaBlossom"]
verts, faces, diag = build_pot_mesh(
    H=120, Rt=70, Rb=50,
    t_wall=3, t_bottom=3, r_drain=8,
    expn=1.1, n_theta=168, n_z=84,
    r_outer_fn=r_outer_fn,
    style_opts={"a": 1.0, "b": 1.0, "m": 5, "n1": 2, "n2": 7, "n3": 7}
)

# Export to STL (binary format - recommended)
write_stl_binary("my_pot.stl", "FlowerPot", verts, faces)
print(f"Generated {len(faces)} triangles")
```

### Batch Processing

Create a YAML config file and process multiple designs:

```bash
python -m potfoundry.yaml_api config.yaml
```

See example configs in the documentation.

---

## 📁 Project Structure

```
PotFoundry-Lite-v2.0/
├── app.py                      # Streamlit UI entry point
├── potfoundry/                 # Core library (UI-agnostic)
│   ├── __init__.py            # Public API with __version__
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
├── tests/                     # Test suite (99 tests)
│   ├── test_performance.py    # Performance benchmarks
│   ├── test_golden_meshes.py  # Regression tests
│   └── ...
├── docs/
│   ├── ARCHITECTURE.md        # System design guide
│   ├── CODE_QUALITY_GUIDE.md  # LLM-friendly coding standards
│   ├── DEVELOPMENT.md         # Developer workflows
│   └── ROADMAP.md             # Future Qt desktop app plan
├── CHANGELOG.md               # Version history
└── requirements.txt
```

---

## 📚 Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design, module organization, and technical overview
- **[CODE_QUALITY_GUIDE.md](CODE_QUALITY_GUIDE.md)** - Coding standards, testing, and best practices
- **[DEVELOPMENT.md](DEVELOPMENT.md)** - Setup, workflows, testing, and contribution guidelines
- **[ROADMAP.md](ROADMAP.md)** - Future plans for Qt desktop app (v2.5-v3.0)
- **[STL_EXPORT_GUIDE.md](STL_EXPORT_GUIDE.md)** - Binary STL migration guide
- **[CHANGELOG.md](CHANGELOG.md)** - Complete version history

---

## 🎨 Available Styles

1. **SuperformulaBlossom** - Petal-like variations using superformula
2. **FourierBloom** - Organic shapes with Fourier series
3. **SpiralRidges** - Helical patterns with ridge variations
4. **SuperellipseMorph** - Smooth, rounded superellipse shapes
5. **HarmonicRipple** - Wave-like ripples with harmonic frequencies

Each style has customizable parameters for unique designs.

---

## 🧪 Testing

```bash
# Install test dependencies
pip install pytest pytest-cov

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

### Performance Targets (All Met ✅)

- Typical mesh (168×84): **132ms** (target: <200ms)
- Binary STL export: **15ms** (target: <100ms)
- End-to-end workflow: **144ms** (target: <500ms)

---

## 🛠️ Development

### Code Quality

```bash
# Run linting
ruff check .

# Auto-fix issues
ruff check . --fix

# Run pre-commit hooks
pre-commit run --all-files
```

### Contributing

Pull requests are welcome! Please:

1. Follow the [CODE_QUALITY_GUIDE.md](CODE_QUALITY_GUIDE.md)
2. Add tests for new functionality
3. Ensure all tests pass: `pytest -v`
4. Run linting: `ruff check .`
5. Update documentation as needed

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed guidelines.

---

## 🚀 Future Vision

### v2.1 (Current)
- ✅ Code quality improvements
- ✅ Bug fixes and stability
- ✅ Version management
- ✅ Comprehensive documentation

### v2.2-v2.5 (Near-term)
- Enhanced Streamlit UI with better error messages
- Real-time validation feedback
- Improved preset management
- Better batch processing UX
- Qt desktop prototype

### v3.0 (Long-term)
- Full Qt desktop application
- Multi-threading support
- VTK-powered 3D preview
- PyInstaller packaging
- Production release

See [ROADMAP.md](ROADMAP.md) for detailed evolution plan.

---

## 📊 Performance

All performance targets exceeded:

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Typical mesh generation | <200ms | 132ms | ✅ |
| Low-res mesh | <50ms | 18ms | ✅ |
| High-res mesh | <1000ms | 519ms | ✅ |
| Binary STL export | <100ms | 15ms | ✅ |
| End-to-end workflow | <500ms | 144ms | ✅ |

---

## 📈 Project Status

**Current Version:** v2.1.0  
**Status:** Production-ready  
**Test Coverage:** 99 tests (100% pass)  
**Performance:** All targets met ✅  
**Documentation:** Comprehensive ✅  
**Next Version:** v2.2 (Streamlit enhancements)

---

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/patij212/PotFoundry-Lite-v2.0/issues)
- **Discussions:** [GitHub Discussions](https://github.com/patij212/PotFoundry-Lite-v2.0/discussions)

---

## 🔒 License

- **Noncommercial:** [PolyForm Noncommercial 1.0.0](LICENSE)
- **Commercial:** See [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md) for commercial licensing options

---

## 🙏 Acknowledgments

- Built with [Streamlit](https://streamlit.io/), [NumPy](https://numpy.org/), and [Plotly](https://plotly.com/)
- Inspired by the 3D printing and parametric design community
- Developed with assistance from GitHub Copilot

---

**Made with ❤️ for the 3D printing community**

Last Updated: December 2024

```

---

## Run the App
```bash
streamlit run app.py
```

Streamlit will open a browser tab (usually at `http://localhost:8501`).  
If prompted, allow local network access.

**Common actions**
- Adjust sliders/inputs for dimensions and style.
- Click **Generate/Update** to refresh the preview (if applicable).
- Use **Export** to download the mesh (e.g., STL).

---

## Project Layout
```text
.
├─ app.py                # Streamlit entrypoint
├─ potfoundry/           # Core code (geometry, helpers, etc.)
│  ├─ __init__.py
│  └─ ...                # modules
├─ requirements.txt
├─ .streamlit/           # (optional) Streamlit theme/config
└─ tests/                # (optional) tests (pytest)
```

---

## Configuration

### Streamlit settings
If you have `.streamlit/config.toml`, it controls theme, fonts, layout, and server behavior:
```toml
# .streamlit/config.toml
[theme]
base = "light"
primaryColor = "#6f42c1"

[server]
headless = true
```

### Environment tweaks
Set these before running `streamlit run app.py`:

**Linux/macOS**
```bash
export STREAMLIT_SERVER_PORT=8501
```

**Windows (persist for new shells)**
```powershell
setx STREAMLIT_SERVER_PORT 8501
```

---

## Tips & Troubleshooting

**Virtualenv not activating on Windows**  
If `Activate.ps1` is blocked:
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```
Then activate again.

**Streamlit prints giant “object dumps”**  
Avoid printing large objects/components directly; prefer concise `st.write()` or proper visual components.

**Performance feels slow**  
Lower mesh resolution while iterating (reduce angular/height samples). Raise for final export.

**Port already in use**
```bash
streamlit run app.py --server.port 8502
```

**Firewall prompts**  
Allow local network access when prompted; the app serves a local webpage.

---

## Developing

**Run tests (if `tests/` exists)**
```bash
pip install pytest
pytest -q
```

**Lint & style (optional)**
```bash
pip install ruff
ruff check .
ruff check . --fix
```

Guidelines:
- Keep UI logic in `app.py`; put geometry/math in `potfoundry/`.
- Prefer small, pure functions with explicit parameters.
- Add focused tests for new geometry/utilities.

---

## Contributing
Pull requests are welcome! For UI changes, include a short screen recording or screenshots.

**PR checklist**
- [ ] App runs locally: `streamlit run app.py`
- [ ] (If applicable) tests pass: `pytest`
- [ ] Code linted: `ruff check .`
- [ ] README updated if features change

---

## Roadmap
- Binary STL export by default (keep ASCII as debug).
- Clear separation between **core geometry** and **UI**.
- Additional parametric styles with presets.
- Optional desktop app (Qt/VTK) for GPU-accelerated previews.

> Ideas welcome—open an issue with a brief rationale and (if possible) a sketch/mockup.

---

## License
**Noncommercial:** PolyForm Noncommercial 1.0.0 (to be added as `LICENSE`).  
**Commercial:** Requires a paid commercial license (to be added as `COMMERCIAL-LICENSE.md`).











