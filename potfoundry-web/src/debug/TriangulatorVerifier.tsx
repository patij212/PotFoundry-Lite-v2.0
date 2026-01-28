
import React, { useEffect, useRef, useState } from 'react';
import { ConstrainedTriangulator } from '../utils/geometry/ConstrainedTriangulator';
import { FeaturePoint } from '../renderers/webgpu/FeatureExtractionComputer';

// ===================================
// Test Cases
// ===================================

const TEST_CASES = {
    "Simple Line": () => {
        const feats: FeaturePoint[] = [];
        for (let i = 0; i < 50; i++) {
            const t = 0.2 + i * 0.01;
            feats.push({ theta: 1.0, t, type: 1, strength: 10 });
        }
        return feats;
    },
    "Diagonal": () => {
        return Array.from({ length: 100 }, (_, i) => ({
            theta: i * 0.05,
            t: i * 0.01,
            type: 1,
            strength: 10
        } as FeaturePoint));
    },
    "Spiral": () => {
        const feats: FeaturePoint[] = [];
        for (let i = 0; i < 100; i++) {
            const angle = i * 0.2;
            feats.push({
                theta: angle % (Math.PI * 2),
                t: 0.2 + i * 0.005,
                type: 1,
                strength: 10
            });
        }
        return feats;
    },
    "Cross Seam": () => {
        const feats: FeaturePoint[] = [];
        // Line crossing from x ~ 2PI to x ~ 0
        for (let i = 0; i < 50; i++) {
            let theta = 6.0 + i * 0.1;
            if (theta > Math.PI * 2) theta -= Math.PI * 2;
            feats.push({ theta, t: 0.5, type: 1, strength: 10 });
        }
        return feats;
    }
};

export const TriangulatorVerifier: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [testName, setTestName] = useState<keyof typeof TEST_CASES>("Simple Line");
    const [stats, setStats] = useState<string>("");

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Run Triangulation
        const features = TEST_CASES[testName]();
        console.time('Triangulate');
        const mesh = ConstrainedTriangulator.generateFullPot(features);
        console.timeEnd('Triangulate');

        setStats(`Verts: ${mesh.vertices.length / 3}, Tris: ${mesh.indices.length / 3}`);

        // Render
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        // Draw Background
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, W, H);

        // 1. Draw Triangles
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;

        // Scale: Theta 0..2PI -> 0..W, T 0..1 -> H..0
        const toX = (theta: number) => (theta / (Math.PI * 2)) * W;
        const toY = (t: number) => (1.0 - t) * H;

        for (let i = 0; i < mesh.indices.length; i += 3) {
            const i0 = mesh.indices[i];
            const i1 = mesh.indices[i + 1];
            const i2 = mesh.indices[i + 2];

            const x0 = toX(mesh.vertices[i0 * 3]);
            const y0 = toY(mesh.vertices[i0 * 3 + 1]);
            const x1 = toX(mesh.vertices[i1 * 3]);
            const y1 = toY(mesh.vertices[i1 * 3 + 1]);
            const x2 = toX(mesh.vertices[i2 * 3]);
            const y2 = toY(mesh.vertices[i2 * 3 + 1]);

            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.closePath();
            ctx.stroke();

            // Highlight seams (x=0 or x=W)
            if (x0 < 5 || x0 > W - 5) ctx.fillStyle = 'red';
        }

        // 2. Draw Features (Red)
        ctx.fillStyle = 'red';
        features.forEach(f => {
            const x = toX(f.theta);
            const y = toY(f.t);
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fill();
        });

    }, [testName]);

    return (
        <div style={{ padding: 20, background: '#000', color: 'white', minHeight: '100vh' }}>
            <h2>Constrained Triangulator Verification</h2>
            <div style={{ marginBottom: 20, display: 'flex', gap: 10 }}>
                {Object.keys(TEST_CASES).map(name => (
                    <button
                        key={name}
                        onClick={() => setTestName(name as any)}
                        style={{
                            padding: '8px 16px',
                            background: testName === name ? '#3b82f6' : '#333',
                            border: 'none',
                            color: 'white',
                            cursor: 'pointer'
                        }}
                    >
                        {name}
                    </button>
                ))}
            </div>
            <div>Stats: {stats}</div>
            <div style={{ border: '1px solid #444', display: 'inline-block' }}>
                <canvas ref={canvasRef} width={1000} height={500} />
            </div>
            <p style={{ color: '#888', fontSize: 12 }}>
                Red dots = Input Features.<br />
                Grey lines = Resulting Delaunay edges.<br />
                Check for bumpy edges or missing triangles. The mesh should look uniform in empty areas (Poisson) and conform to features.
            </p>
        </div>
    );
};
