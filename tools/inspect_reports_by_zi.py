import json
import sys
from statistics import mean


def main() -> None:
    path = '.pf_edge_flow_debug.json'
    zi_target = 42
    if len(sys.argv) > 1:
        try:
            zi_target = int(sys.argv[1])
        except Exception:
            pass

    lines = []
    with open(path, 'r', encoding='utf-8') as f:
        for ln in f:
            ln = ln.strip()
            if not ln:
                continue
            try:
                obj = json.loads(ln)
                lines.append(obj)
            except Exception:
                continue

    summaries = [s for s in lines if isinstance(s, dict) and 'reports' in s]
    if not summaries:
        print('no summaries')
        raise SystemExit(1)
    latest = summaries[-1]
    reports = latest.get('reports', [])
    reports_zi = [r for r in reports if int(r.get('zi', -999)) == zi_target]
    print(f'total_reports={len(reports)} reports_for_zi={len(reports_zi)}')
    if not reports_zi:
        raise SystemExit(0)

    suspicious = []
    for r in reports_zi:
        idxs = r.get('idxs', [])
        mapped = r.get('mapped_raw_idxs', [])
        B = r.get('B_vals', [])
        cur = r.get('cur', [])
        new = r.get('new', [])
        theta_val = r.get('theta_val')
        # check outward-only property
        violations = []
        for i, (c, b, n) in enumerate(zip(cur, B, new)):
            if not (abs(n - max(c, b)) < 1e-6 or (n == max(c, b))):
                violations.append((i, c, b, n))
        # check B relative to cur in many cells
        uplifted = sum(1 for c, b in zip(cur, B) if b > c + 1e-6)
        dropped = sum(1 for c, b in zip(cur, B) if b < c - 1e-6)
        # check if mapped indices are monotonic mapping of idxs (allow wrap)
        monot = True
        # compute differences mod T if T present
        T = r.get('T')
        if T is None:
            # try infer T from idxs range
            try:
                T = max(idxs) + 1
            except Exception:
                T = None
        if T is not None and len(idxs) > 1:
            diffs = [(mapped[i] - idxs[i]) % T for i in range(len(idxs))]
            # if diffs not all equal, note it
            if len(set(diffs)) > 1:
                monot = False
        # record
        suspicious.append({
            'peaks': (r.get('peak_a_col'), r.get('peak_b_col')),
            'theta_val': theta_val,
            'idxs_len': len(idxs),
            'uplifted_count': uplifted,
            'dropped_count': dropped,
            'violations_count': len(violations),
            'monotonic_shift': monot,
            'sample_idxs': idxs[:5],
            'sample_mapped': mapped[:5],
            'B_min': min(B) if B else None,
            'B_max': max(B) if B else None,
            'cur_min': min(cur) if cur else None,
            'cur_max': max(cur) if cur else None,
        })

    # print a human-friendly table
    for s in suspicious:
        print('PEAKS', s['peaks'], 'theta_val', s['theta_val'])
        print('  idxs_len', s['idxs_len'], 'uplifted', s['uplifted_count'], 'dropped', s['dropped_count'], 'violations', s['violations_count'], 'monotonic_shift', s['monotonic_shift'])
        print('  B_range', s['B_min'], '->', s['B_max'], 'cur_range', s['cur_min'], '->', s['cur_max'])
        print('  sample idxs', s['sample_idxs'], 'sample_mapped', s['sample_mapped'])
        print('')

    # summary stats
    print('SUMMARY for zi', zi_target)
    print(' total sectors for zi', len(suspicious))
    print(' avg idxs_len', mean([x['idxs_len'] for x in suspicious]))
    print(' avg uplifted', mean([x['uplifted_count'] for x in suspicious]))
    print(' avg dropped', mean([x['dropped_count'] for x in suspicious]))
    print(' violations total', sum(x['violations_count'] for x in suspicious))

    # show the most suspicious sectors (violations>0 or many dropped)
    sorted_s = sorted(suspicious, key=lambda x: (x['violations_count'] > 0, x['dropped_count']), reverse=True)
    print('\nTop 5 suspicious sectors:')
    for s in sorted_s[:5]:
        print(s)


if __name__ == '__main__':
    main()
