# 🏺 PotFoundry-Lite v2.0

Parametric, 3D-printable plant pots with a lightweight Streamlit UI. Adjust dimensions and style, preview in your browser, and export meshes ready for slicing.

> **License & Commercial Use**
>
> - Free for **hobby, educational, and other noncommercial use** under the **PolyForm Noncommercial 1.0.0** license.
> - **Commercial use** (e.g., selling printed pots, bundling in paid software/services, or use within a for-profit business) **requires a commercial license** — see `COMMERCIAL-LICENSE.md` (to be added).

---

## Contents
- [Features](#features)
- [Quick Start](#quick-start)
- [Run the App](#run-the-app)
- [Project Layout](#project-layout)
- [Configuration](#configuration)
- [Tips & Troubleshooting](#tips--troubleshooting)
- [Developing](#developing)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [License](#license)

---

## Features
- **Browser UI (Streamlit):** tweak size/shape parameters with live feedback.
- **Deterministic meshes:** stable, repeatable results for consistent prints.
- **Simple install:** standard Python + `requirements.txt`.
- **Testable core:** optional `tests/` folder for smoke/unit tests.

> Typical controls include: height, top/bottom diameter, wall thickness, bottom thickness, and style-specific options.

---

## Quick Start

### 1) Requirements
- Python **3.9+** (3.11+ recommended)
- Recent **pip** (23+ recommended)

### 2) Create & activate a virtual environment

**macOS / Linux**
```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
```

**Windows (PowerShell)**
```powershell
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
python -m pip install -U pip
```

### 3) Install dependencies
```bash
pip install -r requirements.txt
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











