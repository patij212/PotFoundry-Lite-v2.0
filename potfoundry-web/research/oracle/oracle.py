import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from adapters import triangle_adapter, gmsh_adapter  # noqa: E402

ENGINES = {"triangle": triangle_adapter, "gmsh": gmsh_adapter}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["mesh"])
    ap.add_argument("--in", dest="indir", required=True)
    ap.add_argument("--engine", required=True, choices=list(ENGINES))
    args = ap.parse_args()
    with open(os.path.join(args.indir, "input.json")) as f:
        inp = json.load(f)
    out = ENGINES[args.engine].mesh(inp)
    with open(os.path.join(args.indir, f"out_{args.engine}.json"), "w") as f:
        json.dump(out, f)
    print(f"wrote out_{args.engine}.json: {len(out['indices'])//3} triangles in {out['engineMs']:.0f}ms")


if __name__ == "__main__":
    main()
