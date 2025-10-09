"""Performance benchmarking tests for PotFoundry.

These tests verify that mesh generation and STL export meet performance targets.
They help detect performance regressions when making code changes.

Performance Targets (as of v2.0):
- Mesh generation (typical resolution): < 200ms
- Binary STL write (30k triangles): < 100ms
- End-to-end workflow: < 500ms

Run with: PYTHONPATH=. pytest tests/test_performance.py -v -s
"""
from __future__ import annotations

import tempfile
import time
from pathlib import Path
from typing import Callable

import numpy as np
import pytest

from potfoundry import build_pot_mesh, write_stl_binary, STYLES


def benchmark(func: Callable, *args, iterations: int = 10, **kwargs) -> dict:
    """Benchmark a function over multiple iterations.

    Args:
        func: Function to benchmark
        *args: Positional arguments for func
        iterations: Number of times to run (default 10)
        **kwargs: Keyword arguments for func

    Returns:
        Dict with timing statistics (mean, std, min, max in seconds)
    """
    times = []
    result = None

    for _ in range(iterations):
        start = time.perf_counter()
        result = func(*args, **kwargs)
        elapsed = time.perf_counter() - start
        times.append(elapsed)

    times = np.array(times)
    return {
        'mean': float(times.mean()),
        'std': float(times.std()),
        'min': float(times.min()),
        'max': float(times.max()),
        'result': result
    }


class TestMeshGenerationPerformance:
    """Test mesh generation performance targets."""

    def test_typical_resolution_performance(self):
        """Verify typical resolution (168×84) generates in < 200ms."""
        style_fn = STYLES["SuperformulaBlossom"][0]

        stats = benchmark(
            build_pot_mesh,
            H=120, Rt=70, Rb=50,
            t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=168, n_z=84,
            r_outer_fn=style_fn, style_opts={},
            iterations=10
        )

        print("\nTypical resolution (168×84):")
        print(f"  Mean: {stats['mean']*1000:.1f}ms")
        print(f"  Std:  {stats['std']*1000:.1f}ms")
        print(f"  Min:  {stats['min']*1000:.1f}ms")
        print(f"  Max:  {stats['max']*1000:.1f}ms")

        # Performance target: should complete in < 200ms on average
        assert stats['mean'] < 0.2, f"Too slow: {stats['mean']*1000:.1f}ms (target: <200ms)"

    def test_low_resolution_performance(self):
        """Verify low resolution (60×30) generates quickly."""
        style_fn = STYLES["SuperformulaBlossom"][0]

        stats = benchmark(
            build_pot_mesh,
            H=120, Rt=70, Rb=50,
            t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=60, n_z=30,
            r_outer_fn=style_fn, style_opts={},
            iterations=20
        )

        print("\nLow resolution (60×30):")
        print(f"  Mean: {stats['mean']*1000:.1f}ms")
        print(f"  Std:  {stats['std']*1000:.1f}ms")

        # Low resolution should be very fast
        assert stats['mean'] < 0.05, f"Too slow for low res: {stats['mean']*1000:.1f}ms"

    def test_high_resolution_performance(self):
        """Verify high resolution (336×168) completes within budget."""
        style_fn = STYLES["SuperformulaBlossom"][0]

        stats = benchmark(
            build_pot_mesh,
            H=120, Rt=70, Rb=50,
            t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=336, n_z=168,
            r_outer_fn=style_fn, style_opts={},
            iterations=5
        )

        print("\nHigh resolution (336×168):")
        print(f"  Mean: {stats['mean']*1000:.1f}ms")
        print(f"  Std:  {stats['std']*1000:.1f}ms")

        # High resolution allowed to be slower, but still reasonable
        assert stats['mean'] < 1.0, f"Too slow for high res: {stats['mean']*1000:.1f}ms"


class TestStylePerformance:
    """Test that all styles meet performance targets."""

    @pytest.mark.parametrize("style_name", [
        "SuperformulaBlossom",
        "FourierBloom",
        "SpiralRidges",
        "SuperellipseMorph",
        "HarmonicRipple",
    ])
    def test_style_performance(self, style_name):
        """Verify each style generates mesh within performance budget."""
        style_fn = STYLES[style_name][0]

        stats = benchmark(
            build_pot_mesh,
            H=120, Rt=70, Rb=50,
            t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=168, n_z=84,
            r_outer_fn=style_fn, style_opts={},
            iterations=10
        )

        print(f"\n{style_name} (168×84):")
        print(f"  Mean: {stats['mean']*1000:.1f}ms")

        # All styles should meet the same performance target
        assert stats['mean'] < 0.2, \
            f"{style_name} too slow: {stats['mean']*1000:.1f}ms (target: <200ms)"


class TestSTLExportPerformance:
    """Test STL export performance."""

    def test_binary_stl_write_performance(self):
        """Verify binary STL write is fast (< 100ms for 30k triangles)."""
        # Generate a typical mesh
        style_fn = STYLES["SuperformulaBlossom"][0]
        verts, faces, _ = build_pot_mesh(
            H=120, Rt=70, Rb=50,
            t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=168, n_z=84,
            r_outer_fn=style_fn, style_opts={}
        )

        print(f"\nMesh: {len(verts)} vertices, {len(faces)} faces")

        # Benchmark STL writing
        with tempfile.TemporaryDirectory() as tmpdir:
            stl_path = Path(tmpdir) / "test.stl"

            stats = benchmark(
                write_stl_binary,
                stl_path, "TestPot", verts, faces,
                iterations=20
            )

            print(f"Binary STL write ({len(faces)} triangles):")
            print(f"  Mean: {stats['mean']*1000:.1f}ms")
            print(f"  Std:  {stats['std']*1000:.1f}ms")

            # Binary STL should be very fast
            assert stats['mean'] < 0.1, \
                f"STL write too slow: {stats['mean']*1000:.1f}ms (target: <100ms)"

    def test_large_mesh_export_performance(self):
        """Verify export works efficiently for large meshes."""
        # Generate high-resolution mesh
        style_fn = STYLES["SuperformulaBlossom"][0]
        verts, faces, _ = build_pot_mesh(
            H=120, Rt=70, Rb=50,
            t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=336, n_z=168,
            r_outer_fn=style_fn, style_opts={}
        )

        print(f"\nLarge mesh: {len(verts)} vertices, {len(faces)} faces")

        with tempfile.TemporaryDirectory() as tmpdir:
            stl_path = Path(tmpdir) / "large.stl"

            stats = benchmark(
                write_stl_binary,
                stl_path, "LargePot", verts, faces,
                iterations=10
            )

            print(f"Large mesh export ({len(faces)} triangles):")
            print(f"  Mean: {stats['mean']*1000:.1f}ms")

            # Even large meshes should export quickly
            assert stats['mean'] < 0.5, \
                f"Large export too slow: {stats['mean']*1000:.1f}ms (target: <500ms)"


class TestEndToEndPerformance:
    """Test complete workflow performance."""

    def test_complete_workflow_performance(self):
        """Verify end-to-end workflow (generate + export) is fast."""
        style_fn = STYLES["SuperformulaBlossom"][0]

        def workflow():
            verts, faces, _ = build_pot_mesh(
                H=120, Rt=70, Rb=50,
                t_wall=3, t_bottom=3, r_drain=10,
                expn=1.1, n_theta=168, n_z=84,
                r_outer_fn=style_fn, style_opts={}
            )

            with tempfile.TemporaryDirectory() as tmpdir:
                stl_path = Path(tmpdir) / "workflow.stl"
                write_stl_binary(stl_path, "WorkflowTest", verts, faces)
                return stl_path.stat().st_size

        stats = benchmark(workflow, iterations=10)

        print("\nEnd-to-end workflow (generate + export):")
        print(f"  Mean: {stats['mean']*1000:.1f}ms")
        print(f"  Std:  {stats['std']*1000:.1f}ms")

        # Complete workflow should be snappy
        assert stats['mean'] < 0.5, \
            f"Workflow too slow: {stats['mean']*1000:.1f}ms (target: <500ms)"


class TestMemoryEfficiency:
    """Test memory usage characteristics."""

    def test_mesh_size_scaling(self):
        """Verify mesh memory usage scales linearly with resolution."""

        style_fn = STYLES["SuperformulaBlossom"][0]

        # Test different resolutions
        resolutions = [
            (60, 30),
            (120, 60),
            (168, 84),
            (240, 120),
        ]

        results = []
        print("\nMemory usage by resolution:")

        for n_theta, n_z in resolutions:
            verts, faces, _ = build_pot_mesh(
                H=120, Rt=70, Rb=50,
                t_wall=3, t_bottom=3, r_drain=10,
                expn=1.1, n_theta=n_theta, n_z=n_z,
                r_outer_fn=style_fn, style_opts={}
            )

            # Estimate memory usage
            verts_bytes = verts.nbytes
            faces_bytes = faces.nbytes
            total_mb = (verts_bytes + faces_bytes) / (1024 * 1024)

            print(f"  {n_theta}×{n_z}: {total_mb:.2f} MB ({len(faces)} faces)")
            results.append((n_theta * n_z, total_mb))

        # Memory should scale roughly linearly
        # Larger resolutions should use more memory
        for i in range(len(results) - 1):
            assert results[i+1][1] > results[i][1], \
                "Memory should increase with resolution"


class TestCachingEffectiveness:
    """Test that caching provides speedup."""

    def test_theta_grid_caching(self):
        """Verify theta grid caching improves performance."""
        from potfoundry.geometry import _theta_grid_cached

        # First call (cache miss)
        start = time.perf_counter()
        _theta_grid_cached(168)
        first_call = time.perf_counter() - start

        # Second call (cache hit)
        start = time.perf_counter()
        _theta_grid_cached(168)
        second_call = time.perf_counter() - start

        print("\nTheta grid caching:")
        print(f"  First call:  {first_call*1000:.3f}ms")
        print(f"  Second call: {second_call*1000:.3f}ms")
        print(f"  Speedup:     {first_call/second_call:.1f}x")

        # Cache hit should be much faster
        assert second_call < first_call * 0.5, \
            "Cache should provide significant speedup"


if __name__ == "__main__":
    # Run with: python tests/test_performance.py
    pytest.main([__file__, "-v", "-s"])
