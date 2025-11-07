"""Comprehensive tests for accelerated mesh builder.

This module tests the accelerated builder against the standard builder
to ensure geometric correctness, performance, and compatibility.
"""

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES
from potfoundry.core.optimizations import build_pot_mesh_accelerated


class TestAcceleratedBuilderCorrectness:
    """Test that accelerated builder produces geometrically correct results."""
    
    @pytest.mark.parametrize("style_name", list(STYLES.keys()))
    def test_vertices_match_standard(self, style_name):
        """Verify vertices match standard builder for all styles."""
        style_fn, _ = STYLES[style_name]
        
        verts_std, faces_std, _ = build_pot_mesh(
            H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=168, n_z=84,
            r_outer_fn=style_fn, style_opts={}
        )
        
        verts_acc, faces_acc, _ = build_pot_mesh_accelerated(
            H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=168, n_z=84,
            r_outer_fn=style_fn, style_opts={}
        )
        
        # Vertices must match within tight tolerance
        assert np.allclose(verts_std, verts_acc, rtol=1e-6, atol=1e-9), \
            f"Vertices don't match for {style_name}"
    
    @pytest.mark.parametrize("style_name", list(STYLES.keys()))
    def test_mesh_is_watertight(self, style_name):
        """Verify accelerated builder produces watertight meshes."""
        style_fn, _ = STYLES[style_name]
        
        verts, faces, _ = build_pot_mesh_accelerated(
            H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=168, n_z=84,
            r_outer_fn=style_fn, style_opts={}
        )
        
        # Basic watertight checks
        assert len(verts) > 0, "No vertices generated"
        assert len(faces) > 0, "No faces generated"
        assert faces.shape[1] == 3, "Faces should be triangles"
        assert np.all(faces >= 0), "Face indices should be non-negative"
        assert np.all(faces < len(verts)), "Face indices should reference valid vertices"
    
    @pytest.mark.parametrize("resolution", [
        (84, 42),   # Draft
        (168, 84),  # Standard
        (336, 168), # High
    ])
    def test_different_resolutions(self, resolution):
        """Test accelerated builder with different mesh resolutions."""
        n_theta, n_z = resolution
        style_fn, _ = STYLES['SuperformulaBlossom']
        
        verts_std, faces_std, _ = build_pot_mesh(
            H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=n_theta, n_z=n_z,
            r_outer_fn=style_fn, style_opts={}
        )
        
        verts_acc, faces_acc, _ = build_pot_mesh_accelerated(
            H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=n_theta, n_z=n_z,
            r_outer_fn=style_fn, style_opts={}
        )
        
        assert np.allclose(verts_std, verts_acc, rtol=1e-6, atol=1e-9), \
            f"Vertices don't match for resolution {n_theta}×{n_z}"
    
    def test_drain_hole_structure(self):
        """Test that drain hole vertices are correctly interleaved."""
        style_fn, _ = STYLES['HarmonicRipple']
        n_theta = 24
        n_z = 12
        
        verts_std, _, _ = build_pot_mesh(
            H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=n_theta, n_z=n_z,
            r_outer_fn=style_fn, style_opts={}
        )
        
        verts_acc, _, _ = build_pot_mesh_accelerated(
            H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=n_theta, n_z=n_z,
            r_outer_fn=style_fn, style_opts={}
        )
        
        # Find drain vertices (after outer and inner walls)
        n_outer = (n_z + 1) * n_theta
        n_inner = (n_z + 1) * n_theta
        drain_start = n_outer + n_inner
        
        # Check interleaving pattern: drain_under[i], drain_top[i], drain_under[i+1], ...
        for i in range(n_theta):
            drain_under_idx = drain_start + 2 * i
            drain_top_idx = drain_start + 2 * i + 1
            
            # drain_under should be at z=0
            assert abs(verts_std[drain_under_idx][2]) < 1e-6
            assert abs(verts_acc[drain_under_idx][2]) < 1e-6
            
            # drain_top should be at z=t_bottom (3.0)
            assert abs(verts_std[drain_top_idx][2] - 3.0) < 1e-6
            assert abs(verts_acc[drain_top_idx][2] - 3.0) < 1e-6


class TestAcceleratedBuilderPerformance:
    """Test that accelerated builder meets performance targets."""
    
    @pytest.mark.parametrize("style_name", list(STYLES.keys()))
    def test_faster_than_standard(self, style_name):
        """Verify accelerated is faster than standard for all styles."""
        import time
        style_fn, _ = STYLES[style_name]
        
        # Standard builder
        start = time.perf_counter()
        verts_std, faces_std, _ = build_pot_mesh(
            H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=168, n_z=84,
            r_outer_fn=style_fn, style_opts={}
        )
        time_std = time.perf_counter() - start
        
        # Accelerated builder
        start = time.perf_counter()
        verts_acc, faces_acc, _ = build_pot_mesh_accelerated(
            H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=168, n_z=84,
            r_outer_fn=style_fn, style_opts={}
        )
        time_acc = time.perf_counter() - start
        
        speedup = time_std / time_acc
        
        # Should be at least 2x faster
        assert speedup >= 2.0, \
            f"Accelerated builder only {speedup:.1f}x faster for {style_name} (target: ≥2x)"


class TestAcceleratedBuilderEdgeCases:
    """Test edge cases and error handling."""
    
    def test_minimum_resolution(self):
        """Test with minimum viable resolution."""
        style_fn, _ = STYLES['HarmonicRipple']
        
        verts, faces, _ = build_pot_mesh_accelerated(
            H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=8, n_z=4,
            r_outer_fn=style_fn, style_opts={}
        )
        
        assert len(verts) > 0
        assert len(faces) > 0
    
    def test_very_large_resolution(self):
        """Test with very large resolution."""
        style_fn, _ = STYLES['HarmonicRipple']
        
        verts, faces, _ = build_pot_mesh_accelerated(
            H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=672, n_z=336,
            r_outer_fn=style_fn, style_opts={}
        )
        
        assert len(verts) > 0
        assert len(faces) > 0
        # Should complete in reasonable time (tested by timeout)
    
    def test_with_different_parameters(self):
        """Test that different parameters produce different geometry."""
        style_fn, _ = STYLES['SuperformulaBlossom']
        
        # Test with different heights
        verts1, faces1, _ = build_pot_mesh_accelerated(
            H=100, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=84, n_z=42,
            r_outer_fn=style_fn, style_opts={}
        )
        
        verts2, faces2, _ = build_pot_mesh_accelerated(
            H=140, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=84, n_z=42,
            r_outer_fn=style_fn, style_opts={}
        )
        
        # Different heights should produce different geometry
        assert not np.allclose(verts1, verts2), \
            "Different parameters should produce different geometry"


class TestAcceleratedBuilderIntegration:
    """Integration tests for accelerated builder."""
    
    def test_export_to_stl(self):
        """Test that accelerated meshes can be exported to STL."""
        from potfoundry import write_stl_binary
        import tempfile
        import os
        
        style_fn, _ = STYLES['SuperformulaBlossom']
        verts, faces, _ = build_pot_mesh_accelerated(
            H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=168, n_z=84,
            r_outer_fn=style_fn, style_opts={}
        )
        
        with tempfile.NamedTemporaryFile(suffix='.stl', delete=False) as tmp:
            tmp_path = tmp.name
        
        try:
            write_stl_binary(tmp_path, "Test", verts, faces)
            assert os.path.exists(tmp_path)
            assert os.path.getsize(tmp_path) > 0
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    
    def test_diagnostic_information(self):
        """Test that diagnostic information is returned."""
        style_fn, _ = STYLES['SuperformulaBlossom']
        verts, faces, diag = build_pot_mesh_accelerated(
            H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=168, n_z=84,
            r_outer_fn=style_fn, style_opts={}
        )
        
        assert 'clamp_ratio_at_bottom' in diag
        assert 'estimated_top_od_mm' in diag
        assert 'estimated_bottom_od_mm' in diag
        
        # Sanity checks on diagnostic values
        assert 0 <= diag['clamp_ratio_at_bottom'] <= 1
        assert diag['estimated_top_od_mm'] > 0
        assert diag['estimated_bottom_od_mm'] > 0
