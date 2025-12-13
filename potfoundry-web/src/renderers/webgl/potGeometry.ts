/**
 * Pot Geometry Generator for WebGL Renderer
 * 
 * Generates Three.js BufferGeometry for the parametric pot shape.
 * Port of the WGSL vertex shader logic to CPU-based JavaScript.
 */

import * as THREE from 'three';

/**
 * Parameters for generating pot geometry
 */
export interface PotParams {
    H: number;           // Height
    Rt: number;          // Top radius
    Rb: number;          // Bottom radius
    tWall: number;       // Wall thickness
    tBottom: number;     // Bottom thickness
    rDrain: number;      // Drain hole radius
    expn: number;        // Profile exponent
    nTheta: number;      // Angular resolution
    nZ: number;          // Vertical resolution
    styleId: number;     // Style ID (0 = plain, 1-4 = various)
    spinTurns: number;   // Twist turns
    spinPhase: number;   // Twist phase
    spinCurve: number;   // Twist curve
    colorBottom: number; // Bottom color (hex)
    colorMid: number;    // Mid color (hex)
    colorTop: number;    // Top color (hex)
    styleParams?: number[]; // Style-specific parameters
}

/**
 * Generate pot geometry based on parameters
 */
export function generatePotGeometry(params: PotParams): THREE.BufferGeometry {
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
        spinTurns,
        spinPhase,
        spinCurve,
    } = params;

    const geometry = new THREE.BufferGeometry();

    // Estimate vertex and index counts
    const outerVerts = (nTheta + 1) * (nZ + 1);
    const innerVerts = (nTheta + 1) * (nZ + 1);
    const bottomVerts = (nTheta + 1) * 4; // Bottom rings
    const rimVerts = (nTheta + 1) * 3;    // Rim

    const totalVerts = outerVerts + innerVerts + bottomVerts + rimVerts;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    let vertexIndex = 0;

    // === Outer wall ===
    const outerStartIndex = vertexIndex;
    for (let iz = 0; iz <= nZ; iz++) {
        const t = iz / nZ;
        const y = t * H;

        // Interpolate radius
        const radius = Rb + (Rt - Rb) * Math.pow(t, expn);

        for (let itheta = 0; itheta <= nTheta; itheta++) {
            const u = itheta / nTheta;

            // Apply twist
            const twistAngle = spinTurns * 2 * Math.PI * Math.pow(t, spinCurve) + spinPhase * 2 * Math.PI;
            const theta = u * 2 * Math.PI + twistAngle;

            // Apply style modulation
            const styleRadius = applyStyleModulation(radius, theta, t, params);

            const x = Math.cos(theta) * styleRadius;
            const z = Math.sin(theta) * styleRadius;

            positions.push(x, y, z);

            // Normal (approximate, will be smoothed)
            const nx = Math.cos(theta);
            const nz = Math.sin(theta);
            const ny = (Rt - Rb) / H * 0.3; // Slight upward tilt for profile
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
            normals.push(nx / len, ny / len, nz / len);

            uvs.push(u, t);

            // Vertex color based on height
            const color = interpolateColor(
                params.colorBottom,
                params.colorMid,
                params.colorTop,
                t
            );
            colors.push(color.r, color.g, color.b);

            vertexIndex++;
        }
    }

    // Generate indices for outer wall
    for (let iz = 0; iz < nZ; iz++) {
        for (let itheta = 0; itheta < nTheta; itheta++) {
            const i00 = outerStartIndex + iz * (nTheta + 1) + itheta;
            const i01 = i00 + 1;
            const i10 = i00 + (nTheta + 1);
            const i11 = i10 + 1;

            indices.push(i00, i01, i11);
            indices.push(i00, i11, i10);
        }
    }

    // === Inner wall ===
    const innerStartIndex = vertexIndex;
    const innerRadius = (r: number) => Math.max(r - tWall, 1);

    for (let iz = 0; iz <= nZ; iz++) {
        const t = iz / nZ;
        const y = t * H + tBottom; // Start above bottom

        const outerR = Rb + (Rt - Rb) * Math.pow(t, expn);
        const radius = innerRadius(outerR);

        for (let itheta = 0; itheta <= nTheta; itheta++) {
            const u = itheta / nTheta;

            const twistAngle = spinTurns * 2 * Math.PI * Math.pow(t, spinCurve) + spinPhase * 2 * Math.PI;
            const theta = u * 2 * Math.PI + twistAngle;

            const styleRadius = applyStyleModulation(radius, theta, t, params) - tWall;
            const finalRadius = Math.max(styleRadius, 1);

            const x = Math.cos(theta) * finalRadius;
            const z = Math.sin(theta) * finalRadius;

            positions.push(x, y, z);

            // Normal points inward
            const nx = -Math.cos(theta);
            const nz = -Math.sin(theta);
            normals.push(nx, 0, nz);

            uvs.push(u, t);

            const color = interpolateColor(
                params.colorBottom,
                params.colorMid,
                params.colorTop,
                t
            );
            colors.push(color.r, color.g, color.b);

            vertexIndex++;
        }
    }

    // Generate indices for inner wall (reversed winding)
    for (let iz = 0; iz < nZ; iz++) {
        for (let itheta = 0; itheta < nTheta; itheta++) {
            const i00 = innerStartIndex + iz * (nTheta + 1) + itheta;
            const i01 = i00 + 1;
            const i10 = i00 + (nTheta + 1);
            const i11 = i10 + 1;

            indices.push(i00, i11, i01);
            indices.push(i00, i10, i11);
        }
    }

    // === Bottom surface ===
    const bottomStartIndex = vertexIndex;

    // Bottom outer edge
    for (let itheta = 0; itheta <= nTheta; itheta++) {
        const u = itheta / nTheta;
        const theta = u * 2 * Math.PI;
        const radius = Rb;

        const x = Math.cos(theta) * radius;
        const z = Math.sin(theta) * radius;

        positions.push(x, 0, z);
        normals.push(0, -1, 0);
        uvs.push(u, 0);

        const color = interpolateColor(
            params.colorBottom,
            params.colorMid,
            params.colorTop,
            0
        );
        colors.push(color.r, color.g, color.b);

        vertexIndex++;
    }

    // Bottom inner edge (drain hole)
    const bottomInnerStartIndex = vertexIndex;
    for (let itheta = 0; itheta <= nTheta; itheta++) {
        const u = itheta / nTheta;
        const theta = u * 2 * Math.PI;
        const radius = rDrain;

        const x = Math.cos(theta) * radius;
        const z = Math.sin(theta) * radius;

        positions.push(x, 0, z);
        normals.push(0, -1, 0);
        uvs.push(u, 0);

        const color = interpolateColor(
            params.colorBottom,
            params.colorMid,
            params.colorTop,
            0
        );
        colors.push(color.r, color.g, color.b);

        vertexIndex++;
    }

    // Generate indices for bottom (ring between drain and outer edge)
    for (let itheta = 0; itheta < nTheta; itheta++) {
        const outerI = bottomStartIndex + itheta;
        const outerI1 = bottomStartIndex + itheta + 1;
        const innerI = bottomInnerStartIndex + itheta;
        const innerI1 = bottomInnerStartIndex + itheta + 1;

        indices.push(outerI, innerI, outerI1);
        indices.push(outerI1, innerI, innerI1);
    }

    // === Rim (top edge) ===
    const rimStartIndex = vertexIndex;

    // Rim outer edge
    for (let itheta = 0; itheta <= nTheta; itheta++) {
        const u = itheta / nTheta;
        const theta = u * 2 * Math.PI;

        const x = Math.cos(theta) * Rt;
        const z = Math.sin(theta) * Rt;

        positions.push(x, H, z);
        normals.push(0, 1, 0);
        uvs.push(u, 1);

        const color = interpolateColor(
            params.colorBottom,
            params.colorMid,
            params.colorTop,
            1
        );
        colors.push(color.r, color.g, color.b);

        vertexIndex++;
    }

    // Rim inner edge
    const rimInnerStartIndex = vertexIndex;
    const innerRt = Rt - tWall;
    for (let itheta = 0; itheta <= nTheta; itheta++) {
        const u = itheta / nTheta;
        const theta = u * 2 * Math.PI;

        const x = Math.cos(theta) * innerRt;
        const z = Math.sin(theta) * innerRt;

        positions.push(x, H, z);
        normals.push(0, 1, 0);
        uvs.push(u, 1);

        const color = interpolateColor(
            params.colorBottom,
            params.colorMid,
            params.colorTop,
            1
        );
        colors.push(color.r, color.g, color.b);

        vertexIndex++;
    }

    // Generate indices for rim
    for (let itheta = 0; itheta < nTheta; itheta++) {
        const outerI = rimStartIndex + itheta;
        const outerI1 = rimStartIndex + itheta + 1;
        const innerI = rimInnerStartIndex + itheta;
        const innerI1 = rimInnerStartIndex + itheta + 1;

        indices.push(outerI, outerI1, innerI);
        indices.push(outerI1, innerI1, innerI);
    }

    // === Set geometry attributes ===
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);

    // Compute proper normals
    geometry.computeVertexNormals();

    return geometry;
}

/**
 * Apply style-specific radius modulation
 */
function applyStyleModulation(
    baseRadius: number,
    theta: number,
    t: number,
    params: PotParams
): number {
    const { styleId } = params;

    switch (styleId) {
        case 0: // Plain cylinder
            return baseRadius;

        case 1: // Fluted
            const flutes = 8;
            const fluteDepth = 0.08;
            const fluteMod = 1 - fluteDepth * (0.5 + 0.5 * Math.cos(theta * flutes));
            return baseRadius * fluteMod;

        case 2: // Spiral
            const spirals = 5;
            const spiralDepth = 0.1;
            const spiralPhase = t * Math.PI * 4;
            const spiralMod = 1 - spiralDepth * (0.5 + 0.5 * Math.cos(theta * spirals + spiralPhase));
            return baseRadius * spiralMod;

        case 3: // Organic/Blob
            const blobFreq = 6;
            const blobAmp = 0.15;
            const blobMod = 1 + blobAmp * Math.sin(theta * blobFreq) * Math.sin(t * Math.PI);
            return baseRadius * blobMod;

        case 4: // Faceted
            const facets = 6;
            const facetAngle = Math.floor((theta / (2 * Math.PI)) * facets) / facets * 2 * Math.PI;
            const facetMod = Math.cos(theta - facetAngle - Math.PI / facets);
            return baseRadius * (0.9 + 0.1 * facetMod);

        default:
            return baseRadius;
    }
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
