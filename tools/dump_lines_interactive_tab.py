from pathlib import Path

p=Path("pfui/interactive_tab.py")
lines=p.read_text(encoding="utf-8").splitlines()
for i in range(116,132):
    print(f"{i+1:4}: {lines[i]}")
print("---")
for i in range(272,292):
    print(f"{i+1:4}: {lines[i]}")
print("---")
for i in range(304,316):
    print(f"{i+1:4}: {lines[i]}")
