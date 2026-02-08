import json
import os


def main() -> None:
    p = os.path.join(
        os.path.dirname(__file__), "..", "tools", "edgeflow_verbose_diagnostics.jsonl",
    )
    p = os.path.normpath(p)
    found = None
    with open(p, encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            obj = json.loads(line)
            for r in obj.get("rows", []):
                if (
                    isinstance(r, dict)
                    and r.get("zi") == 42
                    and "R_analysis_sample" in r
                    and "Env_sample" in r
                    and "Env_to_use_sample" in r
                    and "origin_map_sample" in r
                ):
                    found = r
                    break
            if found:
                break
    if not found:
        print("NOT_FOUND")
        raise SystemExit(1)
    R_analysis = found["R_analysis_sample"]
    Env = found["Env_sample"]
    Env_to_use = found["Env_to_use_sample"]
    origin_map = found["origin_map_sample"]
    bridge = [u - v for u, v in zip(Env_to_use, Env)]
    argmin_bridge = min(range(len(bridge)), key=lambda i: bridge[i])
    argmin_analysis = min(range(len(R_analysis)), key=lambda i: R_analysis[i])
    mapped_bridge = origin_map[argmin_bridge]
    mapped_analysis = origin_map[argmin_analysis]
    unique_origins = sorted(set(origin_map))
    sec_bridge = unique_origins.index(mapped_bridge)
    sec_analysis = unique_origins.index(mapped_analysis)
    print(
        "argmin_bridge",
        argmin_bridge,
        "mapped_bridge",
        mapped_bridge,
        "sector_index_bridge",
        sec_bridge,
    )
    print(
        "argmin_analysis",
        argmin_analysis,
        "mapped_analysis",
        mapped_analysis,
        "sector_index_analysis",
        sec_analysis,
    )
    print("sector_delta", abs(sec_bridge - sec_analysis))
    print("bridge_min_value", bridge[argmin_bridge])
    print("min_R_analysis", R_analysis[argmin_analysis])
    print("unique_origins_count", len(unique_origins))
    print("unique_origins[:20]", unique_origins[:20])


if __name__ == "__main__":
    main()
