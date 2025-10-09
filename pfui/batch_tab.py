from __future__ import annotations
from pathlib import Path
import tempfile
import streamlit as st

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

    cobj = None
    if yaml_file is not None and load_config is not None:
        try:
            tmp = Path(tempfile.gettempdir()) / f"_pf2_{yaml_file.name}"
            tmp.write_bytes(yaml_file.read())
            cobj = load_config(tmp)
            recs = list(getattr(cobj, "recipes", []) or [])
            ver = getattr(cobj, "version", None) or getattr(cobj, "schema_version", None)
            st.caption(f"Detected {len(recs)} recipe(s){f', schema v{ver}' if ver else ''}.")
            migrated = getattr(cobj, "_migrated", False) or getattr(cobj, "migrated", False)
            if migrated:
                st.info("This file was migrated from v1 → v2 on load.")
        except Exception as e:
            st.error(f"Failed to parse YAML: {e}")
            if st.button("Retry YAML upload"):
                st.session_state.pop("yaml_file", None)
                st.rerun()

    if dryrun and cobj is not None:
        try:
            recs = list(getattr(cobj, "recipes", []) or [])
            for r in recs:
                name_r = r.get("name") if isinstance(r, dict) else str(getattr(r, "name", r))
                if validate_recipe is None:
                    st.info(f"{name_r}: Validator not available in this build")
                else:
                    errs = validate_recipe(r, cobj)  # type: ignore[arg-type]
                    if errs:
                        st.error(f"{name_r}: Errors: {len(errs)} - " + "; ".join(errs))
                    else:
                        st.success(f"{name_r}: OK")
        except Exception as e:
            st.error(f"Validation failed: {e}")

    if run and cobj is not None and build_from_yaml is not None:
        with st.status("Building…", expanded=True) as s:
            try:
                st.write("Preparing jobs")
                manifest = build_from_yaml(cobj, Path(outdir),
                                           do_previews=do_previews, do_zip=do_zip, write_manifest=write_manifest)
                st.write("Finalizing")
                s.update(label="Build complete", state="complete")
                st.json(manifest)
            except Exception as e:
                s.update(label="Build failed", state="error")
                st.error(f"Batch failed: {e}")