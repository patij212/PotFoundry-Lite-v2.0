import json
import sys
from pathlib import Path
from typing import Any, List, Optional


def _as_seq(x: Any) -> Optional[List[Any]]:
    if x is None:
        return None
    try:
        return list(x)
    except Exception:
        return None


def main() -> None:
    BASE = Path(__file__).resolve().parent
    JSONL = BASE / "edgeflow_verbose_diagnostics.jsonl"

    def usage():
        print("Usage: python inspect_probe_zi.py <zi> [--mode first|last|timestamp]")
        print("  mode: first (default) | last | timestamp=<float>")

    if len(sys.argv) < 2:
        usage()
        sys.exit(2)

    try:
        TARGET_ZI = int(sys.argv[1])
    except Exception:
        usage()
        sys.exit(2)

    # parse optional mode
    mode = "first"
    ts_filter = None
    if len(sys.argv) > 2:
        m = sys.argv[2]
        if m.startswith("timestamp="):
            try:
                ts_filter = float(m.split("=", 1)[1])
                mode = "timestamp"
            except Exception:
                pass
        elif m in ("first", "last"):
            mode = m

    if not JSONL.exists():
        print(f"Missing {JSONL}")
        sys.exit(2)

    found = False
    selected_row = None
    selected_ts = None

    lines = JSONL.read_text(encoding="utf-8").splitlines()
    if mode == "first" or mode == "timestamp":
        iterable = lines
    else:
        iterable = list(reversed(lines))

    for line in iterable:
        if not line.strip():
            continue
        obj = json.loads(line)
        rows = obj.get("rows", [])
        ts = obj.get("timestamp")
        if mode == "timestamp" and ts_filter is not None and ts != ts_filter:
            continue
        for r in rows:
            if r.get("zi") == TARGET_ZI:
                selected_row = r
                selected_ts = ts
                found = True
                break
        if found:
            break

    if not found:
        print(f"No probe found for zi={TARGET_ZI} in {JSONL} (mode={mode})")
        sys.exit(1)

    print(f"Selected JSONL timestamp: {selected_ts} (mode={mode})")

    # Ensure we have a dict row to inspect
    if not isinstance(selected_row, dict):
        print("Selected row is not a dictionary; aborting.")
        sys.exit(1)

    print(f"Found probe zi={TARGET_ZI} in JSONL; keys: {list(selected_row.keys())}")

    R_raw = _as_seq(selected_row.get("R_raw_sample"))
    R_analysis = _as_seq(selected_row.get("R_analysis_sample"))
    Env = _as_seq(selected_row.get("Env_sample"))
    Env_to_use = _as_seq(selected_row.get("Env_to_use_sample"))
    Env_to_use_raw_post = _as_seq(selected_row.get("Env_to_use_raw_post"))
    origin_map = _as_seq(selected_row.get("origin_map_sample"))
    R_new = _as_seq(selected_row.get("R_new_sample"))
    R_new_raw = _as_seq(selected_row.get("R_new_raw_sample"))

    # Determine theta count safely
    if R_raw is not None:
        n = len(R_raw)
    elif R_new_raw is not None:
        n = len(R_new_raw)
    else:
        print("No theta samples available in selected row for inspection.")
        sys.exit(1)
    print(f"n_theta = {n}")

    viol = []
    for i in range(n):
        # prefer explicit post-deoffset envelope if present
        er = None
        if Env_to_use_raw_post is not None and i < len(Env_to_use_raw_post):
            er = Env_to_use_raw_post[i]
        elif Env_to_use is not None and i < len(Env_to_use):
            er = Env_to_use[i]
        elif Env is not None and i < len(Env):
            er = Env[i]
        if er is None:
            continue

        rnew_raw_val = (
            R_new_raw[i] if (R_new_raw is not None and i < len(R_new_raw)) else None
        )
        if rnew_raw_val is None:
            continue

        try:
            if float(rnew_raw_val) < float(er) - 1e-9:
                rraw_val = R_raw[i] if (R_raw is not None and i < len(R_raw)) else None
                rans_val = (
                    R_analysis[i]
                    if (R_analysis is not None and i < len(R_analysis))
                    else None
                )
                rnew_val = R_new[i] if (R_new is not None and i < len(R_new)) else None
                om_val = (
                    origin_map[i]
                    if (origin_map is not None and i < len(origin_map))
                    else None
                )
                viol.append((i, rraw_val, rans_val, er, rnew_val, rnew_raw_val, om_val))
        except Exception:
            # Skip entries that cannot be compared/converted
            continue

    if not viol:
        print(
            "No violations: all final raw radii >= envelope_to_use (using Env_to_use_raw_post if available)"
        )
    else:
        print(
            f"Found {len(viol)} violating theta columns (final_raw < Env_to_use). Showing up to 50:"
        )

        def _fmt(v: Any) -> str:
            try:
                return f"{float(v):.6f}"
            except Exception:
                return str(v)

        for idx, rraw, rans, envv, rnew, rnew_raw, om in viol[:50]:
            print(
                f"idx={idx:3d} raw={_fmt(rraw)} analysis={_fmt(rans)} env_to_use={_fmt(envv)} R_new={_fmt(rnew)} R_new_raw={_fmt(rnew_raw)} origin_map={om}"
            )

    # Also show contiguous blocks
    if viol:
        blocks = []
        start = None
        last = None
        for idx, *_ in viol:
            if start is None:
                start = last = idx
            elif (last is not None) and (idx == last + 1):
                last = idx
            else:
                blocks.append((start, last))
                start = last = idx
        if start is not None:
            blocks.append((start, last))
        print("Violating blocks:", blocks)


if __name__ == "__main__":
    main()
