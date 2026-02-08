"""Optional Playwright smoke test for the WebGPU preview iframe.

Enable by setting the environment variable `PF_RUN_WEBGPU_PLAYWRIGHT=1` before
running pytest. The test requires Playwright with Chromium support and launches
Chrome with WebGPU enabled to render the pot preview, then samples pixels to
confirm that a frame is produced.
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest

try:
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - optional dependency
    sync_playwright = None  # type: ignore[assignment]

from pfui.preview import webgpu_core

ASSET_DIR = Path(__file__).resolve().parent.parent / "pfui" / "preview" / "assets"


@pytest.mark.optionalhook
@pytest.mark.skipif(os.getenv("PF_RUN_WEBGPU_PLAYWRIGHT") != "1", reason="Set PF_RUN_WEBGPU_PLAYWRIGHT=1 to enable WebGPU smoke test")
def test_webgpu_preview_renders() -> None:
    """Launch the WebGPU preview in a headless browser and sample the canvas."""
    playwright_entry = sync_playwright
    if playwright_entry is None:
        pytest.skip("Playwright not installed; run `pip install playwright` and `playwright install chromium`")
        return

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

    with playwright_entry() as p:
        headful = os.getenv('PF_WEBGPU_HEADFUL') == '1'
        # Allow overriding Chromium executable or channel via environment variables
        exec_path = os.getenv('PF_WEBGPU_CHROMIUM_EXECUTABLE')
        exec_channel = os.getenv('PF_WEBGPU_CHROMIUM_CHANNEL')
        # If headful mode is requested, prefer Chrome channel by default when not explicitly set.
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
        # After launching we will validate presence after creating a page
        page = browser.new_page()
        logged = []
        page.on("console", lambda msg: logged.append({"type": msg.type, "text": msg.text}))
        page.set_content(f"<html><body>{html}</body></html>", wait_until="networkidle")
        gpu_present = page.evaluate("() => Boolean(typeof navigator.gpu !== 'undefined' && navigator.gpu !== null)")
        if not gpu_present:
            browser.close()
            pytest.skip("WebGPU not available in this environment; skipping test to avoid fallback.")
        gpu_present = page.evaluate("() => Boolean(typeof navigator.gpu !== 'undefined' && navigator.gpu !== null)")
        if not gpu_present:
            browser.close()
            pytest.skip("WebGPU not available in this environment; skipping test to avoid fallback.")
        # verify WebGPU presence and skip if not available (avoid fallback)
        gpu_present = page.evaluate("() => Boolean(typeof navigator.gpu !== 'undefined' && navigator.gpu !== null)")
        if not gpu_present:
            browser.close()
            pytest.skip("WebGPU not available in this environment; skipping test to avoid fallback.")

        # Some Playwright/Chromium builds do not expose navigator.gpu in
        # headless mode. If the preview immediately reports "WebGPU not
        # supported", retry once in headful mode to increase coverage on
        # developer machines where a headful browser provides WebGPU.
        status_text = page.evaluate("() => { const el = document.getElementById('wgpu-status'); return el ? (el.textContent||'') : ''; }")
        if status_text and status_text.lower().strip().startswith("webgpu not supported"):
            browser.close()
            browser = p.chromium.launch(
                headless=True if os.getenv('PF_WEBGPU_HEADFUL') != '1' else False,
                args=[
                    "--enable-unsafe-webgpu",
                    "--enable-privileged-webgpu",
                    "--enable-features=Vulkan,UseSkiaRendererWebGPU",
                    "--ignore-gpu-blocklist",
                    "--use-gl=egl",
                ],
            )  # retry in headful mode
            page = browser.new_page()
            page.set_content(f"<html><body>{html}</body></html>", wait_until="networkidle")

        # Ensure navigator.gpu is present; if not, try headful; otherwise skip the test
        gpu_present = page.evaluate("() => Boolean(typeof navigator.gpu !== 'undefined' && navigator.gpu !== null)")
        if not gpu_present and not headful:
            browser.close()
            browser = p.chromium.launch(
                headless=False,
                args=[
                    "--enable-unsafe-webgpu",
                    "--enable-privileged-webgpu",
                    "--enable-features=Vulkan,UseSkiaRendererWebGPU",
                    "--ignore-gpu-blocklist",
                    "--use-gl=egl",
                ],
            )
            page = browser.new_page()
            page.set_content(f"<html><body>{html}</body></html>", wait_until="networkidle")
            gpu_present = page.evaluate("() => Boolean(typeof navigator.gpu !== 'undefined' && navigator.gpu !== null)")
        if not gpu_present:
            browser.close()
            pytest.skip("Navigator.gpu not available in this environment; set up a WebGPU-capable Chromium to run this test.")
        try:
            page.wait_for_function(
                "() => { const el = document.getElementById('wgpu-status'); if (!el) { return false; } return el.dataset.ready === '1' || (el.textContent || '').toLowerCase().includes('ready'); }",
                timeout=30_000,
            )
        except PlaywrightTimeoutError as exc:
            # Capture debug artifacts for diagnosis
            try:
                screenshot_path = Path("artifacts") / "playwright_wgpu.png"
                page.screenshot(path=str(screenshot_path))
                html_path = Path("artifacts") / "playwright_wgpu.html"
                html = page.content()
                html_path.write_text(html, encoding="utf-8")
                log_path = Path("artifacts") / "playwright_wgpu_console.log"
                log_path.write_text('\n'.join([str(x) for x in logged]), encoding="utf-8")
            except Exception:
                # Best-effort; ignore failures creating artifacts
                pass
            browser.close()
            raise AssertionError("WebGPU preview did not reach ready state in time; saved artifacts to artifacts/") from exc

        # Wait for WebGPU draw commands to run and canvas to present.
        page.wait_for_timeout(250)
        # Ensure we're running the WebGPU path (not fallback)
        debug_used_fallback = page.evaluate(
            "() => { const v = Object.values(window.__pf_webgpu_mounts || {})[0]; return v && v.debug && !!v.debug.usedFallback; }",
        )
        assert debug_used_fallback is False, "Preview used fallback; expected WebGPU path for this test"
        # Ensure this preview is using the WebGPU path (not fallback)
        debug_used_fallback = page.evaluate(
            "() => { const v = Object.values(window.__pf_webgpu_mounts || {})[0]; return v && v.debug && !!v.debug.usedFallback; }",
        )
        assert debug_used_fallback is False, "Preview used fallback; expected WebGPU path for this test"
        page.wait_for_function(
            "() => (typeof window['buildCameraRig'] === 'function') || (Boolean(window.__pf_webgpu_mounts && window.__pf_webgpu_mounts['pf-wgpu-default'] && window.__pf_webgpu_mounts['pf-wgpu-default'].debug && window.__pf_webgpu_mounts['pf-wgpu-default'].debug.ready === true))",
            timeout=10_000,
        )
        # Ensure the loaded preview used the WebGPU path, not the fallback
        debug_used_fallback = page.evaluate(
            "() => { const v = Object.values(window.__pf_webgpu_mounts || {})[0]; return v && v.debug && !!v.debug.usedFallback; }",
        )
        assert debug_used_fallback is False, "Preview used fallback; expected WebGPU path for this test"
        # Wait for the debug API to publish `ready` (set once `buildCameraRig` is exported)
        page.wait_for_function(
            "() => (typeof window['buildCameraRig'] === 'function') || (Boolean(window.__pf_webgpu_mounts && window.__pf_webgpu_mounts['pf-wgpu-default'] && window.__pf_webgpu_mounts['pf-wgpu-default'].debug && window.__pf_webgpu_mounts['pf-wgpu-default'].debug.ready === true))",
            timeout=10_000,
        )
        pixel_data = page.evaluate(
            "() => {\n                const canvas = document.getElementById('wgpu-canvas');\n                if (!canvas) { return null; }\n                const ctx = canvas.getContext('2d');\n                if (!ctx) {\n                    const offscreen = document.createElement('canvas');\n                    offscreen.width = canvas.width;\n                    offscreen.height = canvas.height;\n                    const offCtx = offscreen.getContext('2d');\n                    const gl = canvas.getContext('webgl2');\n                    if (!gl || !offCtx) { return null; }\n                    const pixels = new Uint8Array(canvas.width * canvas.height * 4);\n                    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);\n                    offCtx.putImageData(new ImageData(pixels, canvas.width, canvas.height), 0, 0);\n                    return offscreen.toDataURL();\n                }\n                return ctx.getImageData(0, 0, 1, 1).data;\n            }",
        )

        # Save console logs even on success
        try:
            log_path = Path("artifacts") / "playwright_wgpu_console.log"
            log_path.write_text('\n'.join([str(x) for x in logged]), encoding="utf-8")
        except Exception:
            pass
        browser.close()

    assert pixel_data, "No pixel data captured from WebGPU canvas"
    if isinstance(pixel_data, list):
        assert any(channel != pixel_data[3] for channel in pixel_data[:3]), "Alpha-only pixel data detected"


@pytest.mark.skipif(os.getenv("PF_RUN_WEBGPU_PLAYWRIGHT") != "1", reason="Set PF_RUN_WEBGPU_PLAYWRIGHT=1 to enable WebGPU smoke test")
def test_build_camera_rig_math() -> None:
    """Verify per-axis camera fit math: dV and dH behave as expected for changes in extents."""
    playwright_entry = sync_playwright
    if playwright_entry is None:
        pytest.skip("Playwright not installed; run `pip install playwright` and `playwright install chromium`")
        return

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

    with playwright_entry() as p:
        headful = os.getenv('PF_WEBGPU_HEADFUL') == '1'
        exec_path = os.getenv('PF_WEBGPU_CHROMIUM_EXECUTABLE')
        exec_channel = os.getenv('PF_WEBGPU_CHROMIUM_CHANNEL')
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
        logged = []
        page.on("console", lambda msg: logged.append({"type": msg.type, "text": msg.text}))
        page.set_content(f"<html><body>{html}</body></html>", wait_until="networkidle")
        try:
            page.wait_for_function(
            "() => { const el = document.getElementById('wgpu-status'); if (!el) { return false; } return el.dataset.ready === '1' || (el.textContent || '').toLowerCase().includes('ready'); }",
            timeout=30_000,
        )
        except Exception as exc:
            try:
                log_path = Path("artifacts") / "playwright_build_camera_rig_math_console.log"
                log_path.write_text('\n'.join([str(x) for x in logged]), encoding="utf-8")
            except Exception:
                pass
            browser.close()
            raise
        page.wait_for_timeout(250)
        page.wait_for_function(
            "() => (typeof window['buildCameraRig'] === 'function') || (Boolean(window.__pf_webgpu_mounts && window.__pf_webgpu_mounts['pf-wgpu-default'] && window.__pf_webgpu_mounts['pf-wgpu-default'].debug && window.__pf_webgpu_mounts['pf-wgpu-default'].debug.ready === true))",
            timeout=10_000,
        )

        # Call debug API: compute with baseline padded widths
        baseline = page.evaluate(
            "() => { return window.__pf_webgpu_mounts['pf-wgpu-default'].debug.buildCameraRig(1, 20, 10); }",
        )
        taller = page.evaluate(
            "() => { return window.__pf_webgpu_mounts['pf-wgpu-default'].debug.buildCameraRig(1, 20, 40); }",
        )
        wider = page.evaluate(
            "() => { return window.__pf_webgpu_mounts['pf-wgpu-default'].debug.buildCameraRig(1, 60, 10); }",
        )
        # Persist logs
        try:
            log_path = Path("artifacts") / "playwright_build_camera_rig_math_console.log"
            log_path.write_text('\n'.join([str(x) for x in logged]), encoding="utf-8")
        except Exception:
            pass
        browser.close()

    assert baseline and taller and wider, "Debug camera rig wrapper did not return results"
    # Expect vertical extent increase increases dV
    assert taller.get("dV", 0) > baseline.get("dV", 0)
    # Expect horizontal extent increase increases dH
    assert wider.get("dH", 0) > baseline.get("dH", 0)
    # Chosen distance should equal max(dV, dH) approximately
    chosen = baseline.get("chosenDistance", 0)
    assert abs(chosen - max(baseline.get("dV", 0), baseline.get("dH", 0))) < 1e-3


@pytest.mark.skipif(os.getenv("PF_RUN_WEBGPU_PLAYWRIGHT") != "1", reason="Set PF_RUN_WEBGPU_PLAYWRIGHT=1 to enable WebGPU smoke test")
def test_scene_radius_gating() -> None:
    """Verify that when a sceneRadius is not provided the camera does not auto-update, and does when provided."""
    playwright_entry = sync_playwright
    if playwright_entry is None:
        pytest.skip("Playwright not installed; run `pip install playwright` and `playwright install chromium`")
        return

    html = webgpu_core.build_webgpu_html(
        {
            "top_radius_mm": 75.0,
            "bottom_radius_mm": 40.0,
            "height_mm": 90.0,
            "wall_thickness_mm": 3.0,
        },
    )

    with playwright_entry() as p:
        headful = os.getenv('PF_WEBGPU_HEADFUL') == '1'
        exec_path = os.getenv('PF_WEBGPU_CHROMIUM_EXECUTABLE')
        exec_channel = os.getenv('PF_WEBGPU_CHROMIUM_CHANNEL')
        launch_args = ["--enable-unsafe-webgpu", "--enable-privileged-webgpu", "--enable-features=Vulkan,UseSkiaRendererWebGPU"]
        if exec_path:
            browser = p.chromium.launch(executable_path=exec_path, headless=not headful, args=launch_args)
        elif exec_channel:
            browser = p.chromium.launch(channel=exec_channel, headless=not headful, args=launch_args)
        else:
            browser = p.chromium.launch(headless=not headful, args=launch_args)
        page = browser.new_page()
        logged = []
        page.on("console", lambda msg: logged.append({"type": msg.type, "text": msg.text}))
        page.set_content(f"<html><body>{html}</body></html>", wait_until="networkidle")
        try:
            page.wait_for_function(
            "() => { const el = document.getElementById('wgpu-status'); if (!el) { return false; } return el.dataset.ready === '1' || (el.textContent || '').toLowerCase().includes('ready'); }",
            timeout=30_000,
        )
        except Exception as exc:
            try:
                log_path = Path("artifacts") / "playwright_scene_radius_gating_console.log"
                log_path.write_text('\n'.join([str(x) for x in logged]), encoding="utf-8")
            except Exception:
                pass
            browser.close()
            raise
        page.wait_for_timeout(250)

        initial_scene_radius = page.evaluate("() => window.__pf_webgpu_mounts['pf-wgpu-default'].debug.getState().sceneRadius")
        # Send a params update that increases height but does not set sceneRadius:
        page.evaluate("() => window.postMessage({ type: 'params', target: 'pf-wgpu-default', payload: { height_mm: 1000 } }, '*');")
        page.wait_for_timeout(200)
        after_update_scene_radius = page.evaluate("() => window.__pf_webgpu_mounts['pf-wgpu-default'].debug.getState().sceneRadius")
        # Without sceneRadius provided, the state should remain unchanged
        assert initial_scene_radius == after_update_scene_radius

        # Now send a params update that includes sceneRadius explicitly
        page.evaluate("() => window.postMessage({ type: 'params', target: 'pf-wgpu-default', payload: { sceneRadius: 500 } }, '*');")
        # Give the message handler more time in slower environments; poll up to 2.5s
        page.wait_for_timeout(200)
        t0 = page.evaluate("() => performance.now()")
        with_scene_radius = None
        deadline = t0 + 2500
        while page.evaluate("() => performance.now()") < deadline:
            with_scene_radius = page.evaluate("() => window.__pf_webgpu_mounts['pf-wgpu-default'].debug.getState().sceneRadius")
            if with_scene_radius == 500:
                break
            page.wait_for_timeout(100)
        # Verify message handler recorded a lastSceneRadiusUpdate
        last_scene_update = page.evaluate("() => window.__pf_webgpu_mounts['pf-wgpu-default'].debug.lastSceneRadiusUpdate")
        if isinstance(last_scene_update, dict):
            assert last_scene_update.get('next') == 500
        else:
            assert last_scene_update == 500
        # Persist logs
        try:
            log_path = Path("artifacts") / "playwright_scene_radius_gating_console.log"
            log_path.write_text('\n'.join([str(x) for x in logged]), encoding="utf-8")
        except Exception:
            pass
        browser.close()

    assert with_scene_radius == 500


@pytest.mark.skipif(os.getenv("PF_RUN_WEBGPU_PLAYWRIGHT") != "1", reason="Set PF_RUN_WEBGPU_PLAYWRIGHT=1 to enable WebGPU smoke test")
def test_drag_and_release_retains_camera_state() -> None:
    """Verify that dragging the canvas and releasing does not cause host to reset the camera to defaults."""
    playwright_entry = sync_playwright
    if playwright_entry is None:
        pytest.skip("Playwright not installed; run `pip install playwright` and `playwright install chromium`")
        return

    html = webgpu_core.build_webgpu_html(
        {
            "top_radius_mm": 75.0,
            "bottom_radius_mm": 40.0,
            "height_mm": 90.0,
            "wall_thickness_mm": 3.0,
        },
    )

    with playwright_entry() as p:
        headful = os.getenv('PF_WEBGPU_HEADFUL') == '1'
        exec_path = os.getenv('PF_WEBGPU_CHROMIUM_EXECUTABLE')
        exec_channel = os.getenv('PF_WEBGPU_CHROMIUM_CHANNEL')
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
        logged = []
        page.on("console", lambda msg: logged.append({"type": msg.type, "text": msg.text}))
        page.set_content(f"<html><body>{html}</body></html>", wait_until="networkidle")
        gpu_present = page.evaluate("() => Boolean(typeof navigator.gpu !== 'undefined' && navigator.gpu !== null)")
        if not gpu_present:
            browser.close()
            pytest.skip("WebGPU not available in this environment; skipping test to avoid fallback.")
        page.wait_for_function(
            "() => { const el = document.getElementById('wgpu-status'); if (!el) { return false; } return el.dataset.ready === '1' || (el.textContent || '').toLowerCase().includes('ready'); }",
            timeout=30_000,
        )
        # Wait until debug API is ready
        page.wait_for_function(
            "() => Boolean(window.__pf_webgpu_mounts && window.__pf_webgpu_mounts['pf-wgpu-default'] && window.__pf_webgpu_mounts['pf-wgpu-default'].debug && window.__pf_webgpu_mounts['pf-wgpu-default'].debug.ready === true)",
            timeout=10_000,
        )
        # initial rotX
        initial_rotX = page.evaluate("() => window.__pf_webgpu_mounts['pf-wgpu-default'].debug.getState().rotX")
        # perform a mouse drag on the canvas
        canvas_box = page.evaluate("() => { const c = document.getElementById('wgpu-canvas'); const r = c.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; }")
        start_x = int(canvas_box['x'])
        start_y = int(canvas_box['y'])
        # Use Playwright mouse to simulate drag
        page.mouse.move(start_x, start_y)
        page.mouse.down()
        page.mouse.move(start_x + 120, start_y + 60)
        page.mouse.up()
        # wait a little beyond the local grace period so any host updates are applied
        page.wait_for_timeout(1500)
        after_rotX = page.evaluate("() => window.__pf_webgpu_mounts['pf-wgpu-default'].debug.getState().rotX")
        # Persist logs
        try:
            log_path = Path("artifacts") / "playwright_drag_retains_state_console.log"
            log_path.write_text('\n'.join([str(x) for x in logged]), encoding="utf-8")
        except Exception:
            pass
        browser.close()
    assert after_rotX != initial_rotX, f"Expected rotX to change after drag (was {initial_rotX}), got {after_rotX}"
