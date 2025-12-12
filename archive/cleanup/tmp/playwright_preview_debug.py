from playwright.sync_api import sync_playwright
from pfui.preview import webgpu_core

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

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False, args=[
        "--enable-unsafe-webgpu",
        "--enable-privileged-webgpu",
        "--enable-features=Vulkan,UseSkiaRendererWebGPU",
        "--ignore-gpu-blocklist",
        "--use-gl=egl",
    ])
    page = browser.new_page()

    # Capture console messages
    def on_console(msg):
        try:
            print('CONSOLE::', msg.type, msg.text())
        except Exception:
            print('CONSOLE::', msg.type)
    page.on("console", on_console)

    # Capture page errors
    page.on("pageerror", lambda exc: print('PAGE ERROR::', exc))

    # Capture response errors
    def on_response(response):
        if response.status != 200:
            try:
                print('RESPONSE::', response.status, response.url)
            except Exception:
                pass
    page.on('response', on_response)

    page.set_content(f"<html><body>{html}</body></html>", wait_until="networkidle")
    # Print body content for debugging purposes
    print('BODY LENGTH', len(page.content()))
    print('WGPU STATUS TEXT:', page.evaluate("() => { const el = document.getElementById('wgpu-status'); return el ? (el.textContent||'') : ''; }"))

    # Wait for status element
    try:
        page.wait_for_function("() => { const el = document.getElementById('wgpu-status'); if (!el) return false; return el.dataset.ready === '1' || (el.textContent || '').toLowerCase().includes('ready'); }", timeout=30000)
        print('READY')
    except Exception as e:
        print('READY_TIMEOUT', e)
        page.screenshot(path='artifacts/playwright_debug.png')
        html_text = page.content()
        with open('artifacts/playwright_debug.html', 'w', encoding='utf8') as f:
            f.write(html_text)

    browser.close()
