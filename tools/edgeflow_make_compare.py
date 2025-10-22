"""
Read tools/edgeflow_verbose_diagnostics.jsonl and produce a compact JSON report
for a requested zi (default 42). Prints JSON to stdout.
"""

import sys
import json
from pathlib import Path
from typing import Optional, Tuple


def load_row_by_mode(
    jsonl_path: Path, zi: int, mode: str = "last", ts: Optional[float] = None
) -> Tuple[Optional[dict], Optional[float]]:
    found = None
    found_ts = None
    try:
        lines = []
        with jsonl_path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except Exception:
                    continue
                lines.append(obj)
    except FileNotFoundError:
        return None, None

    if mode == "first":
        iterable = lines
    else:
        # ensure a list is assigned (mypy complains about reversed -> list type)
        iterable = list(reversed(lines))

    for obj in iterable:
        rows = obj.get("rows") if isinstance(obj, dict) else None
        ts_obj = obj.get("timestamp")
        if not rows:
            continue
        if mode == "timestamp" and ts is not None and ts_obj != ts:
            continue
        for row in rows:
            try:
                if int(row.get("zi", -1)) == zi:
                    found = row
                    found_ts = ts_obj
                    break
            except Exception:
                pass
        if found:
            break
    return found, found_ts


def compact_report(row):
    report = {"zi": row.get("zi")}
    # fetch arrays
    env_to_use = row.get("Env_to_use_sample")
    env_applied = row.get("Env_applied_raw_sample")
    r_new_raw = row.get("R_new_raw_sample")
    report["has_env_to_use"] = env_to_use is not None
    report["has_env_applied_raw"] = env_applied is not None
    report["has_r_new_raw"] = r_new_raw is not None
    # include full arrays if present
    if env_to_use is not None:
        report["env_to_use_sample"] = env_to_use
    if env_applied is not None:
        report["env_applied_raw_sample"] = env_applied
    if r_new_raw is not None:
        report["r_new_raw_sample"] = r_new_raw
    # compute comparisons
    n_theta = None
    try:
        if r_new_raw is not None:
            n_theta = len(r_new_raw)
    except Exception:
        n_theta = None
    report["n_theta"] = n_theta

    def compare(a, b):
        # return count and indices where a < b (elementwise). Expect lists of same len.
        if a is None or b is None:
            return None
        try:
            n = min(len(a), len(b))
            idxs = [i for i in range(n) if float(a[i]) < float(b[i])]
            return {"count": len(idxs), "indices": idxs}
        except Exception:
            return None

    report["r_vs_env_applied"] = compare(r_new_raw, env_applied)
    report["r_vs_env_to_use"] = compare(r_new_raw, env_to_use)
    return report


def main():
    if len(sys.argv) < 2:
        print("Usage: python edgeflow_make_compare.py <zi>")
        sys.exit(2)
    try:
        zi = int(sys.argv[1])
    except Exception:
        print("Invalid zi")
        sys.exit(2)
    # parse optional mode and timestamp
    mode = "last"
    ts = None
    if len(sys.argv) > 2:
        arg = sys.argv[2]
        if arg in ("first", "last"):
            mode = arg
        elif arg.startswith("timestamp="):
            try:
                ts = float(arg.split("=", 1)[1])
                mode = "timestamp"
            except Exception:
                pass

    repo = Path(__file__).parent.parent
    jsonl = Path(repo) / "tools" / "edgeflow_verbose_diagnostics.jsonl"
    row, row_ts = load_row_by_mode(jsonl, zi, mode=mode, ts=ts)
    if row is None:
        print(json.dumps({"error": "no_row_found", "zi": zi, "mode": mode, "ts": ts}))
        return
    report = compact_report(row)
    report["_jsonl_timestamp"] = row_ts
    report["_mode"] = mode
    print(json.dumps(report))


if __name__ == "__main__":
    main()
