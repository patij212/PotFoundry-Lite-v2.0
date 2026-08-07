// s117VisBarKernel.ts — S117 P5. THE QUANTITY THE 45 DEG BAR WAS STANDING IN FOR.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY. From S109 to S116 every "visible class" figure in this campaign was `adjacent dihedral > 45 deg`.
// That constant is the LAST ROW OF S108's REPORTING LADDER (bars 1 / 5 / 20 / 45 on
// gothicarches_ring_DS-HT_S39CTL.stl, commit 5caba0b0); s109CreaseCrossTab.ts:52 turned it into a default
// and every later tool inherited it verbatim. It was never tied to an observation, and S108's own text
// said so ("Choose the bar as a cost/quality decision; do not expect it to remove what you can see").
//
// A dihedral is not what an observer detects. An observer detects a LUMINANCE STEP. For flat shading the
// step across a shared edge is exactly
//
//     dL = (1-a) * (n1 - n2) . d = (1-a) * 2*sin(delta/2) * cos(psi)
//
// where `a` is the ambient fraction, `d` the light/view direction (a headlight, as in every preview and in
// research/tools/s116Render.ts), `delta` the dihedral and `psi` the angle between `d` and the unit
// difference of normals. THE COSINE IS THE WHOLE POINT: the same dihedral produces an arbitrarily large or
// arbitrarily small step depending on where the pair sits relative to the light. `cos(psi)` is a factor of
// the mesh's ORIENTATION, not of its dihedral, so NO SINGLE DIHEDRAL NUMBER CAN BE A VISIBILITY BAR.
//
// Detection threshold is on the WEBER contrast C = dL / Lmean, not on dL: the eye's step-edge threshold is
// ~1% of the local adapting luminance across the photopic range.
//
// EXACT, NOT SMALL-ANGLE. `2*sin(delta/2)` is the exact chord |n1 - n2| for unit normals, and the
// projection onto `d` is exact, so `contrastOfPair` is closed-form for any dihedral including 179 deg.
// `dihedralForContrast` inverts it in closed form and the test asserts the round trip to 1e-12 rad.
//
// SCOPE. This kernel knows nothing about the analytic surface, so it cannot inherit the rA /
// style-params / tread-vertex confounds. It is the mesh and the light, and nothing else.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════

export type V3 = [number, number, number];

/** Lambertian luminance with an ambient floor. lam = n.d, clamped at 0 (a facet turned away is ambient). */
export function lumLambert(lam: number, ambient: number): number {
  return ambient + (1 - ambient) * (lam > 0 ? lam : 0);
}

/**
 * Weber contrast of a step between two luminances, normalised by their MEAN.
 * Mean rather than background because a facet pair has no "background": both sides are signal.
 * Range [0, 2]; 2 is a black/white step.
 */
export function weber(l1: number, l2: number): number {
  const m = 0.5 * (l1 + l2);
  return m > 0 ? Math.abs(l1 - l2) / m : 0;
}

/**
 * Weber contrast of the shading step across a shared edge, under a headlight along `d`.
 * Returns NaN when either facet is back-facing to `d`: only one side of the crease is then on screen,
 * so there is no step to detect and averaging a one-sided value in would be a fabrication.
 */
export function contrastOfPair(n1: V3, n2: V3, d: V3, ambient: number): number {
  const lam1 = n1[0] * d[0] + n1[1] * d[1] + n1[2] * d[2];
  const lam2 = n2[0] * d[0] + n2[1] * d[1] + n2[2] * d[2];
  if (!(lam1 > 0) || !(lam2 > 0)) return NaN;
  return weber(lumLambert(lam1, ambient), lumLambert(lam2, ambient));
}

/**
 * The dihedral that produces Weber contrast `C` at mean facet luminance factor `lamMean` and geometry
 * factor `cosPsi`. Closed-form inverse of `contrastOfPair`:
 *     C = (1-a)*2*sin(d/2)*|cosPsi| / (a + (1-a)*lamMean)   =>   d = 2*asin( C*(a+(1-a)*lamMean) /
 *                                                                            (2*(1-a)*|cosPsi|) )
 * Returns NaN when the requested contrast is unreachable at that geometry (argument of asin > 1).
 */
export function dihedralForContrast(C: number, ambient: number, lamMean: number, cosPsi: number): number {
  const denom = 2 * (1 - ambient) * Math.abs(cosPsi);
  if (!(denom > 0)) return NaN;
  const s = (C * (ambient + (1 - ambient) * lamMean)) / denom;
  if (!(s <= 1)) return NaN;
  return 2 * Math.asin(s);
}

/** Rodrigues rotation of `v` about unit axis `ax` by `ang` radians. Fixture builder. */
export function rotAboutAxis(v: V3, ax: V3, ang: number): V3 {
  const c = Math.cos(ang); const s = Math.sin(ang);
  const dot = v[0] * ax[0] + v[1] * ax[1] + v[2] * ax[2];
  const cx = ax[1] * v[2] - ax[2] * v[1];
  const cy = ax[2] * v[0] - ax[0] * v[2];
  const cz = ax[0] * v[1] - ax[1] * v[0];
  return [
    v[0] * c + cx * s + ax[0] * dot * (1 - c),
    v[1] * c + cy * s + ax[1] * dot * (1 - c),
    v[2] * c + cz * s + ax[2] * dot * (1 - c),
  ];
}

/** The exact side-wall dihedral of a regular N-gon prism: 2*pi/N. The V1 ground truth. */
export function prismDihedralRad(N: number): number {
  return (2 * Math.PI) / N;
}

// ── THE RENDERER'S OWN SHADING LAW, verbatim from research/tools/s116Render.ts:377 ────────────────────
// `const sh = 0.12 + 0.88 * Math.pow(lam, 0.85);` with base colour (214, 206, 190) and lam = |n.d|.
// Reproduced here so the kernel can be validated against the rasteriser's actual 8-bit output (V2).
/** The clay-mode shade factor for a facet whose |n.d| is `lam`. */
export function CLAY_SH(lam: number): number {
  const l = lam > 0 ? (lam < 1 ? lam : 1) : 0;
  return 0.12 + 0.88 * Math.pow(l, 0.85);
}

/** 8-bit clay grey the renderer writes for |n.d| = lam, channel 0 (red, base 214). */
export function clayCode(lam: number): number {
  return Math.min(255, Math.round(214 * CLAY_SH(lam)));
}

/** Weber contrast of the RENDERER's shade factors across a pair, using |n.d| (the renderer takes abs). */
export function contrastClay(n1: V3, n2: V3, d: V3): number {
  const lam1 = Math.abs(n1[0] * d[0] + n1[1] * d[1] + n1[2] * d[2]);
  const lam2 = Math.abs(n2[0] * d[0] + n2[1] * d[1] + n2[2] * d[2]);
  return weber(CLAY_SH(lam1), CLAY_SH(lam2));
}
