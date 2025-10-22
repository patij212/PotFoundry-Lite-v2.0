"""Analyze edgeflow verbose diagnostics JSONL and summarize per-zi probe rows.

Writes tools/edgeflow_probe_summary.json and prints a short table to stdout.
"""

import json
from collections import Counter
from pathlib import Path

INPATH = Path(__file__).parent / "edgeflow_verbose_diagnostics.jsonl"
OUTPATH = Path(__file__).parent / "edgeflow_probe_summary.json"


def main() -> None:
    if not INPATH.exists():
        print(f"Missing input: {INPATH}")
        raise SystemExit(1)

    summaries = []
    seen_zis = set()
    for line in INPATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except Exception as e:
            print("skipping malformed line:", e)
            continue
        rows = obj.get("rows") or []
        for r in rows:
            zi = r.get("zi")
            if zi is None:
                continue
            # avoid duplicates: keep first seen per zi
            if zi in seen_zis:
                continue
            seen_zis.add(zi)
            s = {
                "zi": zi,
                "z": r.get("z"),
                "min_final_raw": float(r.get("min_final_raw") or 0.0),
            }
            for k in (
                "R_raw_sample",
                "R_analysis_sample",
                "Env_sample",
                "Env_to_use_sample",
                "R_new_sample",
                "R_new_raw_sample",
            ):
                arr = r.get(k) or []
                try:
                    mn = min([float(x) for x in arr]) if arr else None
                except Exception:
                    mn = None
                s[k + "_min"] = mn
            # origin map distribution
            om = r.get("origin_map_sample") or []
            if om:
                # normalize origin_map entries to ints where possible to have a
                # consistent key type for Counter and downstream uses.
                om_ints: list[int] = []
                for x in om:
                    try:
                        om_ints.append(int(x))
                    except Exception:
                        # fallback: coerce numeric-like floats -> int, else use -1 as sentinel
                        try:
                            if isinstance(x, (float,)):
                                om_ints.append(int(x))
                            else:
                                om_ints.append(-1)
                        except Exception:
                            om_ints.append(-1)
                cnt = Counter(om_ints)
                s["origin_map_counts"] = dict(cnt)
                # report contiguous blocks count (list of (value, run_length))
                blocks: list[tuple[int, int]] = []
                prev = None
                blocklen = 0
                for v in om_ints:
                    if v == prev:
                        blocklen += 1
                    else:
                        if prev is not None:
                            blocks.append((prev, blocklen))
                        prev = v
                        blocklen = 1
                if prev is not None:
                    blocks.append((prev, blocklen))
                s["origin_map_blocks"] = blocks
            summaries.append(s)

    # write out
    OUTPATH.write_text(json.dumps({"summaries": summaries}, indent=2), encoding="utf-8")

    # print compact table
    print(f"Wrote {OUTPATH} with {len(summaries)} zi summaries")
    for s in summaries:
        print(f"zi={s['zi']:3} z={s.get('z')} min_final_raw={s['min_final_raw']}")
        keys = [k for k in s.keys() if k.endswith("_min")]
        for k in keys:
            print(f"  {k:25}: {s[k]}")
        if "origin_map_counts" in s:
            print("  origin_map_counts:", s["origin_map_counts"])
            print("  origin_map_blocks sample:", s["origin_map_blocks"][:5])
        print()


if __name__ == "__main__":
    main()
