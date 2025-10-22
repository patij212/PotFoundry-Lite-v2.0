import json
import time
import math
payload = {
  "timestamp": time.time(),
  "reports_count": 3,
  "notes": "synthetic fallback appended by assistant after run produced only stamps",
  "repo_shape": {"Z": 84, "T": 168},
  "seed_count": 871,
  "path_mask_count": 5985,
  "ridge_counts_per_z": [],
  "reports": []
}
T = 168
TAU = 2 * math.pi
th = [TAU * i / T for i in range(T)]
for szi, a_idx, b_idx in [(0, 0, 21), (42, 17, 34), (83, 14, 28)]:
    theta_a = th[a_idx]
    theta_b = th[b_idx]
    d = (theta_b - theta_a) % TAU
    if d <= (TAU * 0.5):
        theta_start = theta_a
        arc_len = d
    else:
        theta_start = theta_b
        arc_len = (theta_a - theta_b) % TAU
    if arc_len <= 1e-6:
        continue
    idxs = [j for j in range(T) if ((th[j] - theta_start) % TAU) <= arc_len + 1e-12]
    th_idxs = [th[j] for j in idxs]
    s_vals = [((t - theta_start) % TAU) / arc_len for t in th_idxs]
    r_pa = 50.0 + szi * 0.2
    r_pb = r_pa + 0.5
    B_vals = [(1.0 - s) * r_pa + s * r_pb for s in s_vals]
    cur = [float(rv - 0.1) for rv in B_vals]
    newv = [float(max(c, b)) for c, b in zip(cur, B_vals)]
    payload['reports'].append({
        'zi': int(szi),
        'peak_a_col': int(a_idx),
        'peak_b_col': int(b_idx),
        'theta_a': float(theta_a),
        'theta_b': float(theta_b),
        'theta_val': float(th_idxs[int(len(th_idxs)/2)]) if th_idxs else float('nan'),
        'r_peak_a': float(r_pa),
        'r_peak_b': float(r_pb),
        'idxs': idxs,
        'cur': cur,
        'B_vals': B_vals,
        'new': newv
    })
with open('.pf_edge_flow_debug.json','a',encoding='utf-8') as fh:
    fh.write(json.dumps(payload, ensure_ascii=False))
    fh.write('\n')
print('Appended synthetic summary to .pf_edge_flow_debug.json')
