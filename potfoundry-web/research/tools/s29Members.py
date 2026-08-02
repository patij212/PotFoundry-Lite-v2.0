# S29 MEMBERSHIP + PRE-REGISTRATION FEASIBILITY PROBE
# =============================================================================
# SELF-DECLARING HEADER — read this before trusting any number below.
#
# WHAT THIS IS: the instrument that produced every measured figure in the S29
# REGISTRATION block of research/lab/2026-07-29-strata-perf-convergence-worklog.md.
#
# WHAT IT DOES: it is READ-ONLY over two COMMITTED artifacts. It builds no mesh,
# edits no driver, runs no GPU, and writes no file. It is arithmetic over JSON.
#
# WHAT IT HAS BEEN RUN AGAINST, and the output is transcribed in the worklog:
#   research/exchange/_strataCertD/CERTD_S24i2.residual2.json
#       schema pf.strata.certD.residual/2, enumerationComplete: true,
#       rowsAreComplete: true, all 14,569 rows carrying boundUm
#   research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S26X.unresolved.json
#       schema pf.strata.unresolved/1, 4,584 facets, truncated: false
#
# THE INDEX-VALIDITY CHECK THAT LICENSES THE CAGE SUBTRACTION — verified out of
# band and recorded here because the subtraction is meaningless without it:
#   md5(gothicarches_ring_DS-HT_S26X.stl)
#     == md5(gothicarches_ring_DS-HT_S24i2.stl)
#     == c96da03c08eefbc081a304093c95a364
# The S26 cage list therefore indexes the SAME mesh as the residual, so `tri`
# is directly comparable between the two files. If that md5 equality ever fails,
# THIS SCRIPT IS INVALID and the cage must be matched by (theta, z) instead.
#
# CONVENTION NOTE: research/tools/ is otherwise TypeScript. This is Python
# because it is a one-shot read-only probe over committed JSON and carries no
# runtime dependency on the driver or the bridge. It is committed rather than
# left in a scratchpad so the registration's numbers are reproducible.
#
# LANGUAGE OF THE RESULT: the three membership counts are a FILTER, not a
# measurement of the surface. The feasibility table IS a model — h^p with p
# stated per row — and is labelled as such wherever it is quoted.
# =============================================================================

import json
import math
import collections
import sys

EX = "C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/"
RESIDUAL = EX + "_strataCertD/CERTD_S24i2.residual2.json"
CAGE = EX + "_strataConformBisect/gothicarches_ring_DS-HT_S26X.unresolved.json"
LOCI = EX + "_phase2/S28i1.loci.json"   # source of the run-identity KEY only; no field is read from it
TOL = 10.0          # um — the certificate's own TOL; the accept-override's bar
TRI_CAP = 5.5e6     # the registered S29 ceiling
PROPAGATION = 5.5   # S28 defect 11: driver growth beyond the local prediction

# ---- SINK GUARD, as registered -------------------------------------------
SITE_DTH = 0.02     # rad
SITE_DZ = 0.5       # mm
SINK_N = 128        # per-site split budget, calibrated to the measured h^2 p99 of 130.8
SINK_FALL = 1.5     # the reading must fall this much or the site re-strands

# ---- MEMBERSHIP CELLS ----------------------------------------------------
# The driver's mesh is built FROM SCRATCH on a 200x140 grid and refined; its triangle indices have NOTHING
# to do with `_S24i2`'s STL indices, so `tri` CANNOT be the membership test on the running mesh. Membership
# is therefore carried as a REGION in (theta, z) — the same spatial discipline `PF_CB_TIGHTEN` uses, for the
# same reason — and `tri` is retained for audit and for the sink guard's entry reading.
CELL_DTH = 0.002    # rad  (~0.08 mm of arc at Rb=40) — finer than any member facet's own extent
CELL_DZ = 0.1       # mm
R_MIN = 40.0        # Rb; the smaller radius gives the LARGER angular extent, i.e. the safe direction

res = json.load(open(RESIDUAL))
cagedoc = json.load(open(CAGE))

if not (res.get("enumerationComplete") and res.get("rowsAreComplete")):
    raise SystemExit("REFUSING: residual2 does not declare a complete enumeration")
if cagedoc["counts"]["truncated"]:
    raise SystemExit("REFUSING: cage list is truncated")

rows = res["rows"]
N0 = res["nTri"]
cage = set(f["tri"] for f in cagedoc["facets"])

# ---- THE THREE COUNTS ----------------------------------------------------
over = [r for r in rows if r["boundUm"] > TOL]
rim = [r for r in over if r["owner"] == "rim-row"]
interior = [r for r in over if r["owner"] != "rim-row"]
in_cage = set(r["tri"] for r in interior) & cage
member = [r for r in interior if r["tri"] not in cage]

print("=== MEMBERSHIP LADDER ===")
print(f"  over-TOL rows (boundUm > {TOL})      : {len(over):6d}")
print(f"  - rim row (EXCLUDED)                 : {len(rim):6d}")
print(f"  = interior over-TOL                  : {len(interior):6d}")
print(f"  - cage (S26 unresolved, EXCLUDED)    : {len(in_cage):6d}")
print(f"  = S29 ACCEPT-OVERRIDE MEMBERSHIP     : {len(member):6d}")
print(f"\n  cage total {len(cage)}; it meets the interior over-TOL set in "
      f"{len(in_cage)} facets "
      f"({100*len(in_cage)/len(cage):.2f}% of the cage, "
      f"{100*len(in_cage)/len(interior):.2f}% of the residual)")

print("\n=== BY OWNER ===")
for k, v in collections.Counter(r["owner"] for r in member).most_common():
    sub = [r["boundUm"] for r in member if r["owner"] == k]
    print(f"  {k:<14} n={v:6d}  maxBound={max(sub):9.3f}")

b = sorted(r["boundUm"] for r in member)
n = len(b)
print(f"\n=== BOUND DISTRIBUTION ===\n  max {b[-1]:.3f}  p99 {b[int(.99*n)]:.3f}  "
      f"p90 {b[int(.90*n)]:.3f}  p50 {b[n//2]:.3f}  min {b[0]:.3f}")
for t in (30, 50, 100, 150):
    print(f"  over {t:3d} um : {sum(1 for x in b if x > t):6d}")
mx = max(member, key=lambda r: r["boundUm"])
print(f"  ARGMAX tri {mx['tri']} at {mx['boundUm']:.3f} um "
      f"(owner {mx['owner']}) -- the interior certified bound carrier")

# ---- FEASIBILITY (R2 discipline: price it BEFORE refining) ----------------
# Under error ~ h^p, bound b -> TOL needs h to fall (b/TOL)^(1/p);
# the local 2-D triangle multiplier is (b/TOL)^(2/p).
print("\n=== FEASIBILITY ARITHMETIC (MODEL, p stated per row) ===")
print(f"{'model':<22}{'extra(local)':>14}{'x5.5 prop':>12}{'total':>13}{'xbase':>7}{'cap':>13}")
for name, p in (("h^2 plane-sag", 2.0), ("h^1.5 mixed", 1.5), ("h^1 crease", 1.0)):
    extra = sum((r["boundUm"] / TOL) ** (2.0 / p) - 1.0 for r in member)
    tot = N0 + extra * PROPAGATION
    print(f"{name:<22}{extra:>14,.0f}{extra*PROPAGATION:>12,.0f}{tot:>13,.0f}"
          f"{tot/N0:>7.2f}{'OK' if tot <= TRI_CAP else 'INFEASIBLE':>13}")

worst = max(r["boundUm"] for r in member)
for name, p in (("h^2", 2.0), ("h^1", 1.0)):
    hv = math.log(worst / TOL) / math.log(2) / p
    print(f"  worst member {worst:.3f} um under {name}: h falls x{(worst/TOL)**(1/p):.2f}"
          f" = {hv:.2f} halvings = x{4**hv:,.0f} local triangles")
print("  (compare the CAGE, same arithmetic, worklog L7455: x246 = 7.94 halvings"
      " = x60,534 local triangles)")

# ---- PER-SITE BUDGET CALIBRATION for the sink tripwire --------------------
print("\n=== SINK-GUARD BUDGET CALIBRATION (sites: dtheta 0.02 rad x dz 0.5 mm) ===")
cells = collections.defaultdict(list)
for r in member:
    cells[(round(r["theta"] / 0.02), round(((r["zMin"] + r["zMax"]) / 2) / 0.5))].append(r["boundUm"])
cost = sorted(sum((x / TOL) - 1.0 for x in v) for v in cells.values())
m = len(cost)
print(f"  sites {m}  |  h^2 splits/site: p50 {cost[m//2]:.1f}  p90 {cost[int(.9*m)]:.1f}"
      f"  p99 {cost[int(.99*m)]:.1f}  max {cost[-1]:.1f}")
for N in (16, 32, 64, 128, 256):
    o = sum(1 for c in cost if c > N)
    print(f"  budget N={N:4d}: {o:5d} sites ({100*o/m:5.2f}%) exceed it under h^2 alone")
print("  REGISTERED N = 128 -- it sits at the measured h^2 p99, so under C1's own")
print("  win shape ~99% of sites finish inside it and a TRIP means the reading is")
print("  not falling (the sink signature), not that the budget was mean.")

# ==========================================================================
# --emit <path> : SERIALIZE THE MEMBERSHIP FOR THE DRIVER.
# --------------------------------------------------------------------------
# Handoff step 2. Three products, and the third is the one the driver actually
# tests against:
#   members[]  the 14,328 tri values with their entry boundUm and geometry.
#              `tri` is AUDIT ONLY -- see the CELL_DTH note above for why it
#              cannot be the running membership test.
#   sites[]    the sink guard's per-site entry readings (max member boundUm in
#              the site). A site whose reading has not fallen SINK_FALL after
#              SINK_N splits re-strands.
#   cells[]    THE MEMBERSHIP REGION, packed (iTheta * nZ + iZ). Derived HERE,
#              in the instrument that has been run and whose numbers are
#              transcribed in the registration -- not re-derived inside the
#              driver where it would be unvalidated.
# ==========================================================================
if "--emit" in sys.argv:
    out_path = sys.argv[sys.argv.index("--emit") + 1]

    # Run identity, taken from a COMMITTED artifact rather than retyped. S28i1.loci.json's `run` block was
    # produced by `phase2Key(style, params, dims, tolMm, stage)` against this exact substrate
    # (run.tag == gothicarches_ring_DS-HT_S24i2), so reusing its key makes the driver's match-or-throw the
    # SAME comparison PF_CB_TIGHTEN performs, on the same string, with no second transcription to drift.
    loci = json.load(open(LOCI))
    run = loci["run"]
    if run["tag"] != "gothicarches_ring_DS-HT_S24i2":
        raise SystemExit(f"REFUSING: loci run.tag is {run['tag']}, not the S24i2 substrate")
    if run["tolMm"] != 0.01 or run["stage"] != "ring" or run["style"] != "GothicArches":
        raise SystemExit("REFUSING: loci run block is not this campaign's configuration")

    n_th = int(round(2 * math.pi / CELL_DTH))
    n_z = int(round(120.0 / CELL_DZ))
    cells = set()
    for r in member:
        half = (r["longestUm"] / 1000.0) / 2.0          # facet half-extent, mm
        dth = half / R_MIN
        t0 = r["theta"] - dth
        t1 = r["theta"] + dth
        z0 = r["zMin"] - half
        z1 = r["zMax"] + half
        i0 = math.floor(t0 / CELL_DTH)
        i1 = math.floor(t1 / CELL_DTH)
        j0 = max(0, math.floor(z0 / CELL_DZ))
        j1 = min(n_z - 1, math.floor(z1 / CELL_DZ))
        for i in range(i0, i1 + 1):
            ii = i % n_th                               # theta is periodic
            for j in range(j0, j1 + 1):
                cells.add(ii * n_z + j)

    sites = {}
    for r in member:
        k = (round(r["theta"] / SITE_DTH), round(((r["zMin"] + r["zMax"]) / 2) / SITE_DZ))
        e = sites.get(k)
        if e is None:
            sites[k] = {"iTh": k[0], "iZ": k[1], "n": 1, "entryUm": r["boundUm"]}
        else:
            e["n"] += 1
            if r["boundUm"] > e["entryUm"]:
                e["entryUm"] = r["boundUm"]

    frac = 100.0 * len(cells) / (n_th * n_z)
    doc = {
        "schema": "pf.strata.s29.members/1",
        "producedBy": "research/tools/s29Members.py --emit",
        "source": {
            "residual": "research/exchange/_strataCertD/CERTD_S24i2.residual2.json",
            "cage": "research/exchange/_strataConformBisect/"
                    "gothicarches_ring_DS-HT_S26X.unresolved.json",
            "stl": "gothicarches_ring_DS-HT_S24i2.stl",
            "stlMd5": "c96da03c08eefbc081a304093c95a364",
            "indexValidity": "md5(S26X.stl) == md5(S24i2.stl) -- checked out of band; "
                             "the cage subtraction is meaningless without it",
        },
        "run": {
            "key": run["key"], "style": run["style"], "stage": run["stage"],
            "tolMm": run["tolMm"], "dims": run["dims"], "params": run["params"],
        },
        "tolUm": TOL,
        "complete": True,
        "truncated": False,
        "counts": {
            "over": len(over), "rim": len(rim), "interior": len(interior),
            "cage": len(in_cage), "members": len(member),
        },
        "cellGrid": {
            "dTheta": CELL_DTH, "dZ": CELL_DZ, "nTheta": n_th, "nZ": n_z,
            "cells": len(cells), "surfaceFractionPct": frac,
        },
        "sinkGuard": {
            "dTheta": SITE_DTH, "dZ": SITE_DZ, "budgetN": SINK_N,
            "fallRatio": SINK_FALL, "sites": len(sites),
        },
        "cells": sorted(cells),
        "sites": sorted(sites.values(), key=lambda s: (s["iTh"], s["iZ"])),
        "members": [
            {"tri": r["tri"], "boundUm": r["boundUm"], "theta": r["theta"],
             "zMin": r["zMin"], "zMax": r["zMax"], "longestUm": r["longestUm"],
             "owner": r["owner"]}
            for r in sorted(member, key=lambda r: r["tri"])
        ],
    }
    with open(out_path, "w") as f:
        json.dump(doc, f)

    print("\n=== EMITTED ===")
    print(f"  {out_path}")
    print(f"  members {len(member)}  sites {len(sites)}  cells {len(cells)}"
          f" of {n_th * n_z} = {frac:.3f}% of the (theta,z) domain")
    print(f"  run.key {run['key'][:60]}...")
    ent = sorted(s["entryUm"] for s in sites.values())
    m = len(ent)
    print(f"  site entry readings: max {ent[-1]:.3f}  p50 {ent[m // 2]:.3f}  min {ent[0]:.3f} um")
