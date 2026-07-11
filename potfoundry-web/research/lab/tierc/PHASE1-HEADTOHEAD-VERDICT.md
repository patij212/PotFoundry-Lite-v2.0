# PROD-TIERC Phase 1 — Head-to-Head Consolidated Verdict

**Experiment:** E-2026-07-11-TIERC-HEADTOHEAD (prereg `c57a0c6c` + Addenda 1–7).
**Reproduction phase: CLOSED, 2026-07-11.** This is the honest answer to the charter question and
the user's mandate ("productionize the proven lab champions to 0.01mm watertight across all styles").

---

## 1. The architecture bet is PROVEN

One region-based orchestration layer (`buildRegionOuterWall` + per-style manifest) reproduces all
three champion kernels through a single general dispatch path:

| champion | kernel | reproduction | evidence |
|---|---|---|---|
| Gyroid | K1 conforming-CDT | **bit-for-bit** | 3-way hash identity (native=fallback=banked); fidelity Δ0% on every dim (Newton-worst identical to 17 sig figs) |
| Gothic | K2 protected-refine | **CI-exact** | native = K2-direct bit-identical = live gate (9917 tris / 7 passes / 0 outliers) |
| DragonScales | K3 structured rows + K1 | **mechanism works** | native N=15 R-STRUCT/R-CDT chain built end-to-end (first time), 0 interior holes |
| smooth control | K1 (zero curves) | **clean** | same-provenance packed-assembly hash identity |

The synthesis the charter set out to prove — partition by feature anatomy, dispatch to the right
kernel, immutable owned/adopted boundary contracts, no free whole-surface triangulation (R1–R7 stay
excluded by construction) — **holds**. That is the load-bearing result.

## 2. But NO champion yet meets the shippable standard — and the harness is why we know

The composite gates harness measures two things **nothing in the entire prior campaign did**:
deviation vs the *true analytic surface* (not a sampler grid), and *orientation-consistency +
boundary-closure* (not just non-manifold + zero-area). On every single arm it found the celebrated
"win" was measured against a lenient basis, and the honest floor sits below it:

| champion | prior "win" | harness-exposed gap | remedy (characterized) |
|---|---|---|---|
| Gyroid | −67.6% fidelity | **360 interior holes + 652 orientation flips** (band-edge CDT) — not a watertight solid | A4-orient (ConformingWall uMargin/wrapsSeam periodic-aware) + A4b (snapMerge weld-widen) — both kernel, both band-edge-specific |
| Gothic | "literal-0" | **~0.17mm off analytic at knife-edge crests** — built/scored vs a 512² sampler up to 1.35mm off there | C2: lift refine verts via analytic `rA` (faithful-by-construction) OR raise sampler gridRes — kernel |
| DragonScales | ring closure | manifest domain-overlap (nonMan 3584) + **seam winding 7168** + **73% %<20° quality collapse** | Finding 1 (fix proven) + Finding 2 (winding, kin to A4-orient) + Finding 3 (undiagnosed) |

The pattern recurred four times (Gyroid A1, Gothic C1, DS B1 ×2 defects; Gothic's *orientation* was
measured-clean, the exception that confirms the rule). A less rigorous program would have shipped
three champions with holes, sampler-gaps, and 73%-sliver meshes, each invisible to the gates it was
certified against. **This is the audit-first mandate's entire value, delivered.**

## 3. Cross-style findings (bonus, load-bearing for the fix phase)

- **The interior-hole/orientation defect is Gyroid-band-edge-CDT-SPECIFIC.** Gothic K2 (0/0) and DS
  (0 interior holes) both proved clean — so A4-orient/A4b are narrow band-edge fixes, not
  shared-machinery surgery. (DS's winding defect is a *different* mechanism, at the R-STRUCT↔R-CDT
  adoption seam.)
- **Two truth-bridge classes, now named:** (a) sampler-resolution (Gothic — the styleSampler grid
  under-resolves knife-edges); (b) construction-topology (Gyroid band-edge CDT emits holes/mis-winds
  under 28k doubled-curve points). Both were invisible to the sampler-basis + nonMan-only prior gates.

## 4. Recommended next phase — per-style kernel-fix batches (task #16 + DS Findings 2/3)

All remedies are characterized down to the mechanism with a proposed fix. They are PRODUCTION-KERNEL
changes (the reproduction arms were research-side), so each carries: GitNexus impact analysis,
default-off byte-identity proof, and a fidelity-Δ0 acceptance gate. Suggested priority:

1. **Gothic C2** — highest shippability value (touches the real production Gothic/GeoStar path; the
   "lift verts via analytic rA" fix is elegant and self-contained).
2. **Gyroid A4-orient + A4b** — closes the −67.6% champion into a watertight solid (band-edge-narrow).
3. **DS Findings 1+2+3** — manifest fix (proven) + winding fix (kin to A4-orient) + quality diagnosis,
   then a genuine tight-sizing fidelity rerun.

The three winding/seam fixes (Gyroid A4-orient, DS Finding 2) may share a root convention and are
worth diagnosing together. This is a natural checkpoint for direction before opening production-kernel
surgery.

---

**Bottom line for the mandate:** the "one region-based Tier-C mesher reproduces the champions"
architecture is proven. Turning proven-reproducible into proven-*shippable* (0.01mm-analytic,
watertight, consistently oriented) is a bounded, fully-characterized punch list — no mysteries left,
just kernel work. The exclusion-free 0.01mm goal is reachable on this architecture; the honest
remaining distance is now measured, per style, instead of hidden behind lenient rulers.
