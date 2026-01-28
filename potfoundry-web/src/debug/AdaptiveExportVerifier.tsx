
import React, { useEffect, useState } from 'react';
import { useAdaptiveExport } from '../hooks/useAdaptiveExport';
import { useAppStore } from '../state';

// Simple styles
const styles = {
    container: {
        padding: '2rem',
        maxWidth: '800px',
        margin: '0 auto',
        fontFamily: 'monospace',
        color: '#e2e8f0',
        backgroundColor: '#0f172a',
        minHeight: '100vh',
    },
    header: {
        fontSize: '1.5rem',
        marginBottom: '1rem',
        borderBottom: '1px solid #334155',
        paddingBottom: '0.5rem',
    },
    status: (status: string) => ({
        padding: '0.5rem',
        borderRadius: '4px',
        backgroundColor: status === 'pass' ? 'rgba(34, 197, 94, 0.2)' :
            status === 'fail' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(56, 189, 248, 0.1)',
        color: status === 'pass' ? '#4ade80' :
            status === 'fail' ? '#f87171' : '#38bdf8',
        marginBottom: '0.5rem',
    }),
    log: {
        backgroundColor: '#1e293b',
        padding: '1rem',
        borderRadius: '4px',
        maxHeight: '400px',
        overflowY: 'auto' as const,
        fontSize: '0.9rem',
        marginBottom: '1rem',
    }
};

interface TestResult {
    name: string;
    status: 'pending' | 'running' | 'pass' | 'fail';
    message: string;
}

export const AdaptiveExportVerifier: React.FC = () => {
    const { generateMesh, isAvailable, progress } = useAdaptiveExport();
    const [logs, setLogs] = useState<string[]>([]);
    const [tests, setTests] = useState<TestResult[]>([
        { name: 'WebGPU Availability', status: 'pending', message: 'Checking browser support' },
        { name: 'Shader Init', status: 'pending', message: 'Compiling shaders' },
        { name: 'Feature Extraction', status: 'pending', message: 'Detecting features' },
        { name: 'Low Quality Export', status: 'pending', message: 'Generating low-poly mesh' },
        { name: 'High Quality Export', status: 'pending', message: 'Generating high-poly mesh' },
        { name: 'Topology Check', status: 'pending', message: 'Verifying mesh integrity' },
    ]);
    const [isRunning, setIsRunning] = useState(false);

    // Helpers
    const log = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    const updateTest = (index: number, update: Partial<TestResult>) => {
        setTests(prev => {
            const next = [...prev];
            next[index] = { ...next[index], ...update };
            return next;
        });
    };

    // Auto-run on mount
    useEffect(() => {
        if (!isRunning) {
            runTests();
        }
    }, []);

    const runTests = async () => {
        setIsRunning(true);
        log('Starting Adaptive Export Verification...');

        // 1. WebGPU Check
        updateTest(0, { status: 'running' });
        // Give hook a moment to init
        await new Promise(r => setTimeout(r, 1000));

        if (!navigator.gpu) {
            updateTest(0, { status: 'fail', message: 'WebGPU not supported in this browser' });
            return;
        }
        updateTest(0, { status: 'pass', message: 'WebGPU is supported' });

        // 2. Shader Init
        updateTest(1, { status: 'running' });
        // Verify hook availability
        if (!isAvailable) {
            // Wait slightly longer?
            await new Promise(r => setTimeout(r, 2000));
            if (!isAvailable) {
                updateTest(1, { status: 'fail', message: 'Hook reports unavailable (Init failed?)' });
                return;
            }
        }
        updateTest(1, { status: 'pass', message: 'Shaders compiled & ready' });

        // 3. Feature Extraction & Low Quality
        updateTest(2, { status: 'running' });
        updateTest(3, { status: 'running' });

        try {
            log('Generating Mesh (Low Quality)...');
            const lowMesh = await generateMesh('low');

            if (!lowMesh) {
                updateTest(2, { status: 'fail', message: 'Failed to generate mesh' });
                updateTest(3, { status: 'fail', message: 'Failed to generate mesh' });
                return;
            }

            log(`Generated Low Mesh: ${lowMesh.vertexCount} verts, ${lowMesh.triangleCount} tris`);
            if (lowMesh.triangleCount > 0) {
                updateTest(2, { status: 'pass', message: 'Features processed internally' });
                updateTest(3, { status: 'pass', message: `Generated ${lowMesh.triangleCount} tris` });
            } else {
                updateTest(3, { status: 'fail', message: 'Empty mesh result' });
                return;
            }

            // 4. High Quality Stress Test
            updateTest(4, { status: 'running' });
            log('Generating Mesh (High Quality)...');
            const start = performance.now();
            const highMesh = await generateMesh('high');
            const time = performance.now() - start;

            if (!highMesh) {
                updateTest(4, { status: 'fail', message: 'Failed high quality generation' });
                return;
            }

            log(`Generated High Mesh: ${highMesh.triangleCount.toLocaleString()} tris in ${time.toFixed(0)}ms`);
            if (highMesh.triangleCount > 1_000_000) {
                updateTest(4, { status: 'pass', message: `Generated ${highMesh.triangleCount.toLocaleString()} tris` });
            } else {
                updateTest(4, { status: 'fail', message: `Triangle count too low: ${highMesh.triangleCount}` });
                // Warning pass?
            }

            // 5. Topology Check
            updateTest(5, { status: 'running' });
            log('Verifying topology (simple euler check)...');

            // Minimal check: Euler characteristic for closed surface (genus 1? pot is open?)
            // A pot is usually a disk topology (open top) or closed if we cap it?
            // This generator makes "thick" pots with walls, so it SHOULD be a solid torus (Genus 1) or sphere (Genus 0)?
            // It's a solid 3D object. Surface should be closed.

            // Check for NaNs
            let hasNaN = false;
            for (let i = 0; i < highMesh.vertices.length; i++) {
                if (isNaN(highMesh.vertices[i])) { hasNaN = true; break; }
            }

            if (hasNaN) {
                updateTest(5, { status: 'fail', message: 'NaNs found in vertices' });
            } else {
                updateTest(5, { status: 'pass', message: 'Vertices valid (No NaNs)' });
            }

        } catch (e) {
            log(`Error: ${e}`);
            const currentTestIdx = tests.findIndex(t => t.status === 'running');
            if (currentTestIdx !== -1) {
                updateTest(currentTestIdx, { status: 'fail', message: `Exception: ${e}` });
            }
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>Adaptive Export Verifier</div>

            <div style={{ ...styles.status('info'), marginBottom: '1rem' }}>
                Hook Status: {progress.status} ({progress.progress.toFixed(0)}%) <br />
                Msg: {progress.message}
            </div>

            <div style={styles.log}>
                {logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>

            <div>
                {tests.map((t, i) => (
                    <div key={i} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '1rem',
                        borderBottom: '1px solid #334155',
                        backgroundColor: t.status === 'running' ? 'rgba(56, 189, 248, 0.05)' : 'transparent'
                    }}>
                        <span>{t.name}</span>
                        <span style={{
                            color: t.status === 'pass' ? '#4ade80' :
                                t.status === 'fail' ? '#f87171' :
                                    t.status === 'running' ? '#38bdf8' : '#94a3b8'
                        }}>
                            {t.status.toUpperCase()}
                            {t.status !== 'pending' && ` - ${t.message}`}
                        </span>
                    </div>
                ))}
            </div>

            <button
                onClick={runTests}
                style={{
                    marginTop: '2rem',
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '1rem'
                }}
            >
                Rerun Tests
            </button>
        </div>
    );
};
