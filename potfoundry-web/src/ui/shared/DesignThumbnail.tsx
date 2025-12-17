/**
 * DesignThumbnail Component
 * 
 * Renders a small pot preview from design parameters using Three.js.
 * Uses IntersectionObserver for lazy loading to optimize performance.
 * 
 * @module ui/shared/DesignThumbnail
 */

import React, { useRef, useEffect, useState, memo } from 'react';
import * as THREE from 'three';
import type { LibraryDesign } from '../../context/LibraryContext';
import { generatePotGeometry, PotParams } from '../../renderers/webgl/potGeometry';
import './DesignThumbnail.css';

// Style name to ID mapping - must match STYLE_IDS from geometry/types.ts
const STYLE_NAME_TO_ID: Record<string, number> = {
    'SuperformulaBlossom': 0,
    'FourierBloom': 1,        // Correct: was incorrectly 0
    'SpiralRidges': 2,
    'SuperellipseMorph': 3,   // Correct: was incorrectly 0
    'HarmonicRipple': 4,      // Correct: was incorrectly 6
};

// Map database snake_case opts to camelCase expected by style functions
const OPTS_KEY_MAP: Record<string, string> = {
    // Superformula Blossom parameters
    'sf_m_base': 'sfMBase',
    'sf_m_top': 'sfMTop',
    'sf_m_curve_exp': 'sfMCurveExp',
    'sf_n1': 'sfN1',
    'sf_n1_top': 'sfN1Top',
    'sf_n2': 'sfN2',
    'sf_n2_top': 'sfN2Top',
    'sf_n3': 'sfN3',
    'sf_n3_top': 'sfN3Top',
    'sf_a': 'sfA',
    'sf_b': 'sfB',
    'sf_strength': 'sfStrength',
    // Fourier Bloom parameters
    'fb_strength': 'fbStrength',
    'fb_base_cos8_amp': 'fbBaseCos8Amp',
    'fb_top_cos11_amp': 'fbTopCos11Amp',
    'fb_wobble_amp': 'fbWobbleAmp',
    'fb_wobble_freq': 'fbWobbleFreq',
    // Spiral parameters
    'spiral_k': 'spiralK',
    'spiral_turns': 'spiralTurns',
    // Generic parameters (pass through)
    'spinTurns': 'spinTurns',
    'spinPhase': 'spinPhase',
    'spinCurve': 'spinCurve',
    'bellAmp': 'bellAmp',
    'bellCenter': 'bellCenter',
    'bellWidth': 'bellWidth',
};

// Convert database opts (snake_case) to style function opts (camelCase)
function convertOptsToStyleParams(opts: Record<string, unknown>): Record<string, number | boolean> {
    const result: Record<string, number | boolean> = {};
    for (const [key, value] of Object.entries(opts)) {
        const mappedKey = OPTS_KEY_MAP[key] || key;
        if (typeof value === 'number' || typeof value === 'boolean') {
            result[mappedKey] = value;
        }
    }
    return result;
}

// Default colors for pot gradient
const DEFAULT_COLORS = {
    bottom: 0x8B7355,  // Terracotta brown
    mid: 0xA0826D,
    top: 0xC4A484,
};

interface DesignThumbnailProps {
    design: LibraryDesign;
    width?: number;
    height?: number;
}

/**
 * DesignThumbnail - Renders a 3D pot preview from design parameters
 */
export const DesignThumbnail: React.FC<DesignThumbnailProps> = memo(({
    design,
    width = 150,
    height = 120,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [hasRendered, setHasRendered] = useState(false);
    const sceneRef = useRef<{
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        renderer: THREE.WebGLRenderer;
        mesh: THREE.Mesh;
    } | null>(null);

    // IntersectionObserver for lazy loading
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !hasRendered) {
                    setIsVisible(true);
                }
            },
            { threshold: 0.1, rootMargin: '50px' }
        );

        observer.observe(container);
        return () => observer.disconnect();
    }, [hasRendered]);

    // Three.js scene setup and rendering
    useEffect(() => {
        if (!isVisible || hasRendered || !canvasRef.current) return;

        const canvas = canvasRef.current;

        try {
            // Create renderer
            const renderer = new THREE.WebGLRenderer({
                canvas,
                antialias: true,
                alpha: true,
                powerPreference: 'low-power',
            });
            renderer.setSize(width, height);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.setClearColor(0x000000, 0);

            // Create scene
            const scene = new THREE.Scene();

            // Create camera
            const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);

            // Extract params from design
            const size = design.size || {};
            const rawOpts = (design.opts || {}) as Record<string, unknown>;
            // Convert snake_case database opts to camelCase for style functions
            const styleOpts = convertOptsToStyleParams(rawOpts);

            const H = size.height || 120;
            const topOd = size.top_od || 140;
            const bottomOd = size.bottom_od || 90;
            const tWall = size.wall_thickness || 3;
            const tBottom = size.bottom_thickness || 3;
            const rDrain = size.drain_radius || 10;
            const expn = size.flare_exp || 1.1;

            // Get style ID
            const styleId = STYLE_NAME_TO_ID[design.style] ?? 0;

            // Build pot params - need sufficient resolution for style patterns
            const potParams: PotParams = {
                H,
                Rt: topOd / 2,
                Rb: bottomOd / 2,
                tWall,
                tBottom,
                rDrain,
                expn,
                nTheta: 120,  // High resolution for style patterns
                nZ: 20,
                styleId,
                spinTurns: (styleOpts.spinTurns as number) || 0,
                spinPhase: (styleOpts.spinPhase as number) || 0,
                spinCurve: (styleOpts.spinCurve as number) || 1,
                colorBottom: DEFAULT_COLORS.bottom,
                colorMid: DEFAULT_COLORS.mid,
                colorTop: DEFAULT_COLORS.top,
                bellAmp: (styleOpts.bellAmp as number) || 0,
                bellCenter: (styleOpts.bellCenter as number) || 0.5,
                bellWidth: (styleOpts.bellWidth as number) || 0.22,
            };

            // Generate geometry - pass converted styleOpts for style-specific parameters
            const geometry = generatePotGeometry(potParams, styleOpts);

            // Create material - slightly more metallic for visual appeal
            const material = new THREE.MeshStandardMaterial({
                vertexColors: true,
                roughness: 0.45,
                metalness: 0.15,
                side: THREE.DoubleSide,
            });

            // Create mesh
            const mesh = new THREE.Mesh(geometry, material);
            scene.add(mesh);

            // === Enhanced 3-point lighting setup ===
            // Ambient - soft fill for shadows
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
            scene.add(ambientLight);

            // Key light - main light from upper right
            const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
            keyLight.position.set(100, 200, 150);
            scene.add(keyLight);

            // Fill light - softer from left
            const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
            fillLight.position.set(-100, 100, -50);
            scene.add(fillLight);

            // Rim light - from behind for edge definition
            const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
            rimLight.position.set(0, -50, -150);
            scene.add(rimLight);

            // === Gradient background ===
            scene.background = new THREE.Color(0x1a1a2e);

            // === Camera positioning - 3/4 view from slightly above ===
            const boundingBox = new THREE.Box3().setFromObject(mesh);
            const center = boundingBox.getCenter(new THREE.Vector3());
            const size3 = boundingBox.getSize(new THREE.Vector3());
            const maxDim = Math.max(size3.x, size3.y, size3.z);

            // Position: front-right, slightly above, looking at center
            const cameraDistance = maxDim * 1.5;
            const cameraAngle = Math.PI / 5; // ~36 degrees from front
            camera.position.set(
                center.x + Math.sin(cameraAngle) * cameraDistance,
                center.y + maxDim * 0.4, // Slightly above
                center.z + Math.cos(cameraAngle) * cameraDistance
            );
            camera.lookAt(center.x, center.y + maxDim * 0.1, center.z);

            // Render once
            renderer.render(scene, camera);

            // Store refs for cleanup
            sceneRef.current = { scene, camera, renderer, mesh };
            setHasRendered(true);

        } catch (error) {
            console.error('[DesignThumbnail] Failed to render:', error);
        }

        // Cleanup
        return () => {
            if (sceneRef.current) {
                const { scene, renderer, mesh } = sceneRef.current;
                mesh.geometry.dispose();
                (mesh.material as THREE.Material).dispose();
                scene.clear();
                renderer.dispose();
                sceneRef.current = null;
            }
        };
    }, [isVisible, hasRendered, design, width, height]);

    return (
        <div
            ref={containerRef}
            className="pf-design-thumbnail"
            style={{ width, height }}
        >
            <canvas
                ref={canvasRef}
                width={width}
                height={height}
                className="pf-design-thumbnail__canvas"
            />
            {!hasRendered && (
                <div className="pf-design-thumbnail__placeholder">
                    <div className="pf-design-thumbnail__loader" />
                </div>
            )}
        </div>
    );
}, (prevProps, nextProps) => {
    // Only skip re-render if same design ID - ensures each design gets its own thumbnail
    return prevProps.design.id === nextProps.design.id &&
        prevProps.width === nextProps.width &&
        prevProps.height === nextProps.height;
});

DesignThumbnail.displayName = 'DesignThumbnail';
