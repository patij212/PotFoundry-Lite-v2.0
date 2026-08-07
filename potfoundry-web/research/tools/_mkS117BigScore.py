"""Generate research/tools/s117BigScore.ts as a PROVABLE one-line delta from s116zFinalScore.ts.

Kept in-tree so the claim "exactly one import line changed" is reproducible rather than asserted.
Run from the package root:  python research/tools/_mkS117BigScore.py
"""
import sys

HDR = """// s117BigScore.ts — S117 P0: THE HONEST FINAL SCORECARD, FOR MESHES ABOVE THE 2^23 EDGE CEILING.
//
// THIS IS `research/tools/s116zFinalScore.ts` WITH EXACTLY ONE LINE CHANGED — the dihedral import.
// Reproduce with `python research/tools/_mkS117BigScore.py`; the only deltas are this header block and
//     -import { facetDihedrals } from '../bridge/dihedralRuler';
//     +import { facetDihedralsBig as facetDihedrals } from '../bridge/dihedralRulerBig';
// Nothing else. That is deliberate and load-bearing: P0 asks for the shipping CelticTriquetra, the
// shipping GothicArches and the two research-driver meshes to be reported SIDE BY SIDE ON ONE
// INSTRUMENT, and a re-implemented scorer would not be one instrument.
//
// WHY IT WAS NEEDED. `facetDihedrals` pairs half-edges through a V8 `Map`, which caps at 2^23 =
// 8,388,608 entries (MEASURED). The shipping CT outer wall is 6,767,774 facets => ~10.15 M unique edges,
// so the S117 scorecard run for it died with `RangeError: Map maximum size exceeded` at
// dihedralRuler.ts:113, AFTER printing PRECOND and BEFORE topology, dihedral, folds, blades, position
// and orientation. The shipping Gothic wall (1,415,280 facets => 2.12 M edges) fits, which is exactly
// why only the CT half was missing. `facetDihedralsBig` is the same geometry over a counting-sort CSR
// instead of a Map; research/bridge/dihedralRulerBig.test.ts asserts field-for-field equivalence with
// `facetDihedrals` on closed / open / mis-wound / non-manifold / soup fixtures and proves the old ruler
// throws on a >2^23-edge grid where the new one returns the closed-form Euler counts.
//
// CONTROL FOR THIS TOOL (run it before believing any number it prints): score
// celtictriquetra_ring_D--H_S102.stl with it and diff the report against the one s116zFinalScore
// produced for the same mesh. Same instrument, different container => the reports must be identical.
//
// Usage: bash research/tools/run-s117-bigscore.sh   (same env vars as run-s116z-final.sh)
"""

OLD = "import { facetDihedrals } from '../bridge/dihedralRuler';"
NEW = "import { facetDihedralsBig as facetDihedrals } from '../bridge/dihedralRulerBig';"

with open("research/tools/s116zFinalScore.ts", encoding="utf-8") as fh:
    src = fh.read()

if src.count(OLD) != 1:
    sys.exit("expected exactly one dihedral import, found %d" % src.count(OLD))

with open("research/tools/s117BigScore.ts", "w", encoding="utf-8", newline="") as fh:
    fh.write(HDR + src.replace(OLD, NEW))

print("s117BigScore.ts written; header lines = %d" % HDR.count("\n"))
