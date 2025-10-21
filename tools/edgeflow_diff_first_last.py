"""
Compare first vs last occurrence of a probe zi in tools/edgeflow_verbose_diagnostics.jsonl
Prints a JSON object with counts and up to 200 mismatch indices for R_new_raw < Env_to_use for both rows.
Usage: python edgeflow_diff_first_last.py <zi>
"""
import sys, json
from pathlib import Path

if len(sys.argv) < 2:
    print(json.dumps({'error':'missing_zi'}))
    sys.exit(2)
try:
    zi = int(sys.argv[1])
except:
    print(json.dumps({'error':'invalid_zi'}))
    sys.exit(2)

p = Path(__file__).resolve().parent / 'edgeflow_verbose_diagnostics.jsonl'
if not p.exists():
    print(json.dumps({'error':'missing_file', 'path': str(p)}))
    sys.exit(1)

first = None
last = None
with p.open('r', encoding='utf-8') as fh:
    for line in fh:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except Exception:
            continue
        rows = obj.get('rows') if isinstance(obj, dict) else None
        if not rows:
            continue
        for r in rows:
            try:
                if int(r.get('zi', -1)) == zi:
                    if first is None:
                        first = r
                    last = r
            except Exception:
                pass

def compare_row(r):
    if r is None:
        return None
    r_new = r.get('R_new_raw_sample')
    env = r.get('Env_to_use_sample') or r.get('Env_sample')
    if r_new is None or env is None:
        return {'has_r_new_raw': r_new is not None, 'has_env_to_use': env is not None}
    n = min(len(r_new), len(env))
    idxs = [i for i in range(n) if float(r_new[i]) < float(env[i]) - 1e-9]
    return {'count': len(idxs), 'indices': idxs[:200]}

report = {'zi': zi, 'found_first': first is not None, 'found_last': last is not None}
report['first'] = compare_row(first)
report['last'] = compare_row(last)
print(json.dumps(report))
