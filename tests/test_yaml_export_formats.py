"""build_from_yaml export-format selection (STL and/or OBJ).

The batch/programmatic build path historically wrote binary STL only. OBJ is the
indexed format Rhino/Grasshopper import cleanly, so callers must be able to
request it (alone or alongside STL) without breaking the existing STL-only
default. These tests pin the contract:

* default is unchanged (STL only),
* OBJ can be requested and produces a re-parseable indexed mesh,
* both formats can be produced together and both land in the zip,
* unknown formats are rejected early.
"""
from __future__ import annotations

import pytest

from potfoundry.geometry import MeshQuality, PotDefaults
from potfoundry.yaml_api import Config, build_from_yaml


def _cfg():
    return Config(
        version=2,
        outdir="out",
        save_previews=False,
        make_zip=False,
        mesh=MeshQuality(n_theta=48, n_z=24),
        defaults=PotDefaults(),
        presets={},
        recipes=[
            {"name": "pot_a", "style": "SuperformulaBlossom", "size": {}, "opts": {}},
        ],
    )


def test_default_writes_stl_only(tmp_path):
    manifest = build_from_yaml(_cfg(), tmp_path, do_previews=False, do_zip=False)
    assert (tmp_path / "pot_a.stl").exists()
    assert not (tmp_path / "pot_a.obj").exists()
    assert manifest["pots"][0]["stl"].endswith("pot_a.stl")


def test_obj_format(tmp_path):
    manifest = build_from_yaml(
        _cfg(), tmp_path, do_previews=False, do_zip=False, export_formats=("obj",)
    )
    obj_path = tmp_path / "pot_a.obj"
    assert obj_path.exists()
    assert not (tmp_path / "pot_a.stl").exists()

    files = manifest["pots"][0]["files"]
    assert files["obj"].endswith("pot_a.obj")

    # The written OBJ parses back to a non-empty indexed mesh.
    verts = sum(1 for ln in obj_path.read_text().splitlines() if ln.startswith("v "))
    faces = sum(1 for ln in obj_path.read_text().splitlines() if ln.startswith("f "))
    assert verts > 0 and faces > 0
    assert faces == manifest["pots"][0]["faces"]


def test_both_formats_and_zip(tmp_path):
    manifest = build_from_yaml(
        _cfg(), tmp_path, do_previews=False, do_zip=True, export_formats=("stl", "obj")
    )
    assert (tmp_path / "pot_a.stl").exists()
    assert (tmp_path / "pot_a.obj").exists()

    files = manifest["pots"][0]["files"]
    assert files["stl"].endswith("pot_a.stl")
    assert files["obj"].endswith("pot_a.obj")
    # Legacy top-level "stl" key stays for backward compatibility.
    assert manifest["pots"][0]["stl"].endswith("pot_a.stl")

    import zipfile

    zip_path = manifest["zip"]
    with zipfile.ZipFile(zip_path) as zf:
        names = set(zf.namelist())
    assert {"pot_a.stl", "pot_a.obj"} <= names


def test_unknown_format_rejected(tmp_path):
    with pytest.raises((ValueError, SystemExit)):
        build_from_yaml(
            _cfg(), tmp_path, do_previews=False, do_zip=False, export_formats=("step",)
        )
