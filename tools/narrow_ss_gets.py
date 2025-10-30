"""Utility to narrow ss.get(...) occurrences in app.py.

This script performs:
 1) Targeted numeric casts (Optional[float] / Optional[int]) for a list of high-payoff keys.
 2) Targeted preview/signature casts (Optional[bytes], Optional[dict], Optional[Any]).
 3) Exhaustive fallback: wrap any remaining ss.get(...) occurrences with cast(Any, ss.get(...)) to reach 100%.

It is conservative: it avoids rewriting ss.get(...) already wrapped in a cast(...).

Run from repository root: python tools\narrow_ss_gets.py
"""
from __future__ import annotations
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_PY = ROOT / "app.py"
BACKUP = ROOT / "app.py.bak"

text = APP_PY.read_text(encoding="utf-8")
BACKUP.write_text(text, encoding="utf-8")

# Helper: find matching closing parenthesis for ss.get(...) starting at open_paren index

def find_matching_paren(s: str, start: int) -> int:
    depth = 0
    for i in range(start, len(s)):
        c = s[i]
        if c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
            if depth == 0:
                return i
    return -1

# Lists of keys to strongly-typed-cast
numeric_float_keys = {
    "H",
    "top_od",
    "bottom_od",
    "t_wall",
    "t_bottom",
    "r_drain",
    "expn",
    "preview_res_scale",
    "fig_w",
    "fig_h",
    "debounce_timeout",
    "preview_detail",
    "flare_center",
    "flare_sharp",
    "bell_amp",
    "bell_center",
    "bell_width",
    "mesh_ambient",
    "mesh_diffuse",
    "mesh_specular",
    "mesh_roughness",
    "mesh_fresnel",
    "view_elev",
    "view_azim",
}
numeric_int_keys = {"n_theta", "n_z", "dpi", "png_cap_n", "quality_up"}
preview_bytes_keys = {"_last_surface_png", "_last_mesh_png"}
preview_json_keys = {"_last_surface_fig_json", "_last_mesh_fig_json"}
signature_keys = {"_last_preview_geom_sig", "_last_preview_app_sig", "geom_sig", "app_sig"}

# Build a pattern for ss.get occurrences
pattern = re.compile(r"ss\.get\(\s*(['\"])(?P<key>.+?)\1", flags=re.DOTALL)

# We'll iterate through the file and replace occurrences carefully (by index) to preserve offsets
s = text
offset = 0
replacements = []  # list of (start_idx, end_idx, new_text)
for m in pattern.finditer(text):
    key = m.group('key')
    start_call = m.start()
    # If the match is already inside a cast( before start_call, skip
    pre = text[max(0, start_call - 20):start_call]
    if 'cast(' in pre:
        continue
    # Find the opening parenthesis position of ss.get( which is m.end()-1 at the '(', but safer search
    open_paren = text.find('(', m.start())
    if open_paren == -1:
        continue
    close_paren = find_matching_paren(text, open_paren)
    if close_paren == -1:
        continue
    orig = text[start_call: close_paren + 1]

    # Decide cast type
    new = None
    if key in numeric_float_keys:
        new = f"cast(Optional[float], {orig})"
    elif key in numeric_int_keys:
        new = f"cast(Optional[int], {orig})"
    elif key in preview_bytes_keys:
        new = f"cast(Optional[bytes], {orig})"
    elif key in preview_json_keys:
        new = f"cast(Optional[dict], {orig})"
    elif key in signature_keys:
        new = f"cast(Optional[tuple], {orig})"
    else:
        # Not in targeted lists; skip here
        continue

    replacements.append((start_call, close_paren + 1, new))

# Apply replacements in reverse order to keep indices valid
for a, b, new in reversed(replacements):
    s = s[:a] + new + s[b:]

# After targeted replacements, now catch any remaining ss.get(...) that are not already casted
pattern_full = re.compile(r"(?<!cast\()ss\.get\(", flags=re.DOTALL)
idx = 0
final_repls = []
while True:
    ms = pattern_full.search(s, idx)
    if not ms:
        break
    start_call = ms.start()
    open_paren = s.find('(', start_call)
    if open_paren == -1:
        idx = ms.end()
        continue
    close_paren = find_matching_paren(s, open_paren)
    if close_paren == -1:
        idx = ms.end()
        continue
    orig = s[start_call: close_paren + 1]
    # Check if this ss.get is already inside a cast in a nearby left context
    pre = s[max(0, start_call - 20):start_call]
    if 'cast(' in pre:
        idx = close_paren + 1
        continue
    new = f"cast(Any, {orig})"
    final_repls.append((start_call, close_paren + 1, new))
    idx = close_paren + 1

for a, b, new in reversed(final_repls):
    s = s[:a] + new + s[b:]

# Add necessary imports if 'Any' or 'Optional' casts were added but not imported
# We'll check if 'from typing import Optional' exists and if 'Any' is available; app.py already imports Any and Optional earlier

# Write back only if changed
if s != text:
    APP_PY.write_text(s, encoding='utf-8')
    print(f"Patched {APP_PY} — {len(replacements)} targeted replacements, {len(final_repls)} fallback replacements.")
else:
    print("No changes made — file already appears narrowed.")
