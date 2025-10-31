from __future__ import annotations
from pathlib import Path
import tempfile
import streamlit as st

from typing import Any, Callable
import importlib

from .imports import validate_recipe, load_config, build_from_yaml


def render_batch_tab() -> None:
    st.subheader("Build from YAML")
    yaml_file = st.file_uploader("Select a YAML file (v1 or v2)", type=["yaml", "yml"])
    do_previews = st.checkbox("Save preview PNGs", value=True)
    do_zip = st.checkbox("Make ZIP per recipe", value=True)
    write_manifest = st.checkbox("Write manifest.json", value=True)

    outdir = st.text_input("Output folder", value="out")
    colA, colB = st.columns(2)
    dryrun = colA.button("Validate Only")
    run = colB.button("Build from YAML", type="primary", disabled=not yaml_file)

    cobj: Any = None
    if yaml_file is not None and load_config is not None:
        try:
            tmp = Path(tempfile.gettempdir()) / f"_pf2_{yaml_file.name}"
            tmp.write_bytes(yaml_file.read())
            cobj = load_config(tmp)
            recs = list(getattr(cobj, "recipes", []) or [])
            ver = getattr(cobj, "version", None) or getattr(
                cobj, "schema_version", None
            )
            st.caption(
                f"Detected {len(recs)} recipe(s){f', schema v{ver}' if ver else ''}."
            )
            migrated = getattr(cobj, "_migrated", False) or getattr(
                cobj, "migrated", False
            )
            if migrated:
                st.info("This file was migrated from v1 → v2 on load.")
        except Exception as e:
            st.error(f"Failed to parse YAML: {e}")
            if st.button("Retry YAML upload"):
                st.session_state.pop("yaml_file", None)
                st.rerun()

    if dryrun and cobj is not None:
        recs = list(getattr(cobj, "recipes", []) or [])
        for r in recs:
            name_r = (
                r.get("name") if isinstance(r, dict) else str(getattr(r, "name", r))
            )
            # validate_recipe may be absent at runtime. Check callability and
            # provide a user-visible message if the validator isn't available.
            _imports_mod = importlib.import_module("pfui.imports")
            validator = getattr(_imports_mod, "validate_recipe", None)
            if not callable(validator):
                st.info(f"{name_r}: Validator not available in this build")
                continue
            try:
                errs = validator(r, cobj)
            except TypeError:
                st.info(f"{name_r}: Validator not available in this build")
                continue
            except Exception as e:
                st.error(f"Validation failed for {name_r}: {e}")
                continue

            if errs:
                st.error(f"{name_r}: Errors: {len(errs)} - " + "; ".join(errs))
            else:
                st.success(f"{name_r}: OK")

    if run and cobj is not None and build_from_yaml is not None:
        # build_from_yaml is dynamically resolved; check callability before
        # invoking. Use a safe status context if Streamlit provides it, otherwise
        # fall back to a no-op context manager.
        _imports_mod = importlib.import_module("pfui.imports")
        builder = getattr(_imports_mod, "build_from_yaml", None)
        if not callable(builder):
            st.error("Build function not available in this build")
            return

        status_ctx = getattr(st, "status", None)
        if callable(status_ctx):
            ctx = status_ctx("Building…", expanded=True)
        else:
            # Fallback no-op context manager
            class _NoopCtx:
                def __enter__(self) -> Any:
                    return self

                def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
                    return None

                def update(self, **_kwargs: Any) -> None:  # pragma: no cover - fallback
                    return None

            ctx = _NoopCtx()

        with ctx as s:
            try:
                st.write("Preparing jobs")
                manifest = builder(
                    cobj,
                    Path(outdir),
                    do_previews=do_previews,
                    do_zip=do_zip,
                    write_manifest=write_manifest,
                )
                st.write("Finalizing")
                # s may be a Streamlit status object or our noop; call update
                try:
                    s.update(label="Build complete", state="complete")
                except Exception:
                    pass
                st.json(manifest)
            except Exception as e:
                try:
                    s.update(label="Build failed", state="error")
                except Exception:
                    pass
                st.error(f"Batch failed: {e}")
