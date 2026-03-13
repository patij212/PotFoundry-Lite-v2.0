# Master Approval — Round 21: Chain-Shadow Boundary Enrichment
Date: 2026-03-05

## Decision: APPROVED WITH CONDITIONS

## Unanimous Agreement Status
- Generator: Proposed P1 (chain-shadow boundary vertices via Q1b buildMergedRow integration)
- Verifier: ACCEPT WITH AMENDMENTS (C1: colHasChain marking, C2: self-row exclusion, C3: array trim)
- Executioner: Pending
- Master: APPROVED — all Verifier amendments adopted

## Rationale

R20 activated the d8/e4 configuration and delivered 6× more companions (294,626 vs 47,970), but 45.1% of chain strip triangles remain slivers. The root cause is structural: CDT strip boundaries contain only grid vertices, so CDT fans feature-promoted chain vertices out to distant grid columns regardless of interior companion density. Shadow boundary vertices at feature U-positions create direct chain→shadow connections, eliminating the fan pattern.

The Q1b strategy (pre-inserting shadows into `buildMergedRow`) is architecturally correct —
it ensures shared vertex indices across adjacent bands and prevents T-junctions. The Verifier's three amendments are all correct and mandatory.

## Conditions (adopted from Verifier)

### C1: Self-row exclusion (Verifier C2)
Phase A MUST only project shadows to adjacent rows `[row-1, row+1]`, NOT the chain's own row. On the chain's own row, the chain vertex IS the feature — a shadow at the same U would replace it in buildMergedRow's dedup pass, destroying D-Radical interior promotion.

### C2: Mark shadow columns in rawColHasChain (Verifier C1)
After the existing rawColHasChain population loop and BEFORE the Pass 2 union, mark shadow columns so both adjacent bands use CDT instead of standard cell triangulation. Without this, shadows on non-chain rows create T-junctions.

### C3: Trim vertex array (Verifier C3)
Before returning from `buildCDTOuterWall`, trim the vertices array to actual `nextShadowIdx * 3` to prevent GPU waste evaluating dead zero-filled vertices.

### C4: Diagnostics logging
Log shadow allocation statistics after Phase B.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| T-junction at non-chain rows | Blocked by C2 (rawColHasChain marking) |
| Chain vertex replaced by shadow | Blocked by C1 (self-row exclusion) |
| GPU waste on unused shadow slots | Mitigated by C3 (array trim) |
| Shadow dedup with UV-snapped grid | Low — buildMergedRow dedup handles correctly |
| Performance | Negligible — ~400 shadow vertices max |

## Implementation Order (Executioner Marching Orders)

### Changeset 1: Phase A — Pre-compute shadow U-positions
- Location: After companion diagnostics (~line 856), before vertex array allocation
- Iterate `allChainVertices` where `cv.t === undefined`
- For each, project U to `[cv.rowIdx-1, cv.rowIdx+1]` only (NOT self-row per C1)
- Sort, dedup per row at 1e-6 threshold
- Filter out shadows coincident with grid columns (bsearchFloor check)
- Count totalShadowCount for allocation

### Changeset 2: Phase B — Vertex array allocation + shadow vertex creation
- Modify vertex array allocation: add `totalShadowCount` to size
- After topDup allocation, allocate shadow vertices starting at `totalVertexCount + rowBoundaryCvCount`
- Store in `shadowVertexMap: Map<string, number>` keyed by `"row:u"`
- Fill vertex positions (u, t=activeTPositions[row], surfaceId)

### Changeset 3: Mark shadow columns in rawColHasChain (C2)
- Location: After the rawColHasChain population loop, before Pass 2 union
- For each shadow in rowShadowUs, mark the containing column in rawColHasChain

### Changeset 4: Phase C — Integrate shadows into buildMergedRow
- Add shadow interleaving after chain vertex interleaving
- Shadows are `isChain: false` with appropriate `gridCol`
- Existing sort+dedup pass handles ordering

### Changeset 5: Array trim (C3) + diagnostics (C4)
- Before return, trim vertices array to nextShadowIdx * 3
- Log shadow count after Phase B

### Key invariants to verify:
- Chain vertices at their own row remain `isChain: true` (self-row exclusion)
- All shadow columns trigger CDT (rawColHasChain marking)
- Boundary polygon integrity (stripBot/stripTop sorted, no duplicates)
- D-Radical topDup indices unchanged
- Constraint edges unaffected (shadows are never constraint endpoints)
