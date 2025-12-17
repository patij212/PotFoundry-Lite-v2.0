/**
 * Pot Geometry Generator for WebGL Renderer
 * 
 * Uses the existing buildPotMesh function from geometry/meshBuilder.ts
 * which is the same code used for STL export, ensuring visual parity.
 */

import * as THREE from 'three';
import { buildPotMesh } from '../../geometry/meshBuilder';
import type { PotDimensions, MeshQuality, StyleId, StyleOptions } from '../../geometry/types';

/**
 * Parameters for generating pot geometry - simplified interface
 */
export interface PotParams {
    H: number;           // Height
    Rt: number;          // Top radius (half of top_od)
    Rb: number;          // Bottom radius (half of bottom_od)
    tWall: number;       // Wall thickness
    tBottom: number;     // Bottom thickness
    rDrain: number;      // Drain hole radius
    expn: number;        // Profile exponent
    nTheta: number;      // Angular resolution
    nZ: number;          // Vertical resolution
    styleId: number;     // Style ID number
    spinTurns: number;   // Twist turns
    spinPhase: number;   // Twist phase
    spinCurve: number;   // Twist curve
    colorBottom: number; // Bottom color (hex)
    colorMid: number;    // Mid color (hex)
    colorTop: number;    // Top color (hex)
    styleParams?: number[]; // Style-specific parameters
    bellAmp?: number;    // Bell amplitude
    bellCenter?: number; // Bell center
    bellWidth?: number;  // Bell width
}

// Map numeric style IDs to style names - must match STYLE_ID_MAP in utils/styleParams.ts
const STYLE_ID_TO_NAME: Record<number, StyleId> = {
    0: 'SuperformulaBlossom',
    1: 'FourierBloom',
    2: 'SpiralRidges',
    3: 'SuperellipseMorph',
    4: 'HarmonicRipple',
};

/**
 * Generate pot geometry using the buildPotMesh function
 */
export function generatePotGeometry(
    params: PotParams,
    additionalStyleOpts: Record<string, number | boolean> = {}
): THREE.BufferGeometry {
    const {
        H,
        Rt,
        Rb,
        tWall,
        tBottom,
        rDrain,
        expn,
        nTheta,
        nZ,
        styleId,
        spinTurns,
        spinPhase,
        spinCurve,
        bellAmp = 0,
        bellCenter = 0.5,
        bellWidth = 0.22,
    } = params;

    // Convert params to the format expected by buildPotMesh
    const dimensions: Partial<PotDimensions> = {
        H: Math.max(H, 10),
        Rt: Math.max(Rt, 5),
        Rb: Math.max(Rb, 5),
        tWall: Math.max(tWall, 1),
        tBottom: Math.max(tBottom, 2),
        rDrain: Math.max(rDrain, 0.5),
        expn: Math.max(expn, 0.1),
    };

    // Validate drain radius doesn't exceed bounds
    if (dimensions.rDrain! >= dimensions.Rb! - dimensions.tWall! - 2.0) {
        dimensions.rDrain = dimensions.Rb! - dimensions.tWall! - 3.0;
        if (dimensions.rDrain! < 0.5) dimensions.rDrain = 0.5;
    }

    const quality: Partial<MeshQuality> = {
        nTheta: Math.max(nTheta, 8),
        nZ: Math.max(nZ, 4),
    };

    const styleName = STYLE_ID_TO_NAME[styleId] || 'SuperformulaBlossom';

    // Merge style options from params with additional options from bridge
    const styleOpts: StyleOptions = {
        spinTurns: spinTurns || 0,
        spinPhase: spinPhase || 0,
        spinCurve: spinCurve || 1,
        bellAmp: bellAmp || 0,
        bellCenter: bellCenter || 0.5,
        bellWidth: bellWidth || 0.22,
        ...additionalStyleOpts,  // Override with any additional style-specific params
    };

    console.log('[WebGL] Generating mesh with buildPotMesh:', {
        dimensions,
        quality,
        styleName,
        styleOpts
    });

    // Build the mesh using the same function used for STL export
    let result;
    try {
        result = buildPotMesh(dimensions, quality, styleName, styleOpts);
    } catch (meshError) {
        console.error('[WebGL] buildPotMesh failed:', meshError);
        // Fall back to a simple cylinder if mesh generation fails
        return createFallbackGeometry(H, Rt, Rb, nTheta, nZ);
    }

    const { mesh } = result;
    const { vertices, indices } = mesh;

    console.log('[WebGL] Mesh generated:', {
        vertexCount: mesh.vertexCount,
        triangleCount: mesh.triangleCount
    });

    // Convert to Three.js BufferGeometry
    const geometry = new THREE.BufferGeometry();

    // The buildPotMesh outputs vertices as flat Float32Array [x,y,z, x,y,z, ...]
    // and indices as Uint32Array

    // buildPotMesh uses x,y for horizontal and z for vertical (height)
    // Three.js convention is x,z for horizontal and y for vertical
    // So we need to swap y and z
    const positions = new Float32Array(vertices.length);
    for (let i = 0; i < mesh.vertexCount; i++) {
        positions[i * 3] = vertices[i * 3];         // x stays x
        positions[i * 3 + 1] = vertices[i * 3 + 2]; // z becomes y (height)
        positions[i * 3 + 2] = vertices[i * 3 + 1]; // y becomes z
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    // Compute normals
    geometry.computeVertexNormals();

    // Add vertex colors based on height
    const colors = new Float32Array(mesh.vertexCount * 3);
    for (let i = 0; i < mesh.vertexCount; i++) {
        const height = positions[i * 3 + 1]; // y (height in Three.js space)
        const t = Math.max(0, Math.min(1, height / H));

        const color = interpolateColor(
            params.colorBottom,
            params.colorMid,
            params.colorTop,
            t
        );
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    return geometry;
}

/**
 * Create a simple fallback cylinder if mesh generation fails
 */
function createFallbackGeometry(
    H: number,
    Rt: number,
    Rb: number,
    nTheta: number,
    nZ: number
): THREE.BufferGeometry {
    console.warn('[WebGL] Using fallback cylinder geometry');

    const geometry = new THREE.CylinderGeometry(Rt, Rb, H, nTheta, nZ, true);
    geometry.translate(0, H / 2, 0);

    return geometry;
}

/**
 * Interpolate between bottom, mid, and top colors based on height ratio
 */
function interpolateColor(
    bottomHex: number,
    midHex: number,
    topHex: number,
    t: number
): { r: number; g: number; b: number } {
    // Convert hex to RGB
    const bottom = {
        r: ((bottomHex >> 16) & 0xFF) / 255,
        g: ((bottomHex >> 8) & 0xFF) / 255,
        b: (bottomHex & 0xFF) / 255,
    };
    const mid = {
        r: ((midHex >> 16) & 0xFF) / 255,
        g: ((midHex >> 8) & 0xFF) / 255,
        b: (midHex & 0xFF) / 255,
    };
    const top = {
        r: ((topHex >> 16) & 0xFF) / 255,
        g: ((topHex >> 8) & 0xFF) / 255,
        b: (topHex & 0xFF) / 255,
    };

    // Two-segment interpolation
    if (t < 0.5) {
        const localT = t * 2;
        return {
            r: bottom.r + (mid.r - bottom.r) * localT,
            g: bottom.g + (mid.g - bottom.g) * localT,
            b: bottom.b + (mid.b - bottom.b) * localT,
        };
    } else {
        const localT = (t - 0.5) * 2;
        return {
            r: mid.r + (top.r - mid.r) * localT,
            g: mid.g + (top.g - mid.g) * localT,
            b: mid.b + (top.b - mid.b) * localT,
        };
    }
}
