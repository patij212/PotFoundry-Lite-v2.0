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

// Style name to ID mapping (inverse of STYLE_ID_TO_NAME in potGeometry.ts)
const STYLE_NAME_TO_ID: Record<string, number> = {
    'SuperformulaBlossom': 0,
    'VerticalFlutes': 1,
    'SpiralRidges': 2,
    'OrganicWave': 3,
    'HexagonFacets': 4,
    'DiamondGrid': 5,
    'RippleWaves': 6,
    'TwistedHelix': 7,
    'GothicArches': 8,
    'ScallopShell': 9,
    'LotusPetals': 10,
    'Honeycomb': 11,
    'HarmonicRipple': 6, // Maps to RippleWaves
    'FourierBloom': 0,   // Maps to SuperformulaBlossom
    'SuperellipseMorph': 0,
    'LowPolyFacet': 4,   // Maps to HexagonFacets
};

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
            const opts = (design.opts || {}) as Record<string, number | boolean>;

            const H = size.height || 120;
            const topOd = size.top_od || 140;
            const bottomOd = size.bottom_od || 90;
            const tWall = size.wall_thickness || 3;
            const tBottom = size.bottom_thickness || 3;
            const rDrain = size.drain_radius || 10;
            const expn = size.flare_exp || 1.1;

            // Get style ID
            const styleId = STYLE_NAME_TO_ID[design.style] ?? 0;

            // Build pot params - low poly for performance
            const potParams: PotParams = {
                H,
                Rt: topOd / 2,
                Rb: bottomOd / 2,
                tWall,
                tBottom,
                rDrain,
                expn,
                nTheta: 24,  // Low poly for thumbnails
                nZ: 20,
                styleId,
                spinTurns: (opts.spinTurns as number) || 0,
                spinPhase: (opts.spinPhase as number) || 0,
                spinCurve: (opts.spinCurve as number) || 1,
                colorBottom: DEFAULT_COLORS.bottom,
                colorMid: DEFAULT_COLORS.mid,
                colorTop: DEFAULT_COLORS.top,
                bellAmp: (opts.bellAmp as number) || 0,
                bellCenter: (opts.bellCenter as number) || 0.5,
                bellWidth: (opts.bellWidth as number) || 0.22,
            };

            // Generate geometry
            const geometry = generatePotGeometry(potParams, opts as Record<string, number | boolean>);

            // Create material
            const material = new THREE.MeshStandardMaterial({
                vertexColors: true,
                roughness: 0.6,
                metalness: 0.1,
                side: THREE.DoubleSide,
            });

            // Create mesh
            const mesh = new THREE.Mesh(geometry, material);
            scene.add(mesh);

            // Add lighting
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
            scene.add(ambientLight);

            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(1, 2, 2);
            scene.add(directionalLight);

            // Position camera to frame the pot
            const boundingBox = new THREE.Box3().setFromObject(mesh);
            const center = boundingBox.getCenter(new THREE.Vector3());
            const size3 = boundingBox.getSize(new THREE.Vector3());
            const maxDim = Math.max(size3.x, size3.y, size3.z);

            camera.position.set(
                center.x + maxDim * 0.8,
                center.y + maxDim * 0.3,
                center.z + maxDim * 0.8
            );
            camera.lookAt(center);

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
});

DesignThumbnail.displayName = 'DesignThumbnail';
