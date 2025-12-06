import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const url = 'http://localhost:8501/';

  console.log('Opening default page and listening for console messages...');
  page.on('console', (msg) => {
    console.log('[PAGE]', msg.type(), msg.text());
  });

  // Default: no flags
  await page.goto(url, { waitUntil: 'networkidle' });
  console.log('Loaded default page.');
  
  // Test console patch in default mode by writing a console.log - should be suppressed in 'smart' mode
  console.log('Inject console.log in default (smart) mode: pf_test_msg_smart');
  await page.evaluate(() => console.log('pf_test_msg_smart'));
  await page.waitForTimeout(1000);

  // Now open with verbose mode and short heartbeat
  console.log('Opening page with pf_log_mode=verbose and pf_log_heartbeat_ms=2000');
  await page.goto(url + '?pf_log_mode=verbose&pf_log_heartbeat_ms=2000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(10000); // wait to capture potentially multiple heartbeats
  // Wait for `__pf_manager` to appear in any frame then read counters.
  const frames = page.frames();
  let foundCounters = null;
  for (const f of frames) {
    console.log('Checking frame:', f.url());
  }
  // Wait for whichever frame defines the manager
  let frameWithManager = null;
  for (const f of frames) {
    try {
      const exists = await f.evaluate(() => !!window.__pf_manager).catch(() => false);
      if (exists) { frameWithManager = f; break; }
    } catch (err) { /* ignore */ }
  }
  if (!frameWithManager) {
    // Wait a bit longer and re-check frames (mount may be slow)
    await page.waitForTimeout(3000);
    for (const f of page.frames()) {
      try {
        const exists = await f.evaluate(() => !!window.__pf_manager).catch(() => false);
        if (exists) { frameWithManager = f; break; }
      } catch (err) { /* ignore */ }
    }
  }
  if (frameWithManager) {
    try {
      const cnt = await frameWithManager.evaluate(() => {
        const m = window.__pf_manager;
        return { frames: m.frames ?? null, draws: m.draws ?? null, verts: m.verts ?? null };
      });
      foundCounters = cnt;
    } catch (e) { /* ignore */ }
  }
  
  console.log('Manager counters after verbose check (found in frame):', foundCounters);
  // Test that console.log is now immediate in verbose mode
  console.log('Inject console.log in verbose mode: pf_test_msg_verbose');
  await page.evaluate(() => console.log('pf_test_msg_verbose'));
  await page.waitForTimeout(1000);

  // Now toggle localStorage and reload without query
  console.log('Setting localStorage pf_log_heartbeat_ms to 3000 via script and reloading');
  await page.evaluate(() => {
    localStorage.setItem('pf_log_heartbeat_ms', '3000');
    localStorage.setItem('pf_log_mode', 'verbose');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  // Test again that console.log is immediate via localStorage toggle
  console.log('Inject console.log in verbose mode via localStorage: pf_test_msg_localstorage');
  await page.evaluate(() => console.log('pf_test_msg_localstorage'));
  await page.waitForTimeout(1000);

  await browser.close();
  console.log('Playwright script finished.');
})();
