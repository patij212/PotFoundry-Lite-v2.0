"""Core utilities to build the WebGPU preview HTML blob.
This module isolates WGSL + JS construction from Streamlit tab code so the
WebGPU path stays modular, maintainable, and testable.
"""
from __future__ import annotations

import base64
import json
from functools import cache
from pathlib import Path

_ASSET_DIR = Path(__file__).with_name("assets")


def _cache_key(filename: str) -> tuple[str, int]:
    path = _ASSET_DIR / filename
    try:
        mtime = path.stat().st_mtime_ns
    except FileNotFoundError as exc:
        raise RuntimeError(f"Missing WebGPU asset: {path}") from exc
    return filename, mtime


@cache
def _load_asset_text_cached(filename: str, mtime_ns: int) -> str:
    path = _ASSET_DIR / filename
    data = path.read_text(encoding="utf-8")
    return data.replace("\r\n", "\n").replace("\r", "\n")


def _load_asset_text(filename: str) -> str:
    cache_key = _cache_key(filename)
    return _load_asset_text_cached(*cache_key)


def _encode_params(params: dict) -> str:
    return json.dumps(params or {}, separators=(",", ":"))


def build_webgpu_mount_html(
    component_id: str,
    params: dict,
    *,
    height_px: int = 600,
    background_color: str = "#242B46",
    canvas_id: str = "wgpu-canvas",
) -> str:
    wgsl_source = _load_asset_text("pot_preview.wgsl")
    wgsl_b64 = base64.b64encode(wgsl_source.encode("utf-8")).decode("ascii")

    js_template = _load_asset_text("webgpu_preview.js")
    js = js_template.replace("%WGSL_B64%", wgsl_b64)

    shell_style = (
        f"width:100%;height:{int(height_px)}px;background:{background_color};border-radius:10px;overflow:hidden;"
        "position:relative;box-shadow:0 8px 24px rgba(0,0,0,0.35);"
    )
    controls_button_style = (
        "background:rgba(18,21,30,0.75);color:#f5f6f8;border:1px solid rgba(255,255,255,0.15);"
        "border-radius:4px;padding:4px 8px;font:11px/1.4 'Inter',system-ui;cursor:pointer;"
        "transition:background 120ms ease;border:0;"
    )
    html: list[str] = []
    html.append(f'<div class="pf-wgpu-shell" data-pf-wgpu-id="{component_id}" style="{shell_style}">')
    canvas_dom_id = canvas_id or "wgpu-canvas"
    html.append(
        f'<canvas id="{canvas_dom_id}" data-pf-wgpu-id="{component_id}" '
        'style="position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;pointer-events:auto;"></canvas>',
    )
    html.append(
        '<div id="wgpu-status" '
        'style="position:absolute;top:10px;left:10px;color:#e6edf3;padding:6px 8px;font:12px/1.3 system-ui;'
        'background:rgba(8,11,18,0.65);backdrop-filter:blur(8px);border-radius:6px;pointer-events:none;z-index:3;">'
        "Initializing WebGPU preview..."
        "</div>",
    )
    html.append(
        '<div id="wgpu-controls" '
        'style="position:absolute;top:10px;right:10px;display:flex;gap:6px;flex-wrap:wrap;z-index:4;">'
        f'<button data-wgpu-view="fit" style="{controls_button_style}">Fit</button>'
        f'<button data-wgpu-view="iso" style="{controls_button_style}">Iso</button>'
        f'<button data-wgpu-view="top" style="{controls_button_style}">Top</button>'
        f'<button data-wgpu-view="front" style="{controls_button_style}">Front</button>'
        f'<button data-wgpu-view="right" style="{controls_button_style}">Right</button>'
        f'<button id="wgpu-toggle-autorotate" data-role="autorotate" style="{controls_button_style}">Auto</button>'
        f'<button id="wgpu-toggle-pivot" data-wgpu-action="pivot-auto" style="{controls_button_style}">Pivot</button>'
        f'<button id="wgpu-toggle-projection" data-wgpu-action="projection" style="{controls_button_style}">Ortho</button>'
        f'<button id="wgpu-toggle-debug" data-wgpu-action="debug" style="{controls_button_style}">Debug</button>'
        f'<button id="wgpu-toggle-grid" data-wgpu-action="grid" style="{controls_button_style}">Grid</button>'
        f'<button id="wgpu-toggle-arcball" data-wgpu-action="arcball" style="{controls_button_style}">Arc</button>'
        '</div>',
    )
    html.append(
        '<div id="wgpu-hint" style="position:absolute;bottom:10px;left:10px;color:#c9d1d9;font:11px/1.4 system-ui;'
        'padding:4px 6px;border-radius:4px;background:rgba(8,11,18,0.45);pointer-events:none;z-index:3;">'
        'Drag = orbit • Right/Alt drag = pan • Scroll = zoom'
        '</div>',
    )
    js_b64 = base64.b64encode(js.encode("utf-8")).decode("ascii")
    html.append('<script type="module">')
    html.append("const shell = document.currentScript?.parentElement;")
    html.append(f'const mountId = "{component_id}";')
    html.append("window.__pf_webgpu_mounts = window.__pf_webgpu_mounts || {};")
    html.append("if (!window.__pf_webgpu_mounts[mountId]) {")
    html.append("window.__pf_webgpu_mounts[mountId] = { mounted: false };")
    html.append("} else { window.__pf_webgpu_mounts[mountId].mounted = false; }")
    html.append("window.__pf_initialParams = " + _encode_params(params) + ";")
    html.append(f'const js_b64 = "{js_b64}";')
    html.append("const code = atob(js_b64);")
    html.append('const blob = new Blob([code], { type: "application/javascript" });')
    html.append("const url = URL.createObjectURL(blob);")
    html.append('const script = document.createElement("script");')
    html.append('script.type = "module";')
    html.append("script.src = url;")
    html.append("const paramsPayload = window.__pf_initialParams;")
    html.append('const notifyParams = () => { window.postMessage({ type: "params", target: mountId, payload: paramsPayload }, "*"); };')
    html.append('const notifyDiagnostic = (reason) => { window.postMessage({ type: "diagnostic", target: mountId, payload: { message: "WebGPU bootstrap script failed", detail: { reason } } }, "*"); };')
    html.append('script.addEventListener("load", () => { window.__pf_webgpu_mounts[mountId].mounted = true; notifyParams(); });')
    html.append('script.addEventListener("error", (event) => { console.error("WebGPU bootstrap script failed", event); notifyDiagnostic(event?.message || event?.error?.message || "load-error"); });')
    html.append("(shell ?? document.body).appendChild(script);")
    html.append("</script>")
    html.append("</div>")
    return "".join(html)


def build_webgpu_param_script(component_id: str, params: dict) -> str:
    payload = _encode_params(params)
    script = (
        "<script>(function(){"
        f"const payload = {payload};"
        f"window.postMessage({{type:'params',target:'{component_id}',payload}},'*');"
        "})();</script>"
    )
    return script


def build_webgpu_html(
    params: dict,
    *,
    height_px: int = 600,
    background_color: str = "#242B46",
    component_id: str = "pf-wgpu-default",
    canvas_id: str = "wgpu-canvas",
) -> str:
    return build_webgpu_mount_html(
        component_id,
        params,
        height_px=height_px,
        background_color=background_color,
        canvas_id=canvas_id,
    )
