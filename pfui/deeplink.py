"""Deep link state encoding/decoding for design sharing.

Provides URL-safe encoding of design parameters for "Open in editor" functionality.
"""
from __future__ import annotations

import base64
import json

try:
    import streamlit as st
    HAS_STREAMLIT = True
except ImportError:
    HAS_STREAMLIT = False
    st = None  # type: ignore


# Whitelisted parameters that can be restored from deep links
ALLOWED_GEOMETRY_KEYS = {
    "style", "H", "top_od", "bottom_od", "t_wall", "t_bottom",
    "r_drain", "expn"
}

ALLOWED_MESH_KEYS = {
    "n_theta", "n_z", "twist"
}

ALLOWED_KEYS = ALLOWED_GEOMETRY_KEYS | ALLOWED_MESH_KEYS | {"opts"}


def encode_state(state_dict: dict) -> str:
    """Encode state dictionary to base64url string for URL parameter.
    
    Args:
        state_dict: Design parameters to encode
        
    Returns:
        Base64url-encoded string (URL-safe, no padding)
    
    Example:
        >>> state = {"style": "HarmonicRipple", "H": 120.0}
        >>> encoded = encode_state(state)
        >>> # Returns: "eyJzdHlsZSI6Ikhhcm1vbmljUmlwcGxlIiwiSCI6MTIwLjB9"
    """
    # Serialize to compact JSON (no whitespace)
    json_str = json.dumps(state_dict, separators=(",", ":"), sort_keys=True)
    
    # Encode to bytes
    json_bytes = json_str.encode("utf-8")
    
    # Base64url encode (URL-safe: - and _ instead of + and /)
    b64_bytes = base64.urlsafe_b64encode(json_bytes)
    
    # Return as string without padding (= characters)
    return b64_bytes.decode("ascii").rstrip("=")


def decode_state(encoded: str) -> dict:
    """Decode base64url string to state dictionary.
    
    Args:
        encoded: Base64url-encoded string from URL parameter
        
    Returns:
        Decoded state dictionary
        
    Raises:
        ValueError: If decoding fails (invalid base64 or JSON)
    
    Example:
        >>> encoded = "eyJzdHlsZSI6Ikhhcm1vbmljUmlwcGxlIiwiSCI6MTIwLjB9"
        >>> state = decode_state(encoded)
        >>> # Returns: {"style": "HarmonicRipple", "H": 120.0}
    """
    try:
        # Add padding if needed (base64 requires length % 4 == 0)
        padding = (4 - len(encoded) % 4) % 4
        encoded_padded = encoded + ("=" * padding)
        
        # Decode base64url
        json_bytes = base64.urlsafe_b64decode(encoded_padded)
        
        # Decode JSON
        state_dict = json.loads(json_bytes.decode("utf-8"))
        
        if not isinstance(state_dict, dict):
            raise ValueError("Decoded state is not a dictionary")
        
        return state_dict
    
    except Exception as e:
        raise ValueError(f"Invalid state parameter: {e}")


def validate_state(state_dict: dict) -> tuple[dict, list[str]]:
    """Validate and sanitize state dictionary.
    
    Args:
        state_dict: Decoded state parameters
        
    Returns:
        Tuple of (validated_dict, warnings_list)
        
    Example:
        >>> state = {"style": "Unknown", "H": 999, "evil_key": "hack"}
        >>> validated, warnings = validate_state(state)
        >>> # validated = {}, warnings = ["Unknown key: evil_key", ...]
    """
    from pfui.imports import STYLES
    
    validated = {}
    warnings = []
    
    for key, value in state_dict.items():
        # Check whitelist
        if key not in ALLOWED_KEYS:
            warnings.append(f"Ignoring unknown parameter: {key}")
            continue
        
        # Validate style
        if key == "style":
            if not isinstance(value, str):
                warnings.append(f"Invalid style type: {type(value).__name__}")
                continue
            if value not in STYLES:
                warnings.append(f"Unknown style: {value}")
                continue
            validated[key] = value
        
        # Validate opts (style-specific parameters)
        elif key == "opts":
            if not isinstance(value, dict):
                warnings.append("Invalid opts type (expected dict)")
                continue
            # TODO: Validate against style schema
            validated[key] = value
        
        # Validate numeric parameters
        else:
            if not isinstance(value, (int, float)):
                warnings.append(f"Invalid {key} type: {type(value).__name__}")
                continue
            
            # Range validation
            numeric_value = float(value)
            
            # Height
            if key == "H" and not (20 <= numeric_value <= 500):
                warnings.append(f"Height {numeric_value} out of range (20-500mm)")
                continue
            
            # Diameters
            if key in ("top_od", "bottom_od") and not (30 <= numeric_value <= 400):
                warnings.append(f"{key} {numeric_value} out of range (30-400mm)")
                continue
            
            # Thicknesses
            if key == "t_wall" and not (1.5 <= numeric_value <= 20):
                warnings.append(f"Wall thickness {numeric_value} out of range (1.5-20mm)")
                continue
            
            if key == "t_bottom" and not (2.0 <= numeric_value <= 30):
                warnings.append(f"Bottom thickness {numeric_value} out of range (2.0-30mm)")
                continue
            
            # Drain radius
            if key == "r_drain" and not (2.0 <= numeric_value <= 50):
                warnings.append(f"Drain radius {numeric_value} out of range (2.0-50mm)")
                continue
            
            # Flare exponent
            if key == "expn" and not (0.5 <= numeric_value <= 4.0):
                warnings.append(f"Flare exponent {numeric_value} out of range (0.5-4.0)")
                continue
            
            # Mesh quality
            if key == "n_theta" and not (24 <= numeric_value <= 360):
                warnings.append(f"Theta segments {numeric_value} out of range (24-360)")
                continue
            
            if key == "n_z" and not (16 <= numeric_value <= 256):
                warnings.append(f"Z segments {numeric_value} out of range (16-256)")
                continue
            
            if key == "twist" and not (-360 <= numeric_value <= 360):
                warnings.append(f"Twist {numeric_value} out of range (-360 to 360)")
                continue
            
            validated[key] = numeric_value
    
    return validated, warnings


def apply_state(state_dict: dict, quiet: bool = False) -> list[str]:
    """Apply validated state to session state.
    
    Args:
        state_dict: Validated state parameters
        quiet: If True, don't show warnings in UI
        
    Returns:
        List of warnings generated during validation
    """
    from pfui.state import queue_update
    
    # Validate first
    validated, warnings = validate_state(state_dict)
    
    if not validated:
        if not quiet and warnings:
            if HAS_STREAMLIT and st is not None:
                for warning in warnings:
                    st.warning(warning)
        return warnings
    
    # Queue updates via existing state management
    queue_update(validated)
    
    # Show warnings if not quiet
    if not quiet and warnings and HAS_STREAMLIT and st is not None:
        for warning in warnings:
            st.warning(warning)
    
    return warnings


def extract_state_from_session(session_state: dict) -> dict:
    """Extract encodable state from Streamlit session state.
    
    Args:
        session_state: Streamlit session_state object (or dict)
        
    Returns:
        State dictionary suitable for encoding
    """
    state = {}
    
    # Extract geometry parameters
    for key in ALLOWED_GEOMETRY_KEYS:
        if key in session_state:
            state[key] = session_state[key]
    
    # Extract mesh parameters
    for key in ALLOWED_MESH_KEYS:
        if key in session_state:
            state[key] = session_state[key]
    
    # Extract style opts
    if "_current_opts" in session_state:
        state["opts"] = session_state["_current_opts"]
    
    return state


def generate_deep_link(state_dict: dict, base_url: str = "http://localhost:8501") -> str:
    """Generate full deep link URL from state dictionary.
    
    Args:
        state_dict: Design parameters to encode
        base_url: Base URL of Streamlit app
        
    Returns:
        Full URL with encoded state parameter
    
    Example:
        >>> state = {"style": "HarmonicRipple", "H": 120.0}
        >>> url = generate_deep_link(state, "https://app.streamlit.io")
        >>> # Returns: "https://app.streamlit.io/?state=eyJ..."
    """
    encoded = encode_state(state_dict)
    return f"{base_url.rstrip('/')}/?state={encoded}"


def parse_query_params() -> dict | None:
    """Parse state from URL query parameters (Streamlit-specific).
    
    Returns:
        Decoded state dict if present and valid, None otherwise
    """
    if not HAS_STREAMLIT or st is None:
        return None
    
    try:
        # Get query params (Streamlit >= 1.22)
        if hasattr(st, "query_params"):
            params = st.query_params
            encoded = params.get("state")
        else:
            # Fallback for older Streamlit versions
            params = st.experimental_get_query_params()
            encoded = params.get("state", [None])[0]
        
        if not encoded:
            return None
        
        # Decode state
        state_dict = decode_state(encoded)
        return state_dict
    
    except Exception:
        return None


def clear_query_params():
    """Clear state from URL query parameters (Streamlit-specific)."""
    if not HAS_STREAMLIT or st is None:
        return
    
    try:
        if hasattr(st, "query_params"):
            # Streamlit >= 1.22
            st.query_params.clear()
        else:
            # Fallback for older Streamlit versions
            st.experimental_set_query_params()
    except Exception:
        pass
