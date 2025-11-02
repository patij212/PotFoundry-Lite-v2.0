import json


def main() -> None:
    path = ".pf_edge_flow_debug.json"
    lines = []
    with open(path, "r", encoding="utf-8") as f:
        for ln in f:
            ln = ln.strip()
            if not ln:
                continue
            try:
                obj = json.loads(ln)
                lines.append(obj)
            except Exception:
                # ignore non-json lines
                continue

    # pick summaries that look like our payloads: must have 'reports' and 'reports_count'
    summaries = [s for s in lines if isinstance(s, dict) and "reports" in s]
    print("total_json_lines=", len(lines))
    print("total_summaries=", len(summaries))
    if not summaries:
        print("No summary payloads found.")
        raise SystemExit(0)

    latest = summaries[-1]
    reports = latest.get("reports", [])
    print("latest_reports_count=", latest.get("reports_count", len(reports)))

    # analyze reports
    empty_idxs: list[tuple[int, int, object]] = []
    mapped_mismatch: list[tuple[int, int, int, int]] = []
    idxs_lens: list[int] = []
    has_theta_val_nan: list[tuple[int, int, object]] = []
    for i, r in enumerate(reports):
        idxs = r.get("idxs", [])
        mapped = r.get("mapped_raw_idxs", [])
        theta_val = r.get("theta_val")
        idxs_lens.append(len(idxs))
        if len(idxs) == 0:
            empty_idxs.append((i, r.get("zi"), r.get("peaks")))
        if mapped and len(mapped) != len(idxs):
            mapped_mismatch.append((i, r.get("zi"), len(idxs), len(mapped)))
        try:
            if theta_val is None or (
                isinstance(theta_val, float) and (theta_val != theta_val)
            ):
                has_theta_val_nan.append((i, r.get("zi"), theta_val))
        except Exception:
            pass

    from statistics import mean

    print("reports_total=", len(reports))
    print("idxs_len_min=", min(idxs_lens) if idxs_lens else None)
    print("idxs_len_max=", max(idxs_lens) if idxs_lens else None)
    print("idxs_len_mean=", mean(idxs_lens) if idxs_lens else None)
    print("empty_idxs_count=", len(empty_idxs))
    print("mapped_mismatch_count=", len(mapped_mismatch))
    print("has_theta_val_nan_count=", len(has_theta_val_nan))

    if empty_idxs:
        print("\nSample empty idxs entries (first 10):")
        for ent in empty_idxs[:10]:
            print(ent)
    if mapped_mismatch:
        print("\nSample mapped mismatch (first 10):")
        for mm in mapped_mismatch[:10]:
            print(mm)

    # show a couple of sample reports
    print("\nSample report 0:")
    print(json.dumps(reports[0], indent=2)[:1000])
    print("\nSample report middle:")
    print(json.dumps(reports[len(reports) // 2], indent=2)[:1000])
    print("\nSample report last:")
    print(json.dumps(reports[-1], indent=2)[:1000])

    # quick check: were mapped_raw_idxs values in range 0..T-1 if T present
    bad_mapped_vals = []
    for r in reports:
        mapped = r.get("mapped_raw_idxs")
        T = r.get("T")
        if mapped and T:
            for v in mapped:
                if not (0 <= v < T):
                    bad_mapped_vals.append((r.get("zi"), v, T))
                    break
    print("\nbad_mapped_vals_count=", len(bad_mapped_vals))
    if bad_mapped_vals:
        print(bad_mapped_vals[:10])


if __name__ == "__main__":
    main()
