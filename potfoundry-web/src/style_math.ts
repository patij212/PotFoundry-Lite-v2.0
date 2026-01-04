/**
 * Style Math Engine - CPU-side style radius calculations.
 * 
 * This module mirrors the WGSL style_radius functions to enable
 * CPU-side precomputation for features like seam blending.
 * 
 * ARCHITECTURE:
 * - Each style has its own radius function
 * - Matches WGSL shader logic exactly for consistency
 * - Extensible: add new styles by adding cases to computeStyleRadius()
 * 
 * @module style_math
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Context for style radius calculations.
 * Contains all parameters needed to compute the radius at any point.
 */
export interface StyleMathContext {
    /** Style ID (0=Superformula, 1=Fourier, 2=Spiral, 3=Superellipse, 4=Harmonic) */
    styleId: number;
    /** Style-specific parameters (48-element array) */
    styleParams: number[];
    /** Pot height in mm */
    height: number;
    /** Top radius in mm */
    radiusTop: number;
    /** Bottom radius in mm */
    radiusBottom: number;
    /** Flare exponent */
    expn: number;
    /** Bell amplitude */
    bellAmp: number;
    /** Bell center position (0-1) */
    bellCenter: number;
    /** Bell width */
    bellWidth: number;
}

// ============================================================================
// Style Constants (match WGSL)
// ============================================================================

const STYLE_SUPERFORMULA = 0;
const STYLE_FOURIER = 1;
const STYLE_SPIRAL = 2;
const STYLE_SUPERELLIPSE = 3;
const STYLE_HARMONIC = 4;

const TAU = Math.PI * 2;

// ============================================================================
// Base Radius Calculation (matches r_base in WGSL)
// ============================================================================

/**
 * Compute the base radius at normalized height t (0=bottom, 1=top).
 * Includes bell/bulge deformation.
 */
export function computeBaseRadius(ctx: StyleMathContext, t: number): number {
    const { radiusTop, radiusBottom, expn, bellAmp, bellCenter, bellWidth } = ctx;

    // Base interpolation with exponential curve
    const a = Math.pow(Math.max(t, 0), Math.max(expn, 1e-4));
    let m = radiusBottom + (radiusTop - radiusBottom) * a;

    // Bell/bulge deformation
    const safeWidth = Math.max(bellWidth, 0.1);
    const bellDist = t - bellCenter;
    const bellFactor = bellAmp * Math.exp(-(bellDist * bellDist) / (2 * safeWidth * safeWidth));
    m = m * (1 + bellFactor);

    return Math.max(m, 0.5);
}

// ============================================================================
// Style-Specific Radius Functions
// ============================================================================

/**
 * Superformula radius at theta=0 (optimized).
 * At theta=0: cos(0)=1, sin(0)=0, so only one term contributes.
 */
function superformulaRadiusZero(ctx: StyleMathContext, t: number, r0: number): number {
    const params = ctx.styleParams;
    const hasParams = params[47] > 0.5;

    // When params are inactive, just return base radius
    if (!hasParams) {
        return r0;
    }

    const n1Base = params[3] || 0.35;
    const n1Top = params[4] || 0.5;
    const n2Base = params[5] || 0.8;
    const n2Top = params[6] || 1.4;
    const n1 = n1Base + (n1Top - n1Base) * t;
    const n2 = n2Base + (n2Top - n2Base) * t;
    const a = Math.max(params[9] || 1.0, 1e-4);

    // rf = a^(n2/n1) at theta=0
    const exponent = Math.max(-100, Math.min(100, n2 / Math.max(n1, 1e-4)));
    const rf = Math.pow(Math.max(a, 1e-4), exponent);

    return r0 * (0.90 + 0.35 * Math.max(0, Math.min(4, rf)));
}

/**
 * Fourier radius at theta=0.
 * sin terms vanish, cos(0)=1.
 */
function fourierRadiusZero(ctx: StyleMathContext, t: number, r0: number): number {
    const params = ctx.styleParams;
    if (params[47] < 0.5) return r0;

    const bc8 = params[0] || 0.12;
    const bc12 = params[4] || -0.04;
    const tc11 = params[6] || 0.18;
    const tc22 = params[10] || 0.05;
    const strength = params[15] || 1.0;

    // At theta=0: cos(0)=1, sin(0)=0
    const base = 1 + bc8 + bc12;
    const top = 1 + tc11 + tc22;
    const f = base + (top - base) * Math.max(0, Math.min(1, t));

    return r0 * (1 + (f - 1) * strength);
}

/**
 * Spiral radius at theta=0.
 */
function spiralRadiusZero(ctx: StyleMathContext, t: number, r0: number): number {
    const params = ctx.styleParams;
    if (params[47] < 0.5) return r0;

    const turns = params[1] || 1.15;
    const ampMin = params[2] || 0.15;
    const ampMax = params[3] || 0.25;
    const ampCurve = Math.max(params[4] || 1.3, 1e-4);

    const phase = TAU * turns * t;
    const amp = ampMin + (ampMax - ampMin) * Math.pow(Math.max(0, Math.min(1, t)), ampCurve);
    const f = 1 + amp * Math.sin(phase);

    return r0 * f;
}

/**
 * Superellipse radius at theta=0.
 * cos(0)=1, sin(0)=0 → base=1
 */
function superellipseRadiusZero(ctx: StyleMathContext, _t: number, r0: number): number {
    const params = ctx.styleParams;
    if (params[47] < 0.5) return r0;

    const c4a = params[3] || 0.08;
    const c8a = params[5] || 0.03;

    // At theta=0: base=1, rf = 1 + c4a + c8a
    const rf = 1 + c4a + c8a;

    return r0 * rf;
}

/**
 * Harmonic radius at theta=0.
 * cos(0)=1, sin(0)=0
 */
function harmonicRadiusZero(ctx: StyleMathContext, t: number, r0: number): number {
    const params = ctx.styleParams;
    if (params[47] < 0.5) return r0;

    const _petals = params[0] || 7;
    const petAmp = params[1] || 0.16;
    const petPh = params[2] || 0;
    const petZg = params[3] || 0.6;
    const _ripFreq = params[4] || 31;
    const ripAmp = params[5] || 0.03;
    const ripPh = params[6] || 0;
    const ripZg = params[7] || 1.0;
    const bell = params[8] || 0.05;

    // At theta=0
    let f = 1 + petAmp * Math.cos(petPh + TAU * petZg * t);
    f *= 1 + ripAmp * Math.sin(ripPh + TAU * ripZg * t);
    f *= 1 + bell * Math.exp(-((t - 0.5) * (t - 0.5)) / 0.04);

    return r0 * f;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Compute the styled radius at theta=0 for any style.
 * This is the main function used for seam blending precomputation.
 * 
 * @param ctx - Style context with all parameters
 * @param t - Normalized height (0=bottom, 1=top)
 * @returns Radius at theta=0 for the given height
 */
export function computeSeamRadius(ctx: StyleMathContext, t: number): number {
    const r0 = computeBaseRadius(ctx, t);

    switch (ctx.styleId) {
        case STYLE_SUPERFORMULA:
            return superformulaRadiusZero(ctx, t, r0);
        case STYLE_FOURIER:
            return fourierRadiusZero(ctx, t, r0);
        case STYLE_SPIRAL:
            return spiralRadiusZero(ctx, t, r0);
        case STYLE_SUPERELLIPSE:
            return superellipseRadiusZero(ctx, t, r0);
        case STYLE_HARMONIC:
            return harmonicRadiusZero(ctx, t, r0);
        default:
            return r0; // Unknown style: use base radius
    }
}

/**
 * Compute an average seam radius across multiple height samples.
 * This provides a single representative value for the entire seam.
 * 
 * @param ctx - Style context
 * @param samples - Number of height samples (default 8)
 * @returns Average seam radius
 */
export function computeAverageSeamRadius(ctx: StyleMathContext, samples = 8): number {
    let sum = 0;
    for (let i = 0; i < samples; i++) {
        const t = i / (samples - 1);
        sum += computeSeamRadius(ctx, t);
    }
    return sum / samples;
}

/**
 * Compute seam radius at a specific height fraction.
 * Useful for debugging or when you need the exact value at a point.
 * 
 * @param ctx - Style context
 * @param t - Normalized height (0-1)
 * @returns Seam radius at that height
 */
export function computeSeamRadiusAt(ctx: StyleMathContext, t: number): number {
    return computeSeamRadius(ctx, Math.max(0, Math.min(1, t)));
}
