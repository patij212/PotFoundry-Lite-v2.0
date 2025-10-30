from pathlib import Path
p=Path('app.py')
text=p.read_text(encoding='utf-8', errors='replace')
lines = text.splitlines()
res = []
for i, line in enumerate(lines, start=1):
    if 'ss.get(' in line:
        res.append((i, line.strip(), 'cast(' in line))
for ln, content, casted in res:
    tag = 'CASTED' if casted else 'UNCAST'
    print(f"{ln:4d}: {tag} | {content}")
count_casted = sum(1 for _,_,c in res if c)
count_uncast = sum(1 for _,_,c in res if not c)
print('\nTOTAL occurrences:', len(res))
print('CASTED:', count_casted, 'UNCAST:', count_uncast)
