# Master Approval — R25 Companion Coverage Gaps

Date: 2026-03-06

## Decision: APPROVED (P4 = P1 + P2 combined, with Verifier amendments)

## Unanimous Agreement Status

- **Generator**: Proposed 4 strategies; recommended P2 primary, P1 secondary
- **Verifier**: Accepted P1 + P2 with amendments A1 (Map lookup) and A2 (boundary sentinels); rejected P3 (fatal buffer flaw)
- **Executioner**: Not yet dispatched — approval triggers implementation
- **Master**: APPROVED — P1 + P2 combined

## Rationale

1. **R24.1 was wrong.** Independent CDT normalization degraded every metric: violations 50.4% → 54.2%, maxAspect3D 3,350 → 8,089, manifold true → false. The original uniform scaling comment was correct. R24.1 has been reverted.

2. **The root cause is companion coverage gaps.** With PROMO_EPSILON=0 (R24), chain vertices sit on the boundary. Between companion clusters around chain vertices (spaced ~34 columns apart), wide U-gaps exist with ONLY boundary vertices at T=0 and T=1. The CDT creates full-band-height diagonal connections in these gaps → slivers. The user's observation of "purely horizontal lines running from the base mesh to the feature edges" directly describes this geometry.

3. **P1 is zero-risk, high-value.** Removing `Math.min(3, nShells)` extends T-ring coverage from inner 3 shells (fractions 0.04–0.16, covering 16% of strip half-width) to all 7 shells (covering 100%). Combined with doubling MAX_TRING_PER_BAND to 48, this adds companion density at the mid-to-outer shells where the density cliff is sharpest (shells 4–6 currently get only nT=1 from the main loop). Two-line change with no architectural risk.

4. **P2 directly targets the structural gap.** Gap-fill companions at T=1/3 and T=2/3 guarantee no companion-free U-interval wider than 3 grid cells. This converts single-stratum full-band triangles into 3-stratum subdivisions with worst-case aspect ≈ 1.5:1 per stratum. The function works post-hoc on already-generated companions, is gap-driven (not chain-centric), and adds <1% companion count increase.

5. **Combined (P4) maximizes impact with minimal risk.** P1 densifies near chains; P2 fills between chains. Together they eliminate companion-free zones entirely. After two rounds of insufficient single-strategy fixes (R24 brought violations from 55.6% to 50.4%; R24.1 made things worse), a comprehensive approach is warranted.

6. **P3 is correctly rejected.** The Float32Array vertex buffer is fixed-size at allocation time (OWT line 915). Dynamic vertex insertion during CDT building would silently overflow the buffer — writes beyond the typed array length are no-ops in JavaScript, producing zero-coordinate ghost vertices and degenerate geometry. Fatal flaw with no clean in-scope fix.

## Conditions

### P1 Implementation
1. Change `Math.min(3, nShells)` → `nShells` at OWT line 718 (T-ring shell loop)
2. Change `MAX_TRING_PER_BAND = 24` → `MAX_TRING_PER_BAND = 48` at OWT line 582

### P2 Implementation
1. New function `emitGapFillCompanions()` (~35 lines) inserted after the main companion loop (after the `for (const cv of chainVertices)` loop ending ~line 828) and before `allChainVertices` construction (line 829)
2. **Amendment A1**: Pre-build `Map<number, ChainVertex>` keyed by `rowIdx` for O(1) parent lookup. Do NOT use `chainVertices.find(...)` (O(n) per call → quadratic)
3. **Amendment A2**: Low priority — strip-boundary sentinels. Shell 6 (fraction=1.0) already covers strip edges in most cases. Implement only if test results show edge-case gaps
4. Constants: `FILL_GAP_THRESHOLD = 3.0 / numU`, `FILL_T_FRACTIONS = [0.33, 0.67]`
5. The function must bucket existing companions from `companionVertices` (which has explicit `.t` fields) by band, scan for U-gaps, and fill via `tryEmitCompanion()`
6. The function runs BEFORE `allChainVertices` construction so gap-fill companions are captured in `interiorByBand`

### Validation Protocol
- [ ] All existing tests pass (vitest)
- [ ] Run export with default 8-petal style
- [ ] Chain-strip violation rate target: <25% (currently 50.4%)
- [ ] Companion count: expect +2-4K for P2, +15-25K if P1 also applied
- [ ] manifold = true, non-manifold = 0
- [ ] Export time increase < 10%
- [ ] Visual: absence of horizontal lines from grid to chains

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| P1 creates too many companions | Low | Budget capped at 48 per band | Dedup + budget cap |
| P2 gap-fill misses bands with zero companions | None | Those bands use simple quads, not CDT | By design |
| Companion count explosion in sparse-chain styles | Medium | Verifier noted 18K+ possible | Monitor total count in logs |
| Performance regression from gap-fill scan | Low | Single pass over companionVertices (~310K) | Acceptable overhead |
| Manifold regression | Low | More interior vertices should improve, not degrade | Validate explicitly |

## Implementation Order

1. **Changeset 1 (P1)**: Two-line change in OuterWallTessellator.ts — constants
2. **Changeset 2 (P2)**: New `emitGapFillCompanions()` function — ~35 lines
3. Run tests
4. User validates with export

---

*Master signing off. This is the third iteration on chain-strip quality (R24 improved but fell short at 50.4%, R24.1 was wrong and reverted, R25 addresses the structural root cause). The Generator correctly identified companion coverage gaps as the mechanism. The Verifier confirmed P2 as the most effective implementable fix and caught a fatal flaw in P3. I'm approving the combined P4 approach because we've learned that partial fixes leave exploitable gaps — comprehensive coverage is the right strategy here.*
