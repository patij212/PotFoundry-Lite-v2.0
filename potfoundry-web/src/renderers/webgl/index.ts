/**
 * WebGL Renderer using Three.js
 * 
 * Fallback renderer for devices where WebGPU is unavailable or crashes.
 * Provides the same visual output and interactions as the WebGPU renderer.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { MountOptions } from '../../types';
import type { RendererController, ExportOptions } from '../types';
import { generatePotGeometry, PotParams } from './potGeometry';
import { createPotMaterial } from './potMaterial';

/**
 * Mount the WebGL renderer on a canvas
 */
export async function mountWebGL(
    options: MountOptions
): Promise<RendererController | null> {
    const { canvas, emit, statusEl } = options;

    if (!canvas) {
        console.error('[WebGL] No canvas provided');
        return null;
    }

    const setStatus = (msg: string) => {
        if (statusEl) statusEl.textContent = msg;
        console.log('[WebGL]', msg);
    };

    setStatus('WebGL • initializing...');

    try {
        // === Create Three.js renderer ===
        const renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
        });

        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;

        // === Scene setup ===
        const scene = new THREE.Scene();

        // === Camera ===
        const aspect = canvas.clientWidth / canvas.clientHeight || 1;
        const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 10000);
        camera.position.set(0, 200, 400);
        camera.lookAt(0, 60, 0);

        // === Controls (orbit) ===
        const controls = new OrbitControls(camera, canvas);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.rotateSpeed = 0.8;
        controls.zoomSpeed = 1.2;
        controls.panSpeed = 0.8;
        controls.target.set(0, 60, 0);
        controls.minDistance = 50;
        controls.maxDistance = 2000;
        controls.update();

        // === Lighting ===
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        scene.add(ambientLight);

        const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
        keyLight.position.set(100, 200, 150);
        scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
        fillLight.position.set(-100, 100, -50);
        scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
        rimLight.position.set(0, -100, -200);
        scene.add(rimLight);

        // === Initial pot parameters ===
        let currentParams: PotParams = {
            H: 120,
            Rt: 70,
            Rb: 45,
            tWall: 3,
            tBottom: 3,
            rDrain: 10,
            expn: 1.1,
            nTheta: 64,  // Lower resolution for WebGL (performance)
            nZ: 32,
            styleId: 0,
            spinTurns: 0,
            spinPhase: 0,
            spinCurve: 1,
            colorBottom: 0x4a90d9,
            colorMid: 0x5a9fe8,
            colorTop: 0x6aafff,
        };

        // === Materials ===
        let potMaterial = createPotMaterial(currentParams);

        // === Pot mesh ===
        let potGeometry = generatePotGeometry(currentParams);
        let potMesh = new THREE.Mesh(potGeometry, potMaterial);
        scene.add(potMesh);

        // === Background gradient ===
        const bgColor1 = new THREE.Color(0x1a1a2e);
        const bgColor2 = new THREE.Color(0x16213e);
        scene.background = bgColor1;

        // === Animation state ===
        let disposed = false;
        let animationFrameId: number | null = null;
        let needsUpdate = false;

        // === Resize handling ===
        const handleResize = () => {
            const width = canvas.clientWidth;
            const height = canvas.clientHeight;

            if (canvas.width !== width || canvas.height !== height) {
                renderer.setSize(width, height, false);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
            }
        };

        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(canvas.parentElement || canvas);
        handleResize();

        // === Render loop ===
        const animate = () => {
            if (disposed) return;

            animationFrameId = requestAnimationFrame(animate);

            // Update controls
            controls.update();

            // Update geometry if params changed
            if (needsUpdate) {
                needsUpdate = false;
                updateMesh();
            }

            // Render
            renderer.render(scene, camera);
        };

        const updateMesh = () => {
            // Dispose old geometry
            potGeometry.dispose();

            // Generate new geometry
            potGeometry = generatePotGeometry(currentParams);
            potMesh.geometry = potGeometry;

            // Update material colors
            potMaterial.dispose();
            potMaterial = createPotMaterial(currentParams);
            potMesh.material = potMaterial;
        };

        // === Start rendering ===
        animate();
        setStatus('WebGL • ready (compatibility mode)');

        // Emit ready event
        if (emit) {
            emit({ type: 'ready', payload: { renderer: 'webgl' } });
        }

        // === Create controller ===
        const controller: RendererController = {
            updateParams(params: Record<string, unknown>) {
                // Map incoming params to our internal format
                if (params.H !== undefined) currentParams.H = Number(params.H);
                if (params.top_od !== undefined) currentParams.Rt = Number(params.top_od) / 2;
                if (params.bottom_od !== undefined) currentParams.Rb = Number(params.bottom_od) / 2;
                if (params.t_wall !== undefined) currentParams.tWall = Number(params.t_wall);
                if (params.t_bottom !== undefined) currentParams.tBottom = Number(params.t_bottom);
                if (params.r_drain !== undefined) currentParams.rDrain = Number(params.r_drain);
                if (params.expn !== undefined) currentParams.expn = Number(params.expn);
                if (params.n_theta !== undefined) currentParams.nTheta = Math.min(Number(params.n_theta), 128);
                if (params.n_z !== undefined) currentParams.nZ = Math.min(Number(params.n_z), 64);
                if (params.styleId !== undefined) currentParams.styleId = Number(params.styleId);
                if (params.spin_turns !== undefined) currentParams.spinTurns = Number(params.spin_turns);
                if (params.spin_phase !== undefined) currentParams.spinPhase = Number(params.spin_phase);
                if (params.spin_curve !== undefined) currentParams.spinCurve = Number(params.spin_curve);

                // Colors
                if (params.colorBottom !== undefined) {
                    currentParams.colorBottom = parseColor(params.colorBottom);
                }
                if (params.colorMid !== undefined) {
                    currentParams.colorMid = parseColor(params.colorMid);
                }
                if (params.colorTop !== undefined) {
                    currentParams.colorTop = parseColor(params.colorTop);
                }

                needsUpdate = true;
            },

            dispose() {
                disposed = true;

                if (animationFrameId !== null) {
                    cancelAnimationFrame(animationFrameId);
                }

                resizeObserver.disconnect();

                potGeometry.dispose();
                potMaterial.dispose();
                renderer.dispose();
                controls.dispose();

                console.log('[WebGL] Disposed');
            },

            exportSTL(options?: ExportOptions): Blob | null {
                try {
                    // Generate high-res geometry for export
                    const exportParams = { ...currentParams };
                    if (options?.quality === 'high') {
                        exportParams.nTheta = 168;
                        exportParams.nZ = 84;
                    } else if (options?.quality === 'draft') {
                        exportParams.nTheta = 64;
                        exportParams.nZ = 32;
                    } else {
                        exportParams.nTheta = 120;
                        exportParams.nZ = 60;
                    }

                    const exportGeometry = generatePotGeometry(exportParams);
                    const stlData = geometryToSTL(exportGeometry);
                    exportGeometry.dispose();

                    return new Blob([stlData], { type: 'application/octet-stream' });
                } catch (err) {
                    console.error('[WebGL] STL export failed:', err);
                    return null;
                }
            },

            exportOBJ(options?: ExportOptions): string | null {
                try {
                    const exportParams = { ...currentParams };
                    if (options?.quality === 'high') {
                        exportParams.nTheta = 168;
                        exportParams.nZ = 84;
                    }

                    const exportGeometry = generatePotGeometry(exportParams);
                    const objData = geometryToOBJ(exportGeometry);
                    exportGeometry.dispose();

                    return objData;
                } catch (err) {
                    console.error('[WebGL] OBJ export failed:', err);
                    return null;
                }
            },

            focusOnPot() {
                // Animate camera to default view
                controls.target.set(0, currentParams.H / 2, 0);
                camera.position.set(0, currentParams.H * 1.5, currentParams.Rt * 4);
                controls.update();
            },

            resetCamera() {
                camera.position.set(0, 200, 400);
                controls.target.set(0, 60, 0);
                controls.update();
            },

            get rendererType() { return 'webgl' as const; },
            get isCompatibilityMode() { return true; },
        };

        return controller;

    } catch (err) {
        console.error('[WebGL] Initialization failed:', err);
        setStatus('WebGL • initialization failed');
        return null;
    }
}

// === Utility functions ===

function parseColor(color: unknown): number {
    if (typeof color === 'number') return color;
    if (typeof color === 'string') {
        // Handle hex strings like "#FF0000" or "FF0000"
        const hex = color.replace('#', '');
        return parseInt(hex, 16);
    }
    return 0x808080; // Default gray
}

function geometryToSTL(geometry: THREE.BufferGeometry): ArrayBuffer {
    const positions = geometry.getAttribute('position');
    const indices = geometry.getIndex();

    let triangleCount = 0;
    if (indices) {
        triangleCount = indices.count / 3;
    } else {
        triangleCount = positions.count / 3;
    }

    // STL binary format
    // 80 byte header + 4 byte triangle count + (50 bytes per triangle)
    const bufferSize = 80 + 4 + triangleCount * 50;
    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    // Header (80 bytes, can be anything)
    const header = 'PotFoundry STL Export';
    for (let i = 0; i < 80; i++) {
        view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
    }

    // Triangle count
    view.setUint32(80, triangleCount, true);

    let offset = 84;

    const v1 = new THREE.Vector3();
    const v2 = new THREE.Vector3();
    const v3 = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const edge1 = new THREE.Vector3();
    const edge2 = new THREE.Vector3();

    for (let i = 0; i < triangleCount; i++) {
        let i1: number, i2: number, i3: number;

        if (indices) {
            i1 = indices.getX(i * 3);
            i2 = indices.getX(i * 3 + 1);
            i3 = indices.getX(i * 3 + 2);
        } else {
            i1 = i * 3;
            i2 = i * 3 + 1;
            i3 = i * 3 + 2;
        }

        v1.fromBufferAttribute(positions, i1);
        v2.fromBufferAttribute(positions, i2);
        v3.fromBufferAttribute(positions, i3);

        // Calculate normal
        edge1.subVectors(v2, v1);
        edge2.subVectors(v3, v1);
        normal.crossVectors(edge1, edge2).normalize();

        // Write normal
        view.setFloat32(offset, normal.x, true); offset += 4;
        view.setFloat32(offset, normal.y, true); offset += 4;
        view.setFloat32(offset, normal.z, true); offset += 4;

        // Write vertices
        view.setFloat32(offset, v1.x, true); offset += 4;
        view.setFloat32(offset, v1.y, true); offset += 4;
        view.setFloat32(offset, v1.z, true); offset += 4;

        view.setFloat32(offset, v2.x, true); offset += 4;
        view.setFloat32(offset, v2.y, true); offset += 4;
        view.setFloat32(offset, v2.z, true); offset += 4;

        view.setFloat32(offset, v3.x, true); offset += 4;
        view.setFloat32(offset, v3.y, true); offset += 4;
        view.setFloat32(offset, v3.z, true); offset += 4;

        // Attribute byte count (unused)
        view.setUint16(offset, 0, true); offset += 2;
    }

    return buffer;
}

function geometryToOBJ(geometry: THREE.BufferGeometry): string {
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const indices = geometry.getIndex();

    let obj = '# PotFoundry OBJ Export\n';
    obj += `# Vertices: ${positions.count}\n\n`;

    // Vertices
    for (let i = 0; i < positions.count; i++) {
        obj += `v ${positions.getX(i).toFixed(6)} ${positions.getY(i).toFixed(6)} ${positions.getZ(i).toFixed(6)}\n`;
    }

    obj += '\n';

    // Normals
    if (normals) {
        for (let i = 0; i < normals.count; i++) {
            obj += `vn ${normals.getX(i).toFixed(6)} ${normals.getY(i).toFixed(6)} ${normals.getZ(i).toFixed(6)}\n`;
        }
        obj += '\n';
    }

    // Faces
    if (indices) {
        for (let i = 0; i < indices.count; i += 3) {
            const i1 = indices.getX(i) + 1;
            const i2 = indices.getX(i + 1) + 1;
            const i3 = indices.getX(i + 2) + 1;

            if (normals) {
                obj += `f ${i1}//${i1} ${i2}//${i2} ${i3}//${i3}\n`;
            } else {
                obj += `f ${i1} ${i2} ${i3}\n`;
            }
        }
    } else {
        for (let i = 0; i < positions.count; i += 3) {
            const i1 = i + 1;
            const i2 = i + 2;
            const i3 = i + 3;

            if (normals) {
                obj += `f ${i1}//${i1} ${i2}//${i2} ${i3}//${i3}\n`;
            } else {
                obj += `f ${i1} ${i2} ${i3}\n`;
            }
        }
    }

    return obj;
}
