import json, os
D = os.path.dirname(os.path.abspath(__file__)) + "/../exchange/_strataConformBisect/"
files = [("GOTHCTL", D+"s117/S117_APCR_GOTHCTL.json"), ("HEXHIVE", D+"s117/S117_APCR_HEXHIVE.json"),
         ("SPIRAL", D+"s117/S117_APCR_SPIRAL.json"), ("VORONOI", D+"s117/S117_APCR_VORONOI.json"),
         ("CT", D+"s117/S117_APCR_CT.json"), ("ARTDECO", D+"s116/S117_APCR_ARTDECO.json")]
print("%-9s %-5s %10s %12s %14s %14s %12s" % ("style","arm","nNeg","aNeg mm2","sNeg rad*mm","inverted","covering"))
for tag, f in files:
    d = json.load(open(f))
    for w in ("coverBase","coverOp"):
        c = d[w]
        print("%-9s %-5s %10d %12.6f %14.6e %14.6e %12.9f" % (
            tag, "base" if w=="coverBase" else "op", c['nNeg'], c['aNeg'], c['sNeg'], c['inverted'], c['covering']))
    cb, co = d['coverBase'], d['coverOp']
    gi = co['inverted']/cb['inverted'] if cb['inverted'] > 0 else float('inf') if co['inverted']>0 else 1.0
    gn = co['nNeg']/cb['nNeg'] if cb['nNeg'] > 0 else float('inf') if co['nNeg']>0 else 1.0
    ga = co['aNeg']/cb['aNeg'] if cb['aNeg'] > 0 else float('inf') if co['aNeg']>0 else 1.0
    print("   -> VOID-CLAUSE DELTA  inverted x%.4g   nNeg x%.4g   aNeg(3D) x%.4g" % (gi, gn, ga))
print()
print("=== SIDE-EFFECT LEDGER: operator vs baseline (>1 = WORSE) ===")
print("%-9s %10s %10s %10s %10s %10s %10s" % ("style","badN","badA","bladeN","bladeA","poleN","poleA"))
for tag, f in files:
    d = json.load(open(f)); b, o = d['arms'][0], d['arms'][1]
    def rr(k):
        return (o[k]/b[k]) if b[k] else (float('inf') if o[k] else 1.0)
    print("%-9s %10.4g %10.4g %10.4g %10.4g %10.4g %10.4g" % (
        tag, rr('badN'), rr('badA'), rr('bladeN'), rr('bladeA'), rr('poleN'), rr('poleA')))
print()
print("=== COST MATCH: placebo nT / operator nT ===")
for tag, f in files:
    d = json.load(open(f)); o, p = d['arms'][1], d['arms'][2]
    print("%-9s op %9d  placebo %9d  ratio %.4f" % (tag, o['nT'], p['nT'], p['nT']/o['nT']))
