import json
import numpy as np

import pfui.imports as imports_mod
from pfui.preview import make_preview_arrays


def test_all_styles_vectorized_at_full_resolution():
    """Ensure every registered style supports vectorized theta input at full resolution.

    This detects styles that silently force per-theta fallbacks, which may cause
    full-preview performance or correctness surprises.
    """
    failures = []
    # Use full-resolution sizes
    H = 120.0
    Rt = 70.0
    Rb = 40.0
    expn = 1.1
    n_theta = 96
    n_z = 48
    opts_json = json.dumps({})

    STYLES = imports_mod.STYLES
    original = dict(STYLES)
    try:
        for name, entry in original.items():
            rfn, desc = entry[0], entry[1] if len(entry) > 1 else (None)
            counters = {"vec": 0, "scalar": 0}

            def make_wrapper(fn):
                def wrapper(theta_or_scalar, z, r0, H_arg, opts):
                    try:
                        if isinstance(theta_or_scalar, np.ndarray):
                            counters["vec"] += 1
                        else:
                            counters["scalar"] += 1
                    except Exception:
                        counters["scalar"] += 1
                    # Forward to original
                    return fn(theta_or_scalar, z, r0, H_arg, opts)

                return wrapper

            STYLES[name] = (make_wrapper(rfn), desc)

            # Call at full resolution
            try:
                X, Y, Z = make_preview_arrays(H, Rt, Rb, expn, n_theta, n_z, name, opts_json)
            except Exception as e:
                failures.append((name, f"exception during make_preview_arrays: {e}"))
                # restore and continue
                STYLES[name] = original[name]
                continue

            # if vectorized wrapper was never called, the style did not accept ndarray
            if counters["vec"] == 0:
                failures.append((name, f"no vectorized calls observed (scalar-only)"))

            # restore original
            STYLES[name] = original[name]

    finally:
        # Ensure restoration in case of test interruption
        imports_mod.STYLES.clear()
        imports_mod.STYLES.update(original)

    assert not failures, f"Found non-vectorized or failing styles: {failures}"
