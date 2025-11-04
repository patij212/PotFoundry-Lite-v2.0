import time

from pfui.app_components.plotting import orchestrate_preview


def fake_arrays(*args, **kwargs):
    return ("X", "Y", "Z")


def fake_build_mesh(**kwargs):
    return ("V", "F")


def test_orchestrate_regen_calls_arrays_and_mesh_when_needed():
    res = orchestrate_preview(
        H=1,
        Rt=2,
        Rb=3,
        expn=1.0,
        preview_n_theta=16,
        preview_n_z=8,
        full_n_theta=64,
        full_n_z=32,
        style_name="s",
        opts_json="{}",
        preview_mode="auto",
        preview_stale=True,
        last_geom_sig=(0,),
        last_app_sig=(0,),
        geom_sig=(1,),
        app_sig=(1,),
        debounce_timeout_s=0.1,
        last_change_ts=time.time() - 10.0,
        interactive_mesh=True,
        make_preview_arrays_fn=fake_arrays,
        build_mesh_fn=fake_build_mesh,
    )
    assert res["regen"] is True
    assert res["arrays"] == ("X", "Y", "Z")
    assert res["mesh"] == ("V", "F")


def test_orchestrate_skips_when_should_not_regen():
    # When preview_mode is manual we should not regen
    res = orchestrate_preview(
        H=1,
        Rt=2,
        Rb=3,
        expn=1.0,
        preview_n_theta=16,
        preview_n_z=8,
        full_n_theta=64,
        full_n_z=32,
        style_name="s",
        opts_json="{}",
        preview_mode="manual",
        preview_stale=True,
        last_geom_sig=(1,),
        last_app_sig=(1,),
        geom_sig=(1,),
        app_sig=(1,),
        interactive_mesh=True,
        make_preview_arrays_fn=fake_arrays,
        build_mesh_fn=fake_build_mesh,
    )
    assert res["regen"] is False
    assert res["arrays"] is None
    assert res["mesh"] is None


def test_orchestrate_does_not_call_build_mesh_when_not_interactive():
    res = orchestrate_preview(
        H=1,
        Rt=2,
        Rb=3,
        expn=1.0,
        preview_n_theta=16,
        preview_n_z=8,
        full_n_theta=64,
        full_n_z=32,
        style_name="s",
        opts_json="{}",
        preview_mode="auto",
        preview_stale=True,
        last_geom_sig=(0,),
        last_app_sig=(0,),
        geom_sig=(1,),
        app_sig=(1,),
        interactive_mesh=False,
        make_preview_arrays_fn=fake_arrays,
        build_mesh_fn=fake_build_mesh,
    )
    assert res["regen"] is True
    assert res["arrays"] == ("X", "Y", "Z")
    assert res["mesh"] is None
