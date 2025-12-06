"""Standalone Playwright debug probe for WebGPU preview debug API availability.

Generates debug outputs and artifacts to `artifacts/` for diagnosis of `buildCameraRig`
availability across fallback / WebGPU modes.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from time import perf_counter

from playwright.sync_api import sync_playwright

from pfui.preview import webgpu_core


def run_probe():
    html = webgpu_core.build_webgpu_html(
        {
            "top_radius_mm": 75.0,
            "bottom_radius_mm": 40.0,
            "height_mm": 90.0,
            "wall_thickness_mm": 3.0,
            "segments_theta": 96,
            "segments_z": 48,
            "style": "spiral",
            "style_options": {"turns": 3.0, "slope": 0.4},
        },
    )

    artifacts = Path("artifacts")
    artifacts.mkdir(exist_ok=True)

    with sync_playwright() as p:
        headful = os.getenv('PF_WEBGPU_HEADFUL') == '1'
        exec_path = os.getenv('PF_WEBGPU_CHROMIUM_EXECUTABLE')
        exec_channel = os.getenv('PF_WEBGPU_CHROMIUM_CHANNEL')
        # Prefer chrome channel in headful mode when not explicitly set
        if headful and not exec_path and not exec_channel:
            exec_channel = 'chrome'
        launch_args = [
            "--enable-unsafe-webgpu",
            "--enable-privileged-webgpu",
            "--enable-features=Vulkan,UseSkiaRendererWebGPU",
            "--ignore-gpu-blocklist",
            "--use-gl=egl",
        ]
        if exec_path:
            browser = p.chromium.launch(executable_path=exec_path, headless=not headful, args=launch_args)
        elif exec_channel:
            browser = p.chromium.launch(channel=exec_channel, headless=not headful, args=launch_args)
        else:
            browser = p.chromium.launch(headless=not headful, args=launch_args)
        page = browser.new_page()
        page.set_content(f"<html><body>{html}</body></html>", wait_until="networkidle")
        try:
            page.wait_for_function(
                "() => { const el = document.getElementById('wgpu-status'); if (!el) { return false; } return el.dataset.ready === '1' || (el.textContent || '').toLowerCase().includes('ready'); }",
                timeout=30_000,
            )
        except Exception:
            print("Status did not reach ready state; capturing artifacts and exiting")
            page.screenshot(path=str(artifacts / "playwright_probe_not_ready.png"))
            Path(artifacts / "playwright_probe_not_ready.html").write_text(page.content(), encoding="utf-8")
            browser.close()
            return

        page.wait_for_timeout(500)

        # Attach a simple message logger to capture postMessage events and diagnostics
        page.evaluate("() => { window.__pf_message_history = []; window.addEventListener('message', (e) => { try { console.log('MSG', JSON.stringify(e.data)); } catch (err) { console.log('MSG', e.data); } try { if (e.data && (e.data.type === 'params' || e.data.type === 'diagnostic')) { window.__pf_message_history.push(e.data); } } catch (err) {} }); }")
        # allow the page a bit to establish listeners
        page.wait_for_timeout(40)
        logged = []
        page.on("console", lambda msg: logged.append({"type": msg.type, "text": msg.text}))
        info = {}
        info['status_text'] = page.evaluate("() => { const el = document.getElementById('wgpu-status'); return el ? (el.textContent||'') : ''; }")
        info['launch_config'] = {
            'headful': headful,
            'exec_path': exec_path or None,
            'exec_channel': exec_channel or None,
        }
        info['has_debug_mount'] = page.evaluate("() => Boolean(window.__pf_webgpu_mounts && window.__pf_webgpu_mounts['pf-wgpu-default'])")
        info['has_debug_api'] = page.evaluate("() => Boolean(window.__pf_webgpu_mounts && window.__pf_webgpu_mounts['pf-wgpu-default'] && window.__pf_webgpu_mounts['pf-wgpu-default'].debug)")
        info['typeof_buildCameraRig_fn'] = page.evaluate("() => typeof (self['buildCameraRig'])")
        info['typeof_window_buildCameraRig_fn'] = page.evaluate("() => typeof (window['buildCameraRig'])")
        info['typeof_debug_buildCameraRig'] = page.evaluate("() => typeof (window.__pf_webgpu_mounts['pf-wgpu-default']?.debug?.buildCameraRig) || 'undefined'")
        info['debug_used_fallback'] = page.evaluate("() => window.__pf_webgpu_mounts['pf-wgpu-default']?.debug?.usedFallback ?? null")
        info['debug_ready'] = page.evaluate("() => Boolean(window.__pf_webgpu_mounts && window.__pf_webgpu_mounts['pf-wgpu-default'] && window.__pf_webgpu_mounts['pf-wgpu-default'].debug && window.__pf_webgpu_mounts['pf-wgpu-default'].debug.ready === true)")

        # If buildCameraRig is not ready, wait a bit and retry
        t0 = perf_counter()
        while info['typeof_buildCameraRig_fn'] != 'function' and perf_counter() - t0 < 5.0:
            page.wait_for_timeout(100)
            info['typeof_buildCameraRig_fn'] = page.evaluate("() => typeof (self['buildCameraRig'])")

        # Attempt to call debug.buildCameraRig
        try:
            result = page.evaluate("() => window.__pf_webgpu_mounts['pf-wgpu-default'].debug.buildCameraRig(1, 20, 10)")
        except Exception as exc:  # pragma: no cover - front-end runtime
            result = {"error": str(exc)}

        info['debug_call_result'] = result
        # Test sceneRadius updates via postMessage (replicate test_scene_radius_gating)
        info['initial_scene_radius'] = page.evaluate("() => window.__pf_webgpu_mounts['pf-wgpu-default'].debug.getState().sceneRadius")
        page.evaluate("() => window.postMessage({ type: 'params', target: 'pf-wgpu-default', payload: { height_mm: 1000 } }, '*');")
        page.wait_for_timeout(200)
        info['after_update_scene_radius_no_scene'] = page.evaluate("() => window.__pf_webgpu_mounts['pf-wgpu-default'].debug.getState().sceneRadius")
        page.evaluate("() => window.postMessage({ type: 'params', target: 'pf-wgpu-default', payload: { sceneRadius: 500 } }, '*');")
        # Wait/retry for up to 2.5s for the debug state to be updated
        t0 = perf_counter()
        with_scene_radius = None
        while perf_counter() - t0 < 2.5:
            page.wait_for_timeout(100)
            with_scene_radius = page.evaluate("() => window.__pf_webgpu_mounts['pf-wgpu-default'].debug.getState().sceneRadius")
            if with_scene_radius == 500:
                break
        info['with_scene_radius'] = with_scene_radius
        # Try a simple camera param update via rotX and confirm it is applied 
        info['initial_rotX'] = page.evaluate("() => window.__pf_webgpu_mounts['pf-wgpu-default'].debug.getState().rotX")
        page.evaluate("() => window.postMessage({ type: 'params', target: 'pf-wgpu-default', payload: { rotX: 0.5 } }, '*');")
        page.wait_for_timeout(200)
        info['after_update_rotX'] = page.evaluate("() => window.__pf_webgpu_mounts['pf-wgpu-default'].debug.getState().rotX")
        info['console_logs'] = logged
        info['debug_used_fallback'] = page.evaluate("() => window.__pf_webgpu_mounts['pf-wgpu-default']?.debug?.usedFallback ?? null")
        info['navigator_gpu_present'] = page.evaluate("() => typeof navigator.gpu !== 'undefined' && navigator.gpu !== null")
        info['lastApplyCameraPayload'] = page.evaluate("() => window.__pf_webgpu_mounts['pf-wgpu-default']?.debug?.lastApplyCameraPayload ?? null")
        info['lastSceneRadiusUpdate'] = page.evaluate("() => window.__pf_webgpu_mounts['pf-wgpu-default']?.debug?.lastSceneRadiusUpdate ?? null")
        info['message_history'] = page.evaluate("() => window.__pf_message_history || []")

        # Save artifacts
        screenshot_path = artifacts / "playwright_probe.png"
        html_path = artifacts / "playwright_probe.html"
        page.screenshot(path=str(screenshot_path))
        html_path.write_text(page.content(), encoding="utf-8")
        (artifacts / "playwright_probe.json").write_text(json.dumps(info, indent=2), encoding="utf-8")

        browser.close()
        print("Saved artifacts to:", artifacts)

if __name__ == '__main__':
    run_probe()
