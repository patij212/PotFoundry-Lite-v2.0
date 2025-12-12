from pathlib import Path

p=Path(r"c:\Users\patij212\Downloads\PotFoundry-Lite-v2.0\pfui\tabs\interactive\preview\webgpu_renderer.py")
s=p.read_text(encoding="utf-8")
start = s.find('wgsl = r"""')
if start==-1:
    print("WGSL start not found")
    raise SystemExit(1)
start += len('wgsl = r"""')
end = s.find('"""', start)
if end==-1:
    print("WGSL end not found")
    raise SystemExit(1)
wgsl = s[start:end]
lines = wgsl.splitlines()
print("WGSL lines:", len(lines))
openb = sum(1 for c in wgsl if c=="{")
closeb = sum(1 for c in wgsl if c=="}")
print("Braces open=",openb," close=",closeb)
for i,l in enumerate(lines[:200], start=1):
    print(f"{i:3}: {l}")
print("\nContext around line 24-36:")
for i in range(24,37):
    if 1<=i<=len(lines):
        print(f"{i:3}: {lines[i-1]}")
