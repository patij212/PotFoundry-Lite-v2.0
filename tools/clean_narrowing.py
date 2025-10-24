"""Clean up nested/redundant casts introduced by automated narrowing.

This script performs a few conservative regex-based fixes:
 - Replace cast(Optional[float], cast(Any, ss.get(...))) -> cast(Any, ss.get(...))
 - Replace cast(Optional[int], cast(Any, ss.get(...))) -> cast(Any, ss.get(...))
 - Collapse nested identical Optional casts, e.g., cast(Optional[bytes], cast(Optional[bytes], ss.get(...))) -> cast(Optional[bytes], ss.get(...))
 - For Optional[dict] nested casts similarly.

Run: python tools\clean_narrowing.py
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'app.py'
s = APP.read_text(encoding='utf-8')

rules = [
    # Optional[float]/int wrapping Any -> simplify to Any
    (re.compile(r"cast\(Optional\[float\],\s*cast\(Any,\s*(ss\.get\([^)]*\))\)\)"), r"cast(Any, \1)"),
    (re.compile(r"cast\(Optional\[int\],\s*cast\(Any,\s*(ss\.get\([^)]*\))\)\)"), r"cast(Any, \1)"),
    # Optional bytes/dict nested identical casts -> collapse
    # More permissive patterns to collapse nested casts even across minor spacing/newlines
    (re.compile(r"cast\(Optional\[bytes\],\s*cast\(Optional\[bytes\],\s*(ss\.get\([\s\S]*?\))\s*\)\s*\)", flags=re.DOTALL), r"cast(Optional[bytes], \1)"),
    (re.compile(r"cast\(Optional\[dict\],\s*cast\(Optional\[dict\],\s*(ss\.get\([\s\S]*?\))\s*\)\s*\)", flags=re.DOTALL), r"cast(Optional[dict], \1)"),
    # Optional bytes/dict outer wrapping cast(Any, ss.get(...)) -> collapse to Optional[...] around inner ss.get
    (re.compile(r"cast\(Optional\[bytes\],\s*cast\(Any,\s*(ss\.get\([^)]*\))\)\)"), r"cast(Optional[bytes], \1)"),
    (re.compile(r"cast\(Optional\[dict\],\s*cast\(Any,\s*(ss\.get\([^)]*\))\)\)"), r"cast(Optional[dict], \1)"),
]

changed = False
for pattern, repl in rules:
    s_new, n = pattern.subn(repl, s)
    if n:
        print(f"Applied rule {pattern.pattern} -> {n} replacements")
        changed = True
        s = s_new

if changed:
    APP.write_text(s, encoding='utf-8')
    print("Wrote cleaned app.py")
else:
    print("No changes required")
