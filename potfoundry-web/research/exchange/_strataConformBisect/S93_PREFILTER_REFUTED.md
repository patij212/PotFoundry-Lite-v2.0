# S93 — THE PER-POINT ORIENTATION PREFILTER IS REFUTED ON ITS OWN KILL LINE (1.78% vs ≥25%)

**And its missing curvature term is not hypothetical — the θ→0 counterexample was observed.**

Probe `research/tools/s93PrefilterProbe.ts`, runner `run-s93-prefilter-probe.sh`, report
`S93_PREFILTER_PROBE.report.txt`. **`certifyTriangle` was NOT modified** — the question is answerable
read-only, so nothing was risked to answer it.

## What was proposed

S90 measured `tighten` at **95.68% / 97.85% of ALL rA evals** (independently reproducing S50's 95.22%
on two meshes with a different instrument) and concluded — correctly — that *the cost is inside each
facet, not in which facets you pick.* Its pre-registered successor:

> for any point p of the facet, with v its NEAREST VERTEX: `dist(p, S) <= tan(theta) * |p - v|`
> … as an extra `min(...)` in `certifyTriangle`'s pass-2 threshold test, pruning points that provably
> cannot reach `thresh` before `tighten` is ever called. **Zero rA evals** once θ is known (15/facet at
> k=1). Predicted **40–60% cut of the tightening budget**, i.e. 1.7–2.5× on 96% of the cost.
>
> **KILL:** `bound`/`witnessed` moves beyond the f64 determinacy band on ANY facet, **OR the
> tighten-call count falls by less than 25%.**

## Why it was probed rather than patched

`orientRuler.ts:31` states this family's own sound facet-level construct as
`bound = normRad + kappa * cov` — **it carries a CURVATURE term.** The proposed per-point bound has
none, and θ→0 is a counterexample in principle: a facet lying in the tangent plane at `v` gets
`tan(θ)·|p−v| = 0` while the surface sags by ~κL²/2 > 0.

It is rescued **only if θ is a genuine SUP over the footprint** — 1-D circular arc, chord D:
`tan(θ*)·(D/2) = κD²/4` against a true sag of `κD²/8`, sound with 2× slack. But S90 specifies θ from a
**k=1 lattice (3 points)**, and a finite lattice max is a *lower* bound on the sup (`normRad`'s own
docstring says so). With a lower bound in place of the sup, the rescue does not apply.

So soundness was treated as a hypothesis. Both the cheap θ (k=1, as pre-registered) and a higher-k sup
(k=8) were measured, so the answer distinguishes *"the idea is wrong"* from *"the cheap θ is wrong"*.

## RESULT — GothicArches `S39CTL`, 400 facets sampled, 12,106 pass-2 candidate points

| θ source | would prune | soundness violations |
|---|---|---|
| **k=1 — as pre-registered** | **215 / 12,106 = 1.78%** | 3 (0.02%) |
| k=8 — sup, for contrast | **215 / 12,106 = 1.78%** | 3 (0.02%) |

### ⇒ KILLED on the pre-registered line: 1.78% against a required ≥25%.

Not marginal — an order of magnitude short, and **identical at k=1 and k=8**, so it is not a precision
problem in θ. Raising θ's quality changes nothing.

### THE STRUCTURAL REASON, which is the part worth keeping

**The prefilter's discriminating power is anti-correlated with the population it is applied to.** A
point only reaches pass 2 if its cheap radial reading already exceeds `thresh` — i.e. exactly where
orientation is bad and/or the point sits far from a vertex, which is exactly where `tan(θ)·|p−v|` is
LARGE. The points this bound could prune are overwhelmingly points that never entered pass 2 at all.
The inequality is fine; it simply does not separate the population it was aimed at.

### And the missing curvature term is real, not theoretical

3 violations in 12,106. The worst: **`ub` ≈ 0 against `dTrue` = 0.0013 µm** — the bound returns
essentially ZERO where the true distance does not. That is precisely the θ→0 case the missing κ term
predicts, observed.

**Stated honestly: at this tolerance the violations are harmless.** 1.3 nm against a 10 µm bar is a
7,700× margin, so this would not have produced a false PASS on these meshes. But the bound is
*structurally* unsound — it can read zero where the truth is not — so its safety is a property of the
current tolerance, not of the inequality, and it would erode as `tol` shrinks or curvature grows. It
should not be relied on even where it happens to prune.

**Reference caveat, stated up front:** `distGlobal` is itself an upper bound (global scan + local
descent), so `ub < dTrue` is strong evidence of a violation rather than a proof, and zero violations
would have been evidence about the sampled population, never a theorem.

## WHAT SURVIVES, AND WHAT IS NOW OPEN

**S90's diagnosis stands and is untouched by this:** `tighten` is 96–98% of the campaign's dominant
compute, and *selecting which facets to certify was always the wrong axis*. That is the durable finding.

**Its remedy is dead.** The 96% has to be attacked **inside `tighten`** — and the obvious move there,
truncating the (40,40) descent/Newton counts to (8,16), is ALREADY REFUTED by V3/V7c
(`_facetTruthLib.ts:417-427`: the thin-ridge fixture moved 12.041 → 27.103 µm). So the two obvious
attacks on the campaign's dominant compute are both now closed, from opposite directions:

| attack | verdict |
|---|---|
| pick fewer facets to certify | wrong axis (S90) |
| prune points before `tighten` on an orientation bound | **1.78%, REFUTED (S93)** |
| truncate `tighten`'s iteration counts | REFUTED by V3/V7c |

**What is left is genuinely open**, and none of it is cheap: a different per-point bound that DOES
carry curvature (κ is style-dependent and nobody has computed a valid one here); a cheaper `distLocal`
inner loop; or parallelism — which is the one axis already proven to work, at 5.27×/arm
(`PF_S85_WORKERS`, S88/S89). **On present evidence, throwing cores at the audit is the only lever with
a measured win; the analytic ones are all closed.**
