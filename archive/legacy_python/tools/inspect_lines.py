p="pfui/tabs/interactive/preview/webgpu_renderer.py"
with open(p, encoding="utf-8") as f:
    lines = f.readlines()
for i in range(150,166):
    print(i+1, repr(lines[i]))
