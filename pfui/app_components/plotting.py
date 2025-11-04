"""Plotting orchestration wrappers (scaffold).

This module will centralize preview update decisions and rendering
pipelines in future refactors. For now, it provides minimal helpers
without changing behavior.
"""

from __future__ import annotations

from typing import Any, Callable, Optional


def should_update_preview(mode: str, *, last_change_ts: float, debounce_timeout_s: float, stale: bool) -> bool:
    """Decide whether to update the preview given mode and session flags.

    Mirrors existing logic in app.py and can be adopted incrementally.
    """
    import time

    if mode == "auto":
        return True
    if mode == "manual":
        return False
    # debounced: update if stale and waited past timeout
    try:
        if stale and (time.time() - float(last_change_ts)) >= float(debounce_timeout_s):
            return True
    except Exception:
        return False
    return False


__all__ = ["should_update_preview"]


def compute_geom_sig(
    H: Any,
    Rt: Any,
    Rb: Any,
    expn: Any,
    preview_n_theta: Any,
    preview_n_z: Any,
    style_name: Any,
    opts_json: Any,
    full_n_theta: Any,
    full_n_z: Any,
) -> Optional[tuple]:
    """Compute the geometry signature tuple used for cache comparison.

    Returns a tuple of strongly-typed primitives or None on failure.
    """
    try:
        return (
            float(H),
            float(Rt),
            float(Rb),
            float(expn),
            int(preview_n_theta),
            int(preview_n_z),
            str(style_name),
            str(opts_json),
            int(full_n_theta),
            int(full_n_z),
        )
    except Exception:
        return None


def compute_app_sig(
    preview_palette: Any,
    preview_grad_c1: Any,
    preview_grad_c2: Any,
    preview_grad_c3: Any,
    mesh_ambient: Any,
    mesh_diffuse: Any,
    mesh_specular: Any,
    mesh_roughness: Any,
    mesh_fresnel: Any,
    show_inner: Any,
    view_elev: Any,
    view_azim: Any,
    fig_w: Any,
    fig_h: Any,
    dpi: Any,
    place_on_ground: Any,
) -> Optional[tuple]:
    """Compute the application/appearance signature tuple used for cache comparison.

    Returns a tuple of primitives or None on failure.
    """
    try:
        return (
            preview_palette,
            preview_grad_c1,
            preview_grad_c2,
            preview_grad_c3,
            float(mesh_ambient),
            float(mesh_diffuse),
            float(mesh_specular),
            float(mesh_roughness),
            float(mesh_fresnel),
            bool(show_inner),
            float(view_elev),
            float(view_azim),
            float(fig_w),
            float(fig_h),
            int(dpi),
            bool(place_on_ground),
        )
    except Exception:
        return None


__all__.extend(["compute_geom_sig", "compute_app_sig"])


def should_regenerate(
    geom_sig: Optional[tuple],
    app_sig: Optional[tuple],
    *,
    last_geom_sig: Optional[tuple],
    last_app_sig: Optional[tuple],
    preview_mode: str,
    preview_stale: bool,
    cached_any: bool,
    last_change_ts: float,
    debounce_timeout_s: float,
) -> bool:
    """Decide whether the preview should be regenerated.

    Mirrors the decision logic used in ``app.py``:
    - In "auto" mode, regenerate unless cached content exists, the preview is
      not stale and both geometry+app signatures match the last-run signatures.
    - In "manual" mode, never regenerate automatically.
    - In "debounced" mode, regenerate only when the preview is marked stale and
      the debounce timeout has elapsed since ``last_change_ts``.

    Returns True when a regenerate should be performed, False otherwise.
    """
    import time

    try:
        mode = str(preview_mode)
    except Exception:
        mode = "auto"

    # Manual mode: never auto-regenerate
    if mode == "manual":
        return False

    # Auto mode: if we have cached artifacts and nothing changed, skip regen
    if mode == "auto":
        try:
            if (
                cached_any
                and not bool(preview_stale)
                and geom_sig is not None
                and app_sig is not None
                and geom_sig == last_geom_sig
                and app_sig == last_app_sig
            ):
                return False
        except Exception:
            # fallthrough to regenerate on unexpected errors
            return True
        return True

    # Debounced mode: regenerate only once stale and timeout elapsed
    if mode == "debounced":
        try:
            if preview_stale and (time.time() - float(last_change_ts)) >= float(
                debounce_timeout_s
            ):
                return True
        except Exception:
            return False
        return False

    # Default conservative behavior: regenerate
    return True


__all__.append("should_regenerate")


def orchestrate_preview(
    H: Any,
    Rt: Any,
    Rb: Any,
    expn: Any,
    preview_n_theta: int,
    preview_n_z: int,
    full_n_theta: int,
    full_n_z: int,
    style_name: Any,
    opts_json: Any,
    *,
    preview_mode: str,
    preview_stale: bool,
    last_geom_sig: Optional[tuple],
    last_app_sig: Optional[tuple],
    geom_sig: Optional[tuple],
    app_sig: Optional[tuple],
    debounce_timeout_s: float = 0.8,
    last_change_ts: float = 0.0,
    interactive_mesh: bool = False,
    # Injected callables for testability / swapping heavy implementations
    make_preview_arrays_fn: Callable | None = None,
    build_mesh_fn: Callable | None = None,
    **mesh_kwargs: Any,
):
    """Orchestrate preview generation decisions and side-effect-free calls.

    This helper centralizes the decision to regenerate and then invokes the
    provided array/mesh builders. It is intentionally side-effect-light: it
    does not touch `st.session_state` itself, allowing callers (app.py) to
    persist results as needed.

    Returns a dict with keys: regen, arrays, mesh, geom_changed, app_changed, error
    """
    # Defaults: use pfui.preview implementations when not provided
    if make_preview_arrays_fn is None:
        from pfui.preview import make_preview_arrays as _mpa

        make_preview_arrays_fn = _mpa

    geom_changed = (geom_sig is None) or (geom_sig != last_geom_sig)
    app_changed = (app_sig is None) or (app_sig != last_app_sig)

    regen = should_regenerate(
        geom_sig,
        app_sig,
        last_geom_sig=last_geom_sig,
        last_app_sig=last_app_sig,
        preview_mode=preview_mode,
        preview_stale=preview_stale,
        cached_any=False,
        last_change_ts=last_change_ts,
        debounce_timeout_s=debounce_timeout_s,
    )

    result: dict[str, Any] = {
        "regen": bool(regen),
        "arrays": None,
        "mesh": None,
        "geom_changed": bool(geom_changed),
        "app_changed": bool(app_changed),
        "error": None,
    }

    if not regen:
        return result

    try:
        X, Y, Z = make_preview_arrays_fn(
            H, Rt, Rb, expn, preview_n_theta, preview_n_z, style_name, opts_json
        )
        result["arrays"] = (X, Y, Z)

        mesh_data = None
        if interactive_mesh and geom_changed and build_mesh_fn is not None:
            # Pass through provided mesh_kwargs to allow callers to supply full geometry args
            mesh_data = build_mesh_fn(
                H=H,
                Rt=Rt,
                Rb=Rb,
                expn=expn,
                n_theta=preview_n_theta,
                n_z=preview_n_z,
                **mesh_kwargs,
            )
        result["mesh"] = mesh_data
    except Exception as e:
        result["error"] = e

    return result


__all__.append("orchestrate_preview")
