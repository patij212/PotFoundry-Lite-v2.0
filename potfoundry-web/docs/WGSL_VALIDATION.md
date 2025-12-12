# WGSL Analyzer Guide

The WebGPU preview ships with a standalone WGSL shader (`pfui/preview/assets/pot_preview.wgsl`).
This guide explains how to run static analyzers locally and hook them into the existing
pytest helpers.

## Available Analyzers

The optional validator test (`tests/test_webgpu_assets.py::test_wgsl_static_validation`)
iterates over any of the following CLIs that are present in `PATH` and executes
`<binary> pot_preview.wgsl` for you:

| CLI             | Install Hint                                      | Notes |
|-----------------|---------------------------------------------------|-------|
| `wgsl_analyzer` | `cargo install wgsl_analyzer`                     | Fast static analyzer from the WGSL reference impl |
| `wgsl-analyzer` | `npm install -g wgsl-analyzer`                    | Node-based analyzer, mirrors VS Code language server |
| `naga`          | `cargo install naga-cli` or `brew install naga`   | Rust-based shader validation (used by gfx-rs) |
| `tint`          | `brew install tint` or download from Dawn builds  | Chrome/WebGPU reference compiler |

> ⚠️ Installations vary slightly per OS. The table lists the quickest
> approach for macOS/Linux; on Windows you can use the corresponding
> package managers (`winget`, `scoop`) or download prebuilt binaries.

## Running the Validators

1. Install any subset of the CLIs from the table above.
2. Export `PF_RUN_WEBGPU_VALIDATORS=1` before running pytest:

```powershell
# Windows PowerShell
$env:PF_RUN_WEBGPU_VALIDATORS = "1"
pytest tests/test_webgpu_assets.py -k wgsl
```

```bash
# macOS / Linux
export PF_RUN_WEBGPU_VALIDATORS=1
pytest tests/test_webgpu_assets.py -k wgsl
```

3. Each available analyzer will run once; missing binaries are skipped with
clear skip messages so CI logs stay readable.

## Manual Invocation

Use these commands when investigating shader failures outside of pytest:

```bash
wgsl_analyzer pfui/preview/assets/pot_preview.wgsl
naga validate pfui/preview/assets/pot_preview.wgsl
./tint pfui/preview/assets/pot_preview.wgsl
```

For `wgsl-analyzer` (with a hyphen), run:

```bash
wgsl-analyzer pfui/preview/assets/pot_preview.wgsl
```

All analyzers should exit with code `0` on success; non-zero exit codes
usually include human-readable diagnostics that point to the WGSL line
and column. Attach those logs when filing bug reports.
