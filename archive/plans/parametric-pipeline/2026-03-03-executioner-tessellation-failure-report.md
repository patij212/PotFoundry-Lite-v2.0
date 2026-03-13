# Executioner Report — Chain-Strip Tessellation Failure Analysis

**Date**: 2026-03-03  
**From**: Executioner  
**To**: Generator (brainstorming requested)  
**Context**: Phase A chain jaggedness fix is implemented and validated. Export log from a real 10-petal superformula pot reveals that the **chain linking is now smooth**, but the **tessellation pipeline downstream is catastrophically broken**. The problem was never chain linking — it's the chain-strip triangulation and companion vertex system.

---

## 1. Phase A Verdict: Chain Linking Is Fixed

The Phase A changes (A.1–A.4) achieved what they were designed for:

| Metric | Value | Assessment |
|--------|-------|------------|
| `maxLinearDev` | 0.002364 | Excellent — chains deviate <0.24% from linear fit |
| `maxConsecDelta` | 0.007843 | Acceptable — largest jump is 0.78% of U-range |
| `minSameKindSpacing` | 0.000200 | Tight but valid — no same-kind collisions |
| Chains linked | 20 | Expected for 10-petal form (10 peaks + 10 valleys) |
| Avg chain length | 242.7 / 313 rows | 77.5% coverage — good |

**Chain linking is not the problem.** The chains accurately follow detected features with smooth trajectories. The problem is what happens AFTER chains are linked.

---

## 2. The Catastrophe: Five Root Causes

### RC-1: Sweep Triangulation Does Not Enforce Constraint Edges

**File**: `ChainStripTriangulator.ts:338-435`

The `sweepTriangulateStrip` function classifies constraints by mapping endpoints to bot/top strip positions, sorts by midU, then calls `sweepRegion` for each inter-constraint span. **But `sweepRegion` is a greedy U-ordered alternating advance that never checks whether constraint edges appear in the output.**

```typescript
// sweepRegion (L534-561) — purely greedy, no constraint awareness
if (nextBotU <= nextTopU) {
    buf.push(bot[bi].idx, bot[bi + 1].idx, top[ti].idx);  // ← Just picks by U
    bi++;
} else {
    buf.push(bot[bi].idx, top[ti + 1].idx, top[ti].idx);
    ti++;
}
```

The constraints only partition the sweep into regions. Within each region, the greedy advance can (and does) produce triangulations that skip the constraint endpoints entirely. This is the **single biggest cause** of missing edges.

**Evidence**: 3,139 of 6,586 chain edges are missing (47.6%). Of these, 3,107 are cross-row — exactly the type that sweep should enforce but doesn't.

### RC-2: Interpolated Vertex Edges Silently Dropped From Constraints

**File**: `OuterWallTessellator.ts:855-857`

```typescript
// R1: Only feature-to-feature edges are hard constraints.
if (cv0.pointIdx < 0 || cv1.pointIdx < 0) continue;  // ← DROPS ALL INTERPOLATED
```

Chain edges involving interpolated vertices (`pointIdx = -1`) are created in `allChainEdges` (L365-378) but are **never passed as constraints** to the triangulator. The comment says "Interpolated micro-row vertices participate freely in CDT/sweep without constraint edges" — but sweep has no mechanism to naturally preserve these edges.

**Impact**: Of 6,586 total chain edges, only 3,269 are primary (feature-to-feature). The remaining ~3,317 involve interpolated points and are never constrained. This means ~50% of chain continuity is structurally unenforceable.

The accounting:
- Primary edges: 3,269 total → 3,162 enforced, **107 missing** (3.3%)
- Interpolated edges: ~3,317 total → 285 accidentally enforced, **~3,032 missing** (91.4%)
- Combined: 3,139 missing / 6,586 total = 47.6%

### RC-3: Companion Vertex Density Creates Extreme Slivers

**File**: `OuterWallTessellator.ts:388-461`

With `density=12`, each chain point gets up to 24 companion vertices (12 per side). Grid cells are ~0.00173 wide in U. A centered chain point creates companions at:
- Left side: 12 points in ~0.00087 U-span → spacing ~0.000073
- Right side: 12 points in ~0.00087 U-span → spacing ~0.000073

T-spacing between rows: 1/313 ≈ 0.0032.

**Minimum expected aspect ratio**: 0.0032 / 0.000073 ≈ **43.8:1**

This perfectly explains the measured quality:
- `avg_aspect = 19.3:1` (dragged down by grid-only triangles)
- `violations(>4:1) = 253,502 / 288,191 = 88.0%`
- `min_angle = 0.0°` (collinear companion points)

130,478 companion vertices exist to provide "density support" for CDT. But **CDT is never used** (`cdt=0` in stats). The companions are pure dead weight in sweep mode — they add vertices without improving triangle quality.

### RC-4: No Actual CDT In The Hot Path

**Stats**: `mode=sweep-repair, cdt=0, sweep=5,642, fallback=0, repair=0`

The pipeline is configured for sweep-repair mode. CDT mode would enforce Delaunay angle constraints and produce better-shaped triangles, but it's disabled. The "repair" step only detects winding inversions and flips them — it cannot restructure the topology.

Without CDT:
- No angle quality guarantee
- No constraint edge enforcement
- Companion vertices serve no purpose (they exist for CDT density)

### RC-5: Post-Hoc Optimizers Cannot Fix Structural Problems

The downstream optimizers are working hard but failing:
- **chain-directed flip**: 2 diagonals (on 18,820 locked quads) — nearly zero impact
- **3D edge flip**: 81,757 quality flips — lots of work, minimal improvement on chain-strip region
- **chain-strip 3D edge flip**: 165,804 flips, but still 88% violations after
- **Aspect rejects**: 141,209 — optimizer can't flip because the alternatives are even worse

The fundamental topology is wrong. Edge flips can improve an already-decent triangulation but cannot rescue one where 47.6% of the structural edges are missing.

---

## 3. Validation Failure Breakdown

```
manifold=false   — 49 non-manifold edges (from missing chain edges creating holes)
degenerates=true — 74 stripped (from collinear companion points)  
normals=false    — 145,062 inverted triangles, 13,240 inconsistent normal pairs
quality=false    — min_angle 0.0°, max_aspect 39,672.5
fidelity=false   — p999 norm 152.2° (surface normal wildly wrong)
seam=false       — pos gap 11.495mm (chain-strip seam gap!)
distortion=true  — (only metric passing is distortion)
```

The 145,062 inverted triangles are particularly telling — sweep-repair's winding fix reports `repair=0`, meaning the inversions are NOT simple winding errors that flip can fix. They're structural — the triangulation connects vertices in geometrically impossible configurations because it's ignoring constraint edges.

---

## 4. The Core Architectural Problem

The current chain-strip pipeline has an **internal contradiction**:

1. **Companion vertices exist for CDT** — they provide the local vertex density that CDT needs to create well-shaped triangles around chain features
2. **CDT is disabled** — sweep mode is used instead
3. **Sweep ignores constraints** — it partitions by constraint midU but doesn't enforce them
4. **Companions in sweep mode create slivers** — without CDT's angle optimization, the dense vertex cloud produces microscopically thin triangles

The system is paying the computational cost of CDT (130K companion vertices, 367K total verts) while getting the quality of a naive sweep (88% violations, 47.6% missing edges).

---

## 5. Questions For Generator

### Q1: CDT vs Sweep — Which Path Forward?

Two fundamentally different strategies:

**Option A**: Enable CDT properly. This means:
- Addressing the `cdt2d` dependency issues that led to its removal
- OR implementing a lightweight 2D CDT (Sloan's algorithm, ~300 lines)
- Companions would serve their intended purpose
- Constraint edges would be guaranteed
- But: CDT is O(n log n) per strip vs O(n) for sweep — 5,642 strips × avg ~51 verts = performance concern?

**Option B**: Fix sweep to actually enforce constraints. This means:
- After greedy sweep, check each constraint edge
- If missing, find the two triangles spanning the edge and flip/restructure
- Massively reduce companion density (they're useless in sweep)
- Simpler, faster, but still no angle quality guarantee

**Option C**: Hybrid — use sweep for unconstrained regions, CDT only for chain cells. This means:
- Identify strips with chain vertices (currently ~87,367 chain cells)
- Use CDT in those strips only, sweep everywhere else
- Best of both worlds? Or worst-of-both complexity?

### Q2: Companion Density
If we keep sweep: what should `density` be? Current `12` creates 24 verts per chain point. Could we drop to `density=1` (2 verts) or `density=0` (none) in sweep mode?

If we enable CDT: what density is optimal? The CDT angle bound improves with more points, but diminishing returns above ~4-6.

### Q3: Interpolated Edge Constraints
The `pointIdx < 0` filter (OWT L857) drops ~50% of chain continuity edges. Should ALL chain edges be constrained, or is there a principled reason to exclude interpolated ones? The current comment says they "participate freely" — but freely means randomly.

### Q4: Seam Gap (11.495mm)
The seam position gap is **enormous** — 11.5mm. This isn't chain-related; it's likely the `SEAM_GUARD = 0.3` companion exclusion zone creating an untriangulated gap at U=0/1. Is this a known issue or a regression?

---

## 6. Recommended Investigation Order

If I were the Generator, I'd explore in this order:

1. **Drop companion density to 0 in sweep mode** — eliminate 130K pointless vertices, see if quality improves (fewer slivers) or degrades (holes)
2. **Add interpolated edges as constraints** — remove the `pointIdx < 0` filter, pass all chain edges
3. **Add constraint verification to sweep** — after sweepRegion, check if constraint edge exists, force-split if not
4. **If (1-3) insufficient: implement minimal CDT** — Sloan's incremental CDT, ~300 lines, no external dependency

---

*Executioner out. The chain linking is done. The tessellation needs a Generator proposal.*
