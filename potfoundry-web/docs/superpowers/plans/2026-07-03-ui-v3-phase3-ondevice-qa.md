# Phase 3 On-Device QA — Human Exit Gate

**Date:** 2026-07-03  
**Owner:** Patryk (UI/UX validation on real device)  
**Exit criterion:** All 12 checks pass; cosmetic questions answered; findings logged for Phase-3.5 fix round.

---

## Getting the App on Your Phone

### Path A: LAN (Wireless)
1. `npm run dev -- --host` in the potfoundry-web terminal (starts dev server on local network).
2. Find your machine's LAN IP: `ipconfig getifaddr en0` (macOS) or `ipconfig` (Windows, look for IPv4).
3. On your phone, navigate to `http://<LAN-IP>:3000`.
4. **WebGPU caveat:** Chrome Android requires a secure context (HTTPS). Two options:
   - Enable `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add the exact origin (`http://<LAN-IP>:3000`), and restart Chrome.
   - Accept automatic fallback to WebGL (works, renders slower, but full feature parity for this QA gate).

### Path B: USB Port Forwarding (Recommended)
1. Connect Android device via USB; enable Developer Mode + USB Debugging.
2. Open Chrome on desktop → `chrome://inspect/#devices`.
3. Under your device, click **Port forwarding** (or "Enable port forwarding").
4. Add rule: **Device port** 3000 → **Local address** `localhost:3000`.
5. On your phone, navigate to `http://localhost:3000` in Chrome.
6. **Benefit:** Localhost is always a secure context; full WebGPU available without flags.

---

## 12-Point Checklist

| # | Check | What to Try | Pass/Fail | Notes |
|---|-------|-------------|-----------|-------|
| 1 | Sheet drag feel | Drag the sheet (pot design canvas) up/down by its handle. Does it snap to peek/half/full with snappy weight? No overshoot or lag? | | Should feel crisp and controlled, not bouncy. |
| 2 | Peek/half/full canvas reframing | Drag sheet to each stop (peek, half, full). Canvas reframes smoothly. Tap values visible in each state without re-layout? | | Text/controls should remain stable during transition. |
| 3 | Tab swipe (bottom nav) | Swipe left/right between sheet tabs (Dimensions, Style, Mesh, Appearance, Export). Does it animate smoothly? | | No dropped frames; tab switches in sync with gesture. |
| 4 | Row-scrub precision vs steppers | Tap stepper buttons (±) for row count, then try swipe-scrubbing the row slider. Both precise? No jump or deadzone? | | Stepper should increment by 1; scrub should feel direct (no acceleration/lag). |
| 5 | Long-press preview feel | Long-press (≥350ms) the style preview. Does a larger canvas pop up? Timing feel natural? | | Note if 350ms is the right threshold (too short = accidental triggers; too long = frustrating wait). |
| 6 | Blueprint strip usability | Can you reach the blueprint drawing handles comfortably? Are they at least 29px wide at thumb-height (landscape)? | | Measure handle width in dev tools if needed (target ≥29px). |
| 7 | Haptics feedback | Does the phone vibrate on sheet drag snap-to-stop or tab swipe? Is it perceptible but not annoying? | | Feedback should reinforce gestures, not startle. Note if any haptics are missing or overwhelming. |
| 8 | Safe-areas on notched device | On a notch/dynamic island phone, do UI elements avoid the cutout? Sheet handles, tab bar, and export button clear of safe-area violations? | | Test in both orientations (portrait + landscape notch positions). |
| 9 | Landscape swap | Rotate phone to landscape. Does the layout reflow cleanly? Sheet position, tabs, blueprint strip — all readable and reachable? | | Check for text overflow, clipped buttons, or inaccessible controls. |
| 10 | Showroom scroll + thumbnail perf | Open Showroom (library preset browser). Scroll through 10+ presets. Thumbnails load smoothly? No janky re-renders or blank frames? | | Measure: can you scroll 1 full screen in <500ms without hiccup? |
| 11 | Export firing + certificate | Tap Export. Modal appears. Select STL or 3MF. Download fires. Does your phone's certificate/security UI appear? File lands in Downloads? | | Note OS (Android version); verify file is readable (not corrupted). |
| 12 | Free-form: anything that feels wrong | Interact with the app naturally (create a pot, tweak style, export, navigate back). Note any jank, misaligned text, unresponsive taps, or unintuitive UX. | | Capture video/screenshot of glitches if found. |

---

## Two Known Cosmetic Questions for Your Judgment

### Q1: Blueprint Strip Dead Space
The blueprint drawing area has empty space on both sides (left and right flanking the strip). Should we stretch the strip to fill the width, or leave breathing room?
- **Current:** Centered narrow strip with margin.
- **Candidate:** Full-width drawing area (saves vertical space, more visible).
- **Your call:** Pass/fail as-is, or note preference for Phase-3.5.

### Q2: Tab Bar Export Label Collision
The bottom nav reads "…Export" (tab label) | "Export" (CTA button). The words collide visually. Options:
- **Rename CTA:** "Send" / "Download" / icon-only (arrow ↓).
- **Rename tab:** "File" / "Share" / icon-only.
- **Your call:** Which reads clearest on your screen, or should we iconify both?

---

## Summary & Next Steps

**If all 12 checks pass + cosmetics answered:** Phase 3 is **prototype-complete**. Findings feed Phase-3.5 (final QA fix round; estimated 2–3 tasks per category).

**If blockers found:** Log them in the "Notes" column above, take a screenshot, and we'll prioritize fixes before Phase-3.5 launch.

**Report back to:** Patryk (@janusze3) or task-13 completion doc.
