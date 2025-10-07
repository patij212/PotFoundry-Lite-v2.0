# Deep Link State Restoration

## Overview
Deep links allow users to share or restore a specific pot design configuration by encoding the design parameters in the URL. When a user clicks "Open in editor" from the Public Library, the app loads with all parameters pre-filled.

## URL Format

### Structure
```
https://your-app.streamlit.app/?state=<base64url-encoded-json>
```

### Example
```
https://potfoundry.streamlit.app/?state=eyJzdHlsZSI6Ikhhcm1vbmljUmlwcGxlIiwiaGVpZ2h0IjoxMjAuMCwidG9wX29kIjoxMDUuNSwic2l6ZSI6eyJib3R0b21fb2QiOjk1LjUsIndhbGxfdGhpY2tuZXNzIjoyLjV9LCJvcHRzIjp7ImZyZXEiOjguMCwiYW1wIjoyLjV9fQ==
```

Decoded:
```json
{
  "style": "HarmonicRipple",
  "height": 120.0,
  "top_od": 105.5,
  "size": {
    "bottom_od": 95.5,
    "wall_thickness": 2.5
  },
  "opts": {
    "freq": 8.0,
    "amp": 2.5
  }
}
```

## Encoding

### Python Implementation
```python
import base64
import json
from urllib.parse import quote

def encode_state(state_dict: dict) -> str:
    """Encode state dict to base64url string for URL parameter.
    
    Args:
        state_dict: Design parameters to encode
        
    Returns:
        Base64url-encoded string (URL-safe)
    """
    # Serialize to compact JSON
    json_str = json.dumps(state_dict, separators=(",", ":"))
    
    # Encode to bytes
    json_bytes = json_str.encode("utf-8")
    
    # Base64url encode (URL-safe variant)
    b64_bytes = base64.urlsafe_b64encode(json_bytes)
    
    # Return as string (no padding needed for URL)
    return b64_bytes.decode("ascii").rstrip("=")

# Example usage
state = {
    "style": "HarmonicRipple",
    "H": 120.0,
    "top_od": 105.5,
    "bottom_od": 95.5,
    "t_wall": 2.5,
    "t_bottom": 3.0,
    "r_drain": 6.0,
    "expn": 1.5,
    "opts": {"freq": 8.0, "amp": 2.5}
}

encoded = encode_state(state)
url = f"https://your-app.streamlit.app/?state={encoded}"
```

## Decoding

### Python Implementation
```python
import base64
import json

def decode_state(encoded: str) -> dict:
    """Decode base64url string to state dict.
    
    Args:
        encoded: Base64url-encoded string from URL parameter
        
    Returns:
        Decoded state dictionary
        
    Raises:
        ValueError: If decoding fails (invalid base64 or JSON)
    """
    try:
        # Add padding if needed (base64 requires length % 4 == 0)
        padding = (4 - len(encoded) % 4) % 4
        encoded_padded = encoded + ("=" * padding)
        
        # Decode base64url
        json_bytes = base64.urlsafe_b64decode(encoded_padded)
        
        # Decode JSON
        state_dict = json.loads(json_bytes.decode("utf-8"))
        
        return state_dict
    except Exception as e:
        raise ValueError(f"Invalid state parameter: {e}")

# Example usage
encoded = "eyJzdHlsZSI6Ikhhcm1vbmljUmlwcGxlIiwiSCI6MTIwLjB9"
state = decode_state(encoded)
# state = {"style": "HarmonicRipple", "H": 120.0}
```

## Application Integration

### Streamlit App Startup
```python
import streamlit as st
from pfui.deeplink import decode_state, apply_state

# Check for state parameter on app load
query_params = st.experimental_get_query_params()
if "state" in query_params:
    encoded_state = query_params["state"][0]
    
    try:
        state_dict = decode_state(encoded_state)
        apply_state(state_dict)
        
        # Clear query param to avoid reapplying on every rerun
        st.experimental_set_query_params()
        
        st.success(f"Loaded design: {state_dict.get('style', 'Unknown')}")
        st.rerun()
    except ValueError as e:
        st.error(f"Failed to load design from link: {e}")
```

### State Application
```python
from pfui.state import queue_update

def apply_state(state_dict: dict):
    """Apply state dict to session state (validate and update).
    
    Args:
        state_dict: Decoded state parameters
    """
    # Whitelist allowed keys (security: prevent arbitrary state injection)
    ALLOWED_KEYS = {
        "style", "H", "top_od", "bottom_od", "t_wall", "t_bottom",
        "r_drain", "expn", "n_theta", "n_z", "opts"
    }
    
    # Validate and filter
    validated = {}
    for key, value in state_dict.items():
        if key not in ALLOWED_KEYS:
            continue  # Ignore unknown keys
        
        # Type validation
        if key == "style":
            if not isinstance(value, str):
                continue
            # Validate against known styles
            from pfui.imports import STYLES
            if value not in STYLES:
                continue
            validated[key] = value
        elif key == "opts":
            if not isinstance(value, dict):
                continue
            validated[key] = value
        else:
            # Numeric parameters
            if not isinstance(value, (int, float)):
                continue
            validated[key] = float(value)
    
    # Queue updates via existing state management
    queue_update(validated)
```

## Whitelisted Parameters

### Geometry Parameters
- `style`: Style name (string, must match STYLES registry)
- `H`: Height in mm (float, 20-500)
- `top_od`: Top outer diameter in mm (float, 30-400)
- `bottom_od`: Bottom outer diameter in mm (float, 30-400)
- `t_wall`: Wall thickness in mm (float, 1.5-20)
- `t_bottom`: Bottom thickness in mm (float, 2.0-30)
- `r_drain`: Drain hole radius in mm (float, 2.0-50)
- `expn`: Flare exponent (float, 0.5-4.0)

### Mesh Quality
- `n_theta`: Theta segments (int, 24-360)
- `n_z`: Z segments (int, 16-256)
- `twist`: Twist amount (float, 0.0-360.0)

### Style Options
- `opts`: Dictionary of style-specific parameters (validated against style schema)

**Note**: Only whitelisted keys are applied. Unknown keys are silently ignored for security.

## Security Considerations

### Validation
1. **Whitelist-based**: Only known parameters accepted
2. **Type checking**: Ensure correct types (float, int, str, dict)
3. **Range validation**: Clamp values to reasonable ranges
4. **Schema validation**: Style opts must match style schema
5. **No code execution**: Pure data (JSON only, no eval)

### Attack Vectors Mitigated
- **Arbitrary state injection**: Whitelist prevents unknown keys
- **Type confusion**: Explicit type checking
- **Resource exhaustion**: Range limits prevent extreme values (e.g., n_theta=1000000)
- **XSS**: No HTML/JS in state (JSON data only)

### Best Practices
- Always validate decoded state before applying
- Use schema validation for complex nested structures (opts)
- Log suspicious decode attempts (malformed base64, unexpected keys)
- Consider rate limiting deep link applications (prevent link spam)

## URL Length Limits

### Practical Limits
- **Browser**: ~2,000 characters (safe cross-browser)
- **Streamlit**: No specific limit, but keep under 2KB
- **Typical state size**: 100-500 characters (well under limit)

### Optimization
If state exceeds ~1,000 characters:
1. **Omit defaults**: Only encode non-default values
2. **Abbreviate keys**: Use short key names (e.g., `h` instead of `height`)
3. **Use gzip**: Compress JSON before base64 (if > 500 bytes)

Example with compression:
```python
import gzip

def encode_state_compressed(state_dict: dict) -> str:
    json_str = json.dumps(state_dict, separators=(",", ":"))
    json_bytes = json_str.encode("utf-8")
    
    if len(json_bytes) > 500:
        # Compress with gzip
        compressed = gzip.compress(json_bytes, compresslevel=9)
        # Prefix with 'z:' to indicate compressed
        return "z:" + base64.urlsafe_b64encode(compressed).decode("ascii").rstrip("=")
    else:
        # Standard encoding
        return base64.urlsafe_b64encode(json_bytes).decode("ascii").rstrip("=")

def decode_state_compressed(encoded: str) -> dict:
    if encoded.startswith("z:"):
        # Compressed format
        encoded = encoded[2:]
        padding = (4 - len(encoded) % 4) % 4
        compressed = base64.urlsafe_b64decode(encoded + "=" * padding)
        json_bytes = gzip.decompress(compressed)
    else:
        # Standard format
        padding = (4 - len(encoded) % 4) % 4
        json_bytes = base64.urlsafe_b64decode(encoded + "=" * padding)
    
    return json.loads(json_bytes.decode("utf-8"))
```

## Error Handling

### User-Friendly Messages
```python
def safe_decode_state(encoded: str) -> dict | None:
    """Decode state with graceful error handling.
    
    Returns:
        Decoded state dict or None if invalid
    """
    try:
        return decode_state(encoded)
    except Exception as e:
        # Log error for debugging
        import logging
        logging.warning(f"Deep link decode failed: {e}")
        
        # Show user-friendly message
        st.warning("The design link is invalid or corrupted. Starting with default settings.")
        return None
```

### Validation Errors
```python
def validate_state(state_dict: dict) -> tuple[dict, list[str]]:
    """Validate state dict and return cleaned dict + warnings.
    
    Returns:
        (validated_dict, warnings_list)
    """
    validated = {}
    warnings = []
    
    # Validate each parameter
    if "H" in state_dict:
        h = state_dict["H"]
        if h < 20 or h > 500:
            warnings.append(f"Height {h} out of range, using default")
        else:
            validated["H"] = h
    
    # ... (repeat for other params)
    
    return validated, warnings

# Usage
state_dict = decode_state(encoded)
validated, warnings = validate_state(state_dict)
for warning in warnings:
    st.warning(warning)
apply_state(validated)
```

## Library UI Integration

### "Open in Editor" Button
```python
import streamlit as st
from pfui.deeplink import encode_state

def render_library_card(design: dict):
    """Render a library design card with deep link."""
    st.image(design["thumb_url"])
    st.write(f"**{design['title']}**")
    st.write(f"Style: {design['style']}")
    
    # Download STL
    st.download_button(
        "Download STL",
        data=requests.get(design["stl_url"]).content,
        file_name=f"{design['id']}.stl",
        mime="application/octet-stream"
    )
    
    # Open in editor (deep link)
    state_to_encode = {
        "style": design["style"],
        "H": design["size"]["height"],
        "top_od": design["size"]["top_od"],
        "bottom_od": design["size"]["bottom_od"],
        "t_wall": design["size"]["wall_thickness"],
        "t_bottom": design["size"]["bottom_thickness"],
        "r_drain": design["size"]["drain_radius"],
        "expn": design["size"]["flare_exp"],
        "opts": design["opts"],
    }
    
    encoded = encode_state(state_to_encode)
    deep_link = f"{st.secrets.get('app_url', 'http://localhost:8501')}/?state={encoded}"
    
    st.link_button("Open in Editor", deep_link)
```

### Copy Link Button
```python
def copy_link_button(encoded_state: str):
    """Render a copy-to-clipboard button for deep link."""
    deep_link = f"{st.secrets.get('app_url', 'http://localhost:8501')}/?state={encoded_state}"
    
    st.code(deep_link, language=None)
    
    # JavaScript copy to clipboard (via st.components)
    st.button(
        "📋 Copy Link",
        on_click=lambda: st.toast("Link copied to clipboard!")
    )
```

## Testing

### Unit Tests
```python
import pytest
from pfui.deeplink import encode_state, decode_state

def test_encode_decode_roundtrip():
    """Test that encode -> decode is symmetric."""
    state = {
        "style": "HarmonicRipple",
        "H": 120.0,
        "top_od": 105.5,
        "opts": {"freq": 8.0, "amp": 2.5}
    }
    
    encoded = encode_state(state)
    decoded = decode_state(encoded)
    
    assert decoded == state

def test_decode_invalid_base64():
    """Test that invalid base64 raises ValueError."""
    with pytest.raises(ValueError):
        decode_state("not-valid-base64!!!")

def test_url_safe_characters():
    """Test that encoded string is URL-safe."""
    state = {"style": "Test", "value": 123.456}
    encoded = encode_state(state)
    
    # Should not contain +, /, or = (URL-unsafe chars)
    assert "+" not in encoded
    assert "/" not in encoded
    # Note: padding stripped, so = may be absent

def test_large_state():
    """Test encoding large state dict."""
    state = {
        "style": "SuperformulaBlossom",
        "opts": {f"param_{i}": float(i) for i in range(50)}
    }
    
    encoded = encode_state(state)
    decoded = decode_state(encoded)
    
    assert len(encoded) < 2000  # Under URL limit
    assert decoded == state
```

## Examples

### Minimal State (Default Values)
```python
# Only override style and height
state = {
    "style": "HarmonicRipple",
    "H": 150.0
}
# URL: ?state=eyJzdHlsZSI6Ikhhcm1vbmljUmlwcGxlIiwiSCI6MTUwLjB9
```

### Full State (All Parameters)
```python
state = {
    "style": "SuperformulaBlossom",
    "H": 120.0,
    "top_od": 105.5,
    "bottom_od": 95.5,
    "t_wall": 2.5,
    "t_bottom": 3.0,
    "r_drain": 6.0,
    "expn": 1.5,
    "n_theta": 144,
    "n_z": 64,
    "opts": {
        "m": 6.0,
        "n1": 2.0,
        "n2": 3.0,
        "n3": 4.0,
        "a": 1.0,
        "b": 1.0
    }
}
# URL: ?state=<long-encoded-string>
```

### Share Link Generation
```python
def generate_share_link(session_state: dict) -> str:
    """Generate shareable link from current session state."""
    from pfui.deeplink import encode_state
    
    # Extract relevant parameters
    state = {
        "style": session_state["style"],
        "H": session_state["H"],
        "top_od": session_state["top_od"],
        "bottom_od": session_state["bottom_od"],
        "t_wall": session_state["t_wall"],
        "t_bottom": session_state["t_bottom"],
        "r_drain": session_state["r_drain"],
        "expn": session_state["expn"],
        "opts": session_state.get("_current_opts", {})
    }
    
    encoded = encode_state(state)
    base_url = st.secrets.get("app_url", "http://localhost:8501")
    return f"{base_url}/?state={encoded}"
```

## Future Enhancements

### Versioning
Add version prefix to support schema changes:
```
?state=v2:<base64-encoded-state>
```

### Shortened URLs
Use URL shortener service (bit.ly, custom) for sharing:
```python
def create_short_link(state_dict: dict) -> str:
    encoded = encode_state(state_dict)
    long_url = f"{BASE_URL}/?state={encoded}"
    
    # Use URL shortener API
    short_url = requests.post(
        "https://api.short.io/links",
        json={"originalURL": long_url},
        headers={"Authorization": SHORT_IO_KEY}
    ).json()["shortURL"]
    
    return short_url
```

### QR Codes
Generate QR code for mobile sharing:
```python
import qrcode
from io import BytesIO

def generate_qr_code(deep_link: str) -> bytes:
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(deep_link)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

# Usage
st.image(generate_qr_code(deep_link), caption="Scan to open design")
```

## References
- Base64 URL-safe encoding: https://datatracker.ietf.org/doc/html/rfc4648#section-5
- Streamlit query params: https://docs.streamlit.io/library/api-reference/utilities/st.experimental_get_query_params
- URL length limits: https://stackoverflow.com/questions/417142/what-is-the-maximum-length-of-a-url-in-different-browsers
