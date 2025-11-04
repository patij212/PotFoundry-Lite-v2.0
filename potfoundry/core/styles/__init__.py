"""Style functions for PotFoundry geometric patterns.

This package contains all style functions that define the outer radius modulation
for different decorative patterns. Each style is in its own module for easy
extension and maintenance.

Available Styles:
- HarmonicRipple: Petal-like ripples with harmonic waves
- SpiralRidges: Spiral grooves with customizable parameters
- SuperellipseMorph: Morphing superellipse shapes
- SuperformulaBlossom: Complex superformula patterns
- FourierBloom: Fourier series blooming patterns
- LowPolyFacet: Low-poly faceted geometry

Adding New Styles:
1. Create a new module in this package (e.g., mystyle.py)
2. Define r_outer_mystyle(theta, z, r0, H, opts) function
3. Add import and export in this __init__.py
4. Register in STYLE_FUNCTIONS dict

Style Function Signature:
    def r_outer_stylename(
        theta: NDArrayFloat | float,
        z: float,
        r0: float,
        H: float,
        opts: Dict[str, Any]
    ) -> NDArrayFloat | float:
        '''Compute outer radius at height z and angle(s) theta.
        
        Args:
            theta: Angle(s) in radians (scalar or array)
            z: Height position in mm
            r0: Base radius at this height in mm
            H: Total pot height in mm
            opts: Style-specific parameters dict
            
        Returns:
            Modulated radius (same type as theta)
        '''
"""

# Will be populated as styles are extracted
__all__ = []
