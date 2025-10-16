# Property-Based Testing Implementation

## Overview

Implemented property-based testing using Hypothesis to automatically find edge cases and verify invariants in the mesh generation system.

## Status

**Phase 1 Implementation:** Initial framework created with 10 property-based tests

- ✅ 2 tests passing (watertightness, face normals)
- 🚧 8 tests require minor fixes for function signature updates
- ✅ Hypothesis framework installed and configured
- ✅ Comprehensive test strategy documented

## Tests Implemented

### 1. test_property_mesh_is_watertight ✅
**Status:** PASSING  
**Property:** Every edge in the mesh should be shared by exactly 2 faces (manifold property).  
**Benefit:** Ensures all generated meshes are watertight (printable).

### 2. test_property_face_normals_point_outward ✅  
**Status:** PASSING  
**Property:** Face normals should generally point outward from pot center.  
**Benefit:** Validates correct mesh winding and orientation.

### 3. test_property_no_degenerate_triangles
**Status:** Needs signature fix  
**Property:** No triangle should have zero or near-zero area.  
**Benefit:** Prevents rendering/slicing issues.

### 4. test_property_diameter_estimates_within_bounds
**Status:** Needs signature fix  
**Property:** Estimated diameters should match specified bounds within tolerance.  
**Benefit:** Validates diagnostic calculations.

### 5. test_property_state_encoding_roundtrip
**Status:** Needs signature fix  
**Property:** Encoding then decoding state should return equivalent state.  
**Benefit:** Ensures deeplink functionality works correctly.

### 6. test_property_yaml_configuration_roundtrip
**Status:** Needs Path handling fix  
**Property:** YAML configuration can be saved and loaded correctly.  
**Benefit:** Validates batch processing configuration format.

### 7. test_property_volume_increases_with_diameter
**Status:** Needs signature fix  
**Property:** Larger diameter should result in larger volume.  
**Benefit:** Validates geometric consistency.

### 8. test_property_all_styles_produce_valid_meshes
**Status:** Needs signature fix  
**Property:** All style functions should produce valid, renderable meshes.  
**Benefit:** Ensures all 5 styles work correctly.

### 9. test_property_height_matches_mesh_bounds
**Status:** Needs signature fix  
**Property:** Mesh height should match specified height parameter.  
**Benefit:** Validates geometric accuracy.

### 10. test_property_mesh_size_scales_with_resolution
**Status:** Needs signature fix  
**Property:** Mesh vertex/face count should scale with resolution.  
**Benefit:** Ensures resolution parameters work as expected.

## Benefits

### Automatic Edge Case Discovery
- Hypothesis generates hundreds of test cases automatically
- Finds corner cases developers might miss
- Shrinks failing examples to minimal reproducible cases

### Mathematical Property Validation
- Tests invariants (watertightness, orientation, consistency)
- Validates geometric relationships
- Ensures round-trip operations work correctly

### Regression Protection
- Complements existing 275 unit tests
- Provides different perspective on code correctness
- Can run as part of CI/CD pipeline

## Configuration

**Hypothesis Settings:**
```python
@settings(max_examples=50, deadline=2000)
```

- `max_examples`: Number of test cases to generate
- `deadline`: Maximum time per test case (2 seconds)

**Test Strategies:**
- Heights: 30-300mm
- Diameters: 30-300mm
- Wall thickness: 2-8mm
- Resolution: 32-100 theta, 16-50 z

## Next Steps

1. **Fix remaining 8 tests** - Update function signatures to match API
2. **Expand test coverage** - Add more property tests for:
   - STL export round-trips
   - Mesh transformations
   - Preset resolution
3. **Integration with CI** - Add to GitHub Actions workflow
4. **Performance profiling** - Use Hypothesis for performance regression detection

## Dependencies

Added to `requirements-dev.txt`:
- `hypothesis==6.140.4` - Property-based testing framework
- `sortedcontainers==2.4.0` - Required by Hypothesis

## Example Usage

```bash
# Run all property-based tests
python -m pytest tests/test_property_based.py -v

# Run specific property test
python -m pytest tests/test_property_based.py::test_property_mesh_is_watertight -v

# Run with more examples
python -m pytest tests/test_property_based.py --hypothesis-seed=12345
```

## Resources

- [Hypothesis Documentation](https://hypothesis.readthedocs.io/)
- [Property-Based Testing Guide](https://increment.com/testing/in-praise-of-property-based-testing/)

## Impact

**Before:** 275 unit tests (handwritten examples)
**After:** 275 unit tests + 10 property-based tests (automated generation)

**Coverage:** Property-based tests validate system-level invariants that unit tests might miss

**Value:** High - automatically finds edge cases and validates mathematical properties
