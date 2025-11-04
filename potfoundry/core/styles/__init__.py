"""Style functions for PotFoundry geometric patterns.

This package contains all style functions that define the outer radius modulation
for different decorative patterns. Each style is in its own module for easy
extension and maintenance.

Available Styles:
- HarmonicRipple: Petal-like ripples with harmonic waves
- SpiralRidges: Spiral grooves with customizable parameters
- SuperellipseMorph: Morphing superellipse shapes
- SuperformulaBlossom: Complex superformula patterns with edge controls
- FourierBloom: Fourier series blooming patterns
- LowPolyFacet: Low-poly faceted geometry with experimental features

Adding New Styles:
1. Create a new module in this package (e.g., mystyle.py)
2. Define r_outer_mystyle(theta, z, r0, H, opts) function
3. Add import and export in this __init__.py
4. Register in STYLES dict

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

# Import all style functions
from .harmonic_ripple import r_outer_harmonic_ripple
from .spiral_ridges import r_outer_spiral_ridges
from .superellipse_morph import r_outer_superellipse_morph
from .fourier_bloom import r_outer_fourier_bloom
from .superformula_blossom import r_outer_superformula_blossom
from .lowpoly_facet import r_outer_lowpoly_facet

__all__ = [
    "STYLES",
    "r_outer_harmonic_ripple",
    "r_outer_spiral_ridges",
    "r_outer_superellipse_morph",
    "r_outer_fourier_bloom",
    "r_outer_superformula_blossom",
    "r_outer_lowpoly_facet",
]

# Registry of available styles (function, description)
# This matches the original STYLES dict from geometry.py
STYLES = {
    "SuperformulaBlossom": (
        r_outer_superformula_blossom,
        "Petals via Gielis superformula; sharpen toward rim.",
    ),
    "FourierBloom": (
        r_outer_fourier_bloom,
        "Floral ridges from Fourier series; twist offset for helix.",
    ),
    "SpiralRidges": (
        r_outer_spiral_ridges,
        "Helical ridges spiraling around the pot.",
    ),
    "SuperellipseMorph": (
        r_outer_superellipse_morph,
        "Squircle-like cross-sections morphing top→bottom.",
    ),
    "HarmonicRipple": (
        r_outer_harmonic_ripple,
        "Simple ripples from harmonics of the base frequency.",
    ),
    "LowPolyFacet": (
        r_outer_lowpoly_facet,
        "Piecewise-flat facets for low-poly aesthetic; micro-jag reduction.",
    ),
}
