# WebGPU Streamlit Component

This package hosts the custom Streamlit component that renders the PotFoundry WebGPU canvas. It replaces the legacy HTML injection path by embedding a React/TypeScript frontend that mounts the WebGPU renderer once and communicates with the Python host through the Streamlit component API.

## Development

```powershell
cd pfui\components\webgpu_component\frontend
npm install
npm run dev
```

During development, configure the Python wrapper to load the dev server URL (http://localhost:4173). The component automatically reconnects on hot reloads.

## Production Build

```powershell
cd pfui\components\webgpu_component\frontend
npm run build
```

The build command creates `frontend/build` and copies the bundle into `pfui/components/webgpu_component/frontend_build`, which the Python wrapper serves at runtime.

## File Layout

- `frontend/`: Vite + React + TypeScript source.
- `frontend_build/`: Generated static assets (committed for deployment).
- `__init__.py`: Streamlit component declaration and Python helper API.
- `_schema.py`: Runtime validation for component props and event payloads.

Refer to `pfui/tabs/interactive/preview_impl.py` for how the component integrates with the Streamlit UI layer.
