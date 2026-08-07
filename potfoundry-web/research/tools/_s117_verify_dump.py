import json, sys, os
D = os.path.dirname(os.path.abspath(__file__)) + "/../exchange/_strataConformBisect/"
files = [
    ("GOTHCTL", D + "s117/S117_APCR_GOTHCTL.json"),
    ("HEXHIVE", D + "s117/S117_APCR_HEXHIVE.json"),
    ("SPIRAL",  D + "s117/S117_APCR_SPIRAL.json"),
    ("VORONOI", D + "s117/S117_APCR_VORONOI.json"),
    ("CT",      D + "s117/S117_APCR_CT.json"),
    ("ARTDECO", D + "s116/S117_APCR_ARTDECO.json"),
]
KEYS = ['nT','area','hiN','hiA','hiAreaPct','hiMax','loN','loA','loAreaPct',
        'badN','badA','bladeN','bladeA','poleN','poleA',
        'precondMaxUm','precondPerpMaxUm','precondPerpN','dihMaxDeg','bnd','incons']
for tag, f in files:
    if not os.path.exists(f):
        print("MISSING", tag, f); continue
    d = json.load(open(f))
    print("#" * 30, tag, "#" * 30)
    print("  style", d['style'], "| verdict:", d['verdict'])
    print("  stl", d['stl'])
    for k in ['ceilDeg','LMAX','k1','k2','k3','k4','k5um','k6','bisections']:
        print("   ", k, "=", d.get(k))
    for w in ['coverBase','coverOp']:
        c = d[w]
        print("   ", w, {k: c[k] for k in ['nPos','nNeg','nZero','covering','net','inverted']})
    for a in d['arms']:
        print("   ARM:", a['label'])
        print("     ", " ".join("%s=%s" % (k, a.get(k)) for k in KEYS))
    print()
