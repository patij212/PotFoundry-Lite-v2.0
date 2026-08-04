# Strata AR50 / feature-corridor debate

Date: 2026-08-03  
Scope: GothicArches Strata ring, exact constraint recovery and residual feature-corridor facets  
Status: unanimous research-only approval with a corrected mechanism

## Evidence agreed by all roles

- The registered 2 um conditioning rung recovered 12,955/12,955 constraints and ended with zero proper PSLG crossings.
- Historical exact-one failures (for example 13,411/13,412 and 13,514/13,515) were deterministic non-planar-PSLG witnesses, not acceptable numerical noise.
- The missing arm in the localized witness properly crossed a recovered arm. Stage-3 welding/rerouting had destroyed the shared junction identity before `cdt2d`.
- The final planarity guard repairs the failing configurations by splitting both arms at one shared vertex. A result such as 13,999/14,000 must always fail closed.
- The same `pslgEpsMm` currently controls two different policies: local PSLG conditioning and free-point/segment clearance. Reducing it can retain exact recovery while sharply worsening seed aspect ratio.
- Existing longest-edge preference and protector recursion already exercise much of the suggested AR50 fallback. At production sites the recursive protector was self-blocked at 96.6%, so a direct branch or a deeper retry is not a new solution.

## Generator

Proposed an atomic constraint-obligation LEPP transaction. Trigger before a proposed child crosses the hard AR cap, clone the complete local feature corridor, and allow temporary shape/crossing obligations only in scratch state. Preserve stable constraint identities, use true physical longest-edge midpoint propagation, and split every crossed feature at one analytic shared vertex. If LEPP cannot close at a feature junction or frozen boundary, expand to a multi-ring constrained sector cavity with on-feature and interior Steiner points.

Generator acceptance condition: commit only with 100% named constraint-chain recovery, zero residual crossings, shipped-f32 AR <= 50 (internal target <= 45), no fold/backface/topology/seam change, an unchanged cavity boundary, and no visual-certificate regression.

## Verifier

Rejected a literal “once AR reaches 50, call the current longest-edge splitter” change. Longest-edge bisection retains an endpoint angle in one child and therefore cannot guarantee removal of a sliver. Acute required feature sectors can make any requested minimum-angle target geometrically infeasible. The current live-mesh cascade also leaves already-committed protector splits when a later objective fails, which is incompatible with temporary invalidity.

Verifier path to acceptance: temporary violations may exist only in a private candidate; retain explicit feature obligations; freeze the complete directed outer boundary; planarize crossings before CDT; require byte-identical rollback; and certify constraints, topology, admission, shape, visual error and determinism before an atomic commit.

## Executioner

Production integration is rejected at this stage. The driver currently stores feature membership primarily as vertex booleans and does not retain enough original constraint identity for the requested proof. Retrofitting permissive live mutation into `bisectAt` would broaden the blast radius and make rollback unreliable.

A bounded research implementation is feasible by reusing the existing scratch transaction patterns and the already-tested `corridorPaveMulti` kernel. The implementation should:

1. extract a connected bad-facet component and grow complete triangle rings;
2. freeze and hash the directed cavity boundary;
3. carry named internal feature chains and junction identities into a planar PSLG;
4. generate several constrained-Delaunay candidates with metric-scaled Steiner spacing;
5. optionally run true-midpoint longest-edge closure inside scratch for residual AR obligations;
6. return a proposal, never mutate the caller;
7. reject on ring/vertex/iteration caps with the exact remaining obligation.

Initial limits: two rings, 256 parent faces, 2,048 new vertices, deterministic edge/id ordering, internal AR target 45, hard shipped cap 50. The first integration remains behind a research flag and targets the 23 S40 facets above 125 um.

## Master decision

Approved the transactional corridor-sector experiment unanimously; rejected the direct AR50 switch unanimously.

The correctness hierarchy is:

1. final PSLG planarity and named constraint recovery are binary preconditions;
2. cavity boundary and manifold topology are immutable transaction invariants;
3. every shipped triangle must pass hard shape, orientation and admission gates;
4. visual error and minimum angle choose among already-correct candidates;
5. longest-edge bisection is a candidate-closure tool, never the certificate.

“Every triangle perfect” is defined operationally by the final certificate rather than mathematical exactness against a curved surface. If an acute feature sector or frozen boundary makes AR50 impossible, the correct output is an infeasibility witness and rollback, not a hidden constraint loss or an over-cap facet.

## Required test matrix

- replay the historical exact-one failures with the final planarizer off/on;
- replay the 2 um rung and keep 100% recovery while decoupling conditioning from clearance;
- synthetic X/T/Y junction, loop, seam/rim, near-coincident and acute-sector cavities;
- an AR49 proposed split that fails one-step gating but closes transactionally;
- failure injection proving byte-identical rollback;
- zero proper final crossings and exact recovery of every named chain;
- shipped-f32 AR/fold/backface, boundary, Euler, component and non-manifold gates;
- deterministic hashes under repeated runs and permuted input ordering;
- exact S30/S40 Gothic replay followed by cross-style adversarial runs.
