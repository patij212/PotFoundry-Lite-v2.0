# S92 — THE CONSTRAINED FLIP'S 3.73× IS A CENTROID-RULER ARTEFACT. ON THE COVERING RULER IT IS 1.05×.

**And on Voronoi it is 0.984× — below one.**

Tool `research/tools/s92FlipCoveringRescore.ts`, runner `run-s92-flip-covering.sh`.
Reports: `S92_FLIP_COVERING_GOTHIC.report.txt`, `S92_FLIP_COVERING_VORONOI.report.txt`.

## The claim under test, and why it deserved a re-score

S80/S81 banked the constrained flip at **3.73× by AREA on Gothic S39CTL** (over-bar orientation area
8.131% → 2.179% = 73.2% of the over-bar area removed). `S88_REVIEW_FINDINGS.md` §6 then used that figure
as the bar a ranking key would have to clear, and killed H-R2b on it:

> *"a perfect key handed a 1%-of-mesh budget can remove at most that, against the flip's already-banked
> **3.73× (73.2% of the area)** obtained with no key at all"*

**S88 §9 disclaimed the number in the same document:** *"I did not re-run or re-validate the flip. S80's
3.73x is quoted as published"* and *"I did not check whether the flip's 3.73x survives on `_S39CTL`."*

**The reason to doubt it is structural, not statistical.** The 8.131% → 2.179% is expressed in
`landFlipPass.orientOf` = `normAngOf`, the angle between the facet normal and the surface normal **at the
centroid only** (its own docstring: *"5 rA evals"*). That same quantity is ALSO the flip's C1 accept test
and its ranking key. The pass therefore optimises the centroid measure directly — and a re-cut diagonal
is precisely the operation that can fix a facet's centroid normal while its interior stays wrong. S87 had
already measured this ruler **21.6× low as a level** on this exact mesh.

An improvement measured in the currency the optimiser maximises is not evidence about the surface.

## Method — the ruler is the ONLY thing that varies

Same two STLs the figure was banked on (the S39CTL input, and `s80land/..._GATE.stl`, the H-L4-GATE
artefact, md5 `abbcb74f…`); ONE golden-ratio-stride sample of 60,000 facet INDICES drawn once and scored
on BOTH meshes (the flip rewrites slots in place, so index *k* in AFTER descends from index *k* in
BEFORE); both rulers and the area on every facet; covering construction copied from `s70OrientCensus` —
`orientOfFacet`, k=8, inset 0.02, `orient:'outward'`, `fdNormalsCentral`, theta unwrapped by `dThRaw`.

## RESULT

### GothicArches `S39CTL` — 1,142,166 facets, 60,000 sampled (5.253%)

| ruler | BEFORE | AFTER | ratio by AREA | ratio by COUNT |
|---|---|---|---|---|
| **CENTROID** (the banked currency) | 8.0470% | 2.0891% | **3.852×** | 3.611× |
| **COVERING** (`orientOfFacet`) | 43.2203% | 41.1638% | **1.050×** | 1.219× |

- over-bar **level** 5.37× higher on the covering ruler
- covering **max is unchanged: 1706.3 µm before AND after** — the worst facet is untouched
- "73.2% of the over-bar area removed" is really **4.8%**

### Voronoi `voronoi_ring_D--` — 806,765 facets, 60,000 sampled (7.437%)

| ruler | BEFORE | AFTER | ratio by AREA | ratio by COUNT |
|---|---|---|---|---|
| **CENTROID** | 12.6636% | 7.6547% | **1.654×** | 1.325× |
| **COVERING** | 37.9430% | 38.5435% | **0.984×** | 1.085× |

**By area the flip makes Voronoi's covering orientation slightly WORSE.** Level gap 3.00×.

## Three independent checks that the probe is sound

1. **Non-vacuity, per mesh, PASSES on both.** The centroid column reproduces each mesh's banked pair:
   Gothic 8.0470/2.0891 against 8.1307/2.179 (ratio **3.852× vs banked 3.731×**); Voronoi 12.6636/7.6547
   against 13.139/7.960 (ratio **1.654× vs banked 1.651×**). This tool is measuring what S80 measured.
2. **The covering column reproduces S87's whole-mesh figure** from a separately written tool:
   61.080% over-bar by COUNT here vs S87's **61.3296%**, and 43.2203% by AREA vs **43.49037%**.
3. **S91's independent sample agrees** — 61.43% / 43.28% at the same k=8, inset 0.02.

> A defect in my own tool, caught and fixed before publishing: the non-vacuity block originally hardcoded
> Gothic's 8.131/2.179 and so printed a 55%/251% "failure" on Voronoi, whose banked pair is 13.139/7.960.
> A check that reports failure for the wrong reason is as useless as one that reports a pass for the wrong
> reason. The reference is now per-mesh and explicit, and its ABSENCE is printed rather than assumed.

## CONSEQUENCE FOR S88 §6

§6's kill line for H-R2b is that a key must beat the flip's banked **73.2% of the over-bar area**. The
real figure on a covering ruler is **4.8%** — the baseline is **~15× too generous by area**. §6's
conclusion, *"A KEY UNLOCKS ZERO OVER THE FLIP"*, does not follow from the evidence it cites. It is not
refuted here either — it is **unsupported**, and needs re-deciding against 4.8%.

## WHAT THIS DOES AND DOES NOT TOUCH

- **Does NOT touch S86/S88/S89.** Those are cost levers, each gated on a byte-identical mesh; they change
  how fast the pass runs, never what it produces, and they make no claim about whether it is worth running.
- **Does NOT say the flip is harmful on Gothic.** 1.050× by area and 1.219× by count are still ≥ 1, at
  zero triangle cost and with topology preserved. It says the flip is a *small* lever, not a 3.73× one.
- **DOES retire "3.73× by AREA" as a statement about the surface.** It is a statement about the centroid
  key the pass optimises. Every downstream argument that used it as a baseline needs re-checking —
  §6 is the one found so far.
