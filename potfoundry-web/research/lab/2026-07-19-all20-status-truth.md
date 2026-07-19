# All-20 status truth — certified config vs production-default scale (2026-07-19)

**Purpose:** ONE authoritative, commit-pinned status table for all 20 registry styles that
does not blur the two things the doc set keeps conflating:

- **Certified config** — the exact pot size + params the G2 judge has actually proven
  ≤ 0.01 mm on the final STL bytes. Every certificate to date is a **SMALL, GENTLE** pot.
- **Production default** — what a user actually exports: **OD140 / H120 + registry-default
  params**, through the OLD conforming mesher (perfect-mesher/analytic flags OFF).

**Headline (state it plainly):** **ZERO of the 20 styles are certified at production-default
scale AND registry-default params.** The G2 programme's "12 styles certified" is real but is
**14 pots, all on small (H32–H40 / OD30) gentle-param geometry** — plus ONE default-scale
pot (HarmonicRipple @ OD140/H120) that is itself **gentle-param, not registry-default**. The
distance from here to "production-scale certified" is a triangle-budget / envelope-version
gap, quantified in §4.

**Rulers used (measured/committed only):** G2 certification matrix `2026-07-15` + Addenda
1–22; UNIVERSAL-001 roadmap `2026-07-15` + addenda through the 2026-07-19 Gyroid note;
potscope ledger; the 2026-07-12 GPU-oracle production frontier; the 2026-07-11
PROD-ARTIFACT-TRUTH capture. pm = picometres of two-sided residual (budget 10,000,000 pm =
0.01 mm; certificates carry a 0.5 µm non-geometric reserve ⇒ 9.5 µm geometric line).

---

## 1. Certified-set honest count

**14 certified pots spanning 11 DISTINCT registry styles** — all CERTIFIED-PARTIAL
(small gentle geometry). Registry IDs of the certified styles: **0, 1, 2, 3, 4, 5, 6, 7,
11, 13, 15**.

> **Hygiene catch:** the matrix Addendum 21 and downstream summaries say "TWELVE styles."
> That double-counts **WaveInterference**, which was certified twice (slice-10 gentled
> `b1fff083`, then full-defaults `8ffb958a`) — two pots, one style. The honest count is
> **11 distinct styles / 9 non-certified**. Enumeration below is the proof (11 + 9 = 20).

Full registry defaults (not merely small-pot) were used for only **3** certificates:
FourierBloom, SuperellipseMorph, WaveInterference — **each on SMALL (OD30) geometry**.

---

## 2. THE TABLE — all 20 styles

Columns: **Judge status** = CERTIFIED-PARTIAL / named-wall / refused+mechanism (current, per
matrix Addenda — NOT the frozen 2026-07-15 §3 snapshot). **Certified config** = pot + params.
**pm / tris / commit** = the pinned certificate. **Prod-default worst-case** = true-3D max at
OD140/H120 + registry defaults through the shipping mesher (see §3 for provenance; Track B is
re-measuring these).

| ID | Style | Judge status | Certified config (pot / params) | Certified pm / tris / commit | Prod-default (OD140/H120 + reg-defaults) worst-case true-3D |
|----|-------|--------------|--------------------------------|------------------------------|------------------------------------------------------------|
| 0 | SuperformulaBlossom | **CERTIFIED-PARTIAL** | H40/OD30 · gentle (sf_strength 0.15, m 6, n1 1, n2 2, n3 4) | 9,499,801 / 53,760 / `b37df65c` | not separately pinned; TRUTH-BRIDGE (CPU-truth missing strength field, `types.ts:548`) — SUSPECTED open |
| 1 | FourierBloom | **CERTIFIED-PARTIAL** | H40/OD30 · **registry defaults** | 9,499,927 / 206,848 / `3a0a8c0a` | not separately pinned (Track B) |
| 2 | SpiralRidges | **CERTIFIED-PARTIAL** | H40/OD30 · gentle low-turn (amp 0.02, groove 0, turns 0.2) | 9,499,969 / ~53.8k / `f510bada` | **~0.047 mm max / p99 0.004** (GPU oracle 2026-07-12) — SUSPECTED as-of-date |
| 3 | SuperellipseMorph | **CERTIFIED-PARTIAL** | H40/OD30 · **registry defaults** (m_top 5.5) | 9,499,679 / 107,520 / `d5327967` | scorecard p99 ~0.003 (2026-07-03, superseded) — SUSPECTED |
| 4 | HarmonicRipple | **CERTIFIED-PARTIAL** (2 pots) | H40/OD30 gentle · **AND OD140/H120 gentle** (petal 0.01) | small 9,499,923 / ~29k / `7d59941b` · OD140 **9,499,996 / 155,648 / `ae271268`** | default-PARAM @ OD140 ≈ **2M+ tris**, UNCERTIFIED (roadmap:143/286) |
| 5 | GothicArches | **CERTIFIED-PARTIAL** (spike-only) | H32/OD30 · p1 d0 relief0.2 | 9,499,997 / 304,808 / `4b301990` | **~0.44 mm max / p99 0.129** (GPU oracle 2026-07-12) — SUSPECTED as-of-date |
| 6 | WaveInterference | **CERTIFIED-PARTIAL** (2 pots) | H32/OD30 gentled(relief0.25) `b1fff083` · **AND full registry defaults(relief2.3)** | full-defaults **9,499,990 / 1,267,712 / `8ffb958a`** | not separately pinned (Track B); charter §7 "CPU↔GPU divergence" is STALE (fixed `2d02f566`) |
| 7 | Crystalline | **CERTIFIED-PARTIAL** (2 pots) | H40/OD30 gentle-hp0 · AND H32/OD30 hp0.25 | hp0 9,497,638 / 31,008 / `df86ed64` · hp0.25 9,499,985 / 50,544 / `7b1a5a4f` | not separately pinned (Track B) |
| 8 | ArtDeco | **REFUSED** — atlas (curtain/riser) | — | — | not separately pinned (Track B); U4 class |
| 9 | DragonScales | **REFUSED** — atlas (multi-patch complex) | — | — | body ~0.067; **rim 0.25 is STALE** (rim clamp now ships unconditionally; body reportedly closed to 0.01 flag-gated) — SUSPECTED, Track B re-measuring |
| 10 | BambooSegments | **REFUSED** — atlas (curtain/riser) | — | — | not separately pinned (Track B); U4 class |
| 11 | RippleInterference | **CERTIFIED-PARTIAL** | H40/OD30 · gentle (count 4, rot 0, freq 6, relief 0.15) | 9,499,975 / 86,528 / `b37df65c` | not separately pinned (Track B) |
| 12 | GyroidManifold | **NAMED WALL** (envelope v6) | — (gentle attempt refused) | — | **~0.72 mm max / p99 0.135** (GPU oracle 2026-07-12) — SUSPECTED as-of-date |
| 13 | Voronoi | **CERTIFIED-PARTIAL** (bubble) | H32/OD30 · bubble gentled (morph 0, jitter 0.8, relief 0.04) | 9,499,879 / 172,032 / `d42c1b88` | web/F2 mode value-jump 0.138 mm (U4); prod scorecard ~3.8M outer tris — SUSPECTED |
| 14 | BasketWeave | **REFUSED** — atlas (composition) | — | — | REFUTED out of the snaking-C0 set (`5c09b824`); U4 class — SUSPECTED |
| 15 | GeometricStar | **CERTIFIED-PARTIAL** | H32/OD30 · gentle (relief 0.02, roundness 1, shift 0) | 9,499,903 / 176,128 / `65e39f6d` | chevron cliff true-3D MAX ~0.37 mm, DENSITY-IRREDUCIBLE (EXCLUDE-risers, needs anisotropic flank kernel; `731e0592`) — SUSPECTED |
| 16 | HexagonalHive | **REFUSED** — atlas (curtain/riser) | — | — | not separately pinned (Track B); U4 class |
| 17 | CelticKnot | **REFUSED** — curved-riser curtain (mechanism known) | — | — | snaking-C0 frontier now **0.211 mm** density-invariant diamond facet (was 1.58; planarizeCrests = permanent NO-GO) — SUSPECTED |
| 18 | CelticTriquetra | **REFUSED** — curved/diagonal conforming (U5) | — | — | 45°-rotated braid lattice; density- & relief-invariant refusals — SUSPECTED |
| 19 | LowPolyFacet | **REFUSED** — atlas (multi-patch feature complex) | — | — | not separately pinned (Track B); U4 class |

**Two-column takeaway:** the "Certified config" column is entirely SMALL/GENTLE. The
"Prod-default" column has NO certificate anywhere. The gap between them is the whole story.

---

## 3. Provenance notes for the production-default column

- **SR / Gothic / Gyroid / DragonScales** worst-cases are the 2026-07-12 GPU-oracle frontier
  (roadmap §2). Marked SUSPECTED-as-of-date: **Track B is re-measuring** with the current
  shipping mesher (DS rim clamp changed since; the 0.25 figure is stale).
- The remaining styles have no fresh per-style true-3D MAX pinned THIS session. The last
  broad capture is the 2026-07-11 PROD-ARTIFACT-TRUTH verdict (3 SHIPPED-CLEAN / 14
  REGRESSION / 2 truth-bridge / 1 special-ruler) and the older 2026-07-03 scorecard (p99,
  not max; "10/15 CAD-grade" — itself superseded, see hygiene flags). Track B owns the refresh.
- **Gothic in-gate = spike-only:** its certificate reproduces in
  `research/bridge/_gothicVoronoiConformingSpike.test.ts` (287.5 s / 6 patch workers), not in
  the fast standing PF_G2_POT roster gate — SUSPECTED reason: runtime. All other certificates
  are in-gate.

---

## 4. Scale-gap measurement scope — what production-default certification demands (FB / SE / WI)

Distance from the small-gentle certificates to **OD140/H120 + registry defaults**, by the
sag law the roadmap already uses (triangle demand ~ relief · freq² · area / tol). Model:
per-wall tris ∝ N_ang · N_row; **N_ang ∝ f·√(A/tol)** with A = ABSOLUTE relief (mm);
**N_row ∝ H** (vertical feature periods scale with physical height) + profile-curvature ladder.

Key distinction: **FB/SE amplitudes are FRACTIONS of radius** ⇒ A_mm scales with r
(15→70 mm ⇒ ×4.67 ⇒ N_ang ×√4.67 ≈ ×2.16). **WI relief is ABSOLUTE 2.3 mm** ⇒ A fixed ⇒
N_ang ≈ unchanged, but its bill is already the roster's largest.

**Anchor (roadmap:143/286):** HarmonicRipple at OD140 with *registry-default* petal 0.16
(≈ 11 mm relief at r=70) ⇒ ~4,400 angular stations ⇒ **~2M+ tris**. HR is certified at OD140
only at GENTLE params (155,648 tris) — the canonical proof the one default-scale cert is
param-scoped.

| Style | Cert (small) tris | OD140/H120 default estimate | Envelope needed |
|-------|-------------------|-----------------------------|-----------------|
| **SuperellipseMorph** | 107,520 (OD30/H40, 512 ang) | 107k × ~2.16 (ang) × ~3.0 (H40→120 rows) ≈ **0.5–0.9 M tris** | **v5** (2,097,152 cap) — fits; LEAST demanding ⇒ likely FIRST production-scale cert |
| **FourierBloom** | 206,848 (OD30/H40, 1024 ang) | 207k × ~2.16 × ~3.0 ≈ **1.0–1.6 M tris** | **v5, tight → v5b** (4,194,304) |
| **WaveInterference** | 1,267,712 (OD30/H32, 1024×290) | ang ~unchanged × ~3.75 (H32→120 rows) ≈ **4–6 M tris** | **v6** (per-patch ~4 M, total ~8 M) — the SAME tier Gyroid-gentle needs |

**All three estimates are SUSPECTED** — sag-scaling extrapolations, no OD140 FB/SE/WI proof
has been run. They bound the honest distance: SE is v5-reachable now; FB needs v5b headroom;
**WI at production scale is a v6 problem**, i.e. the same deliberate compute-scale decision the
2026-07-19 Gyroid note defers to Patryk. "Production-scale certified" for even the 3 closest
styles is one-to-two envelope generations out.

---

## 5. What this doc supersedes / flags

- **Supersedes** the roadmap §3 (2026-07-15) all-20 distance matrix for the 11 now-certified
  styles and the stale refusal mechanisms — see the roadmap's appended 2026-07-19 supersession
  marker.
- **Stale live-status lines flagged** (for Track-B/orchestrator action; not edited here):
  (a) charter `2026-07-11` §7 (lines 145–147) lists "WaveInterference CPU↔GPU divergence" as a
  known product bug — FIXED by `2d02f566` (on-GPU differential still owed, but the divergence
  itself is closed); (b) `programme-scorecard-production.md` lines 27–31 "production is largely
  CAD-grade … 10/15" — superseded by the 2026-07-11 PROD-ARTIFACT-TRUTH verdict.
- **EXPERIMENT-REGISTRY gaps closed** this session: the two 2026-07-18 NO-GO verdicts
  (screen-slack audit `5ed4825a`, Hessian second-order screen `d93abcc0`) had commits but no
  programme record — rows added.
