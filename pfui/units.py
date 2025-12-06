# pfui/units.py
from __future__ import annotations

from pfui._st import get_effective_st as get_st

_MM_PER_IN = 25.4


def _mm_to_in(x: float) -> float:
    return x / _MM_PER_IN


def _in_to_mm(x: float) -> float:
    return x * _MM_PER_IN


def get_units(key: str = "ui__units") -> str:
    """Return current display units ('mm'|'in')."""
    # Treat the retrieved session value as an `object` (not `Any`) so mypy can
    # narrow it with isinstance checks. Assigning to `object` discards the
    # `Any`-ness coming from the runtime `st.session_state` accessor while
    # remaining safe at runtime.
    st = get_st()
    val: object = st.session_state.get(key, "mm")
    if isinstance(val, str):
        return val
    if isinstance(val, (int, float, bool)):
        return str(val)
    # Fallback to default units if the stored value is unexpected.
    return "mm"


def units_selector(*, key: str = "ui__units", location: str = "sidebar") -> str:
    """Renders a single units selector (guarded so it can be called multiple times
    without creating duplicate widgets). The widget key is customizable to avoid
    collisions.
    """
    st = get_st()
    mount_flag = f"{key}__mounted"
    if st.session_state.get(mount_flag):
        # When already mounted, prefer the normalized `get_units` helper which
        # guarantees a `str` return for mypy.
        return get_units(key)

    host = st.sidebar if location == "sidebar" else st
    current = st.session_state.get(key, "mm")
    choice = host.selectbox(
        "Display units",
        options=["mm", "in"],
        index=0 if current == "mm" else 1,
        key=key,
        help="Values display in these units; geometry stays in mm internally.",
    )
    st.session_state[mount_flag] = True
    # Streamlit widgets return Any; coerce to str so mypy sees a stable return type
    return str(choice)


def unit_number_input(
    label: str,
    *,
    min_value: float | None = None,
    max_value: float | None = None,
    value: float = 0.0,
    step: float | None = None,
    format_mm: str = "%.1f",
    format_in: str = "%.2f",
    key: str | None = None,
    help: str | None = None,
    location: str = "sidebar",
) -> float:
    """Number input that shows values in the selected units, but **returns mm**.
    """
    st = get_st()
    host = st.sidebar if location == "sidebar" else st
    units = get_units()

    if units == "in":
        conv = _mm_to_in
        inv = _in_to_mm
        fmt = format_in
    else:

        def conv(x: float) -> float:
            return x

        def inv(x: float) -> float:
            return x

        fmt = format_mm

    def _c(x: float | None) -> float | None:
        return None if x is None else conv(float(x))

    out = host.number_input(
        label,
        min_value=_c(min_value),
        max_value=_c(max_value),
        value=conv(float(value)),
        step=_c(step),
        format=fmt,
        key=key,
        help=help,
    )
    try:
        return float(inv(out))
    except Exception:
        return float(value)


def unit_slider(
    label: str,
    *,
    min_value: float,
    max_value: float,
    value: float,
    step: float | None = None,
    key: str | None = None,
    help: str | None = None,
    location: str = "sidebar",
) -> float:
    """Slider that shows values in the selected units, but **returns mm**.
    """
    st = get_st()
    host = st.sidebar if location == "sidebar" else st
    units = get_units()

    if units == "in":
        conv = _mm_to_in
        inv = _in_to_mm
    else:

        def conv(x: float) -> float:
            return x

        def inv(x: float) -> float:
            return x

    val = host.slider(
        label,
        min_value=float(conv(min_value)),
        max_value=float(conv(max_value)),
        value=float(conv(value)),
        step=None if step is None else float(conv(step)),
        key=key,
        help=help,
    )
    return float(inv(val))
