import time

from pfui.app_components.plotting import should_regenerate


def test_auto_mode_with_cached_and_same_sigs():
    geom_sig = (1.0, 2.0)
    app_sig = ("p", "q")
    last_geom = geom_sig
    last_app = app_sig
    assert (
        should_regenerate(
            geom_sig,
            app_sig,
            last_geom_sig=last_geom,
            last_app_sig=last_app,
            preview_mode="auto",
            preview_stale=False,
            cached_any=True,
            last_change_ts=time.time(),
            debounce_timeout_s=0.5,
        )
        is False
    )


def test_auto_mode_with_changed_geom():
    geom_sig = (1.0, 2.0)
    app_sig = ("p", "q")
    last_geom = (9.9, 9.9)
    last_app = app_sig
    assert (
        should_regenerate(
            geom_sig,
            app_sig,
            last_geom_sig=last_geom,
            last_app_sig=last_app,
            preview_mode="auto",
            preview_stale=False,
            cached_any=True,
            last_change_ts=time.time(),
            debounce_timeout_s=0.5,
        )
        is True
    )


def test_manual_mode_never_auto():
    assert (
        should_regenerate(
            None,
            None,
            last_geom_sig=None,
            last_app_sig=None,
            preview_mode="manual",
            preview_stale=True,
            cached_any=False,
            last_change_ts=time.time(),
            debounce_timeout_s=0.1,
        )
        is False
    )


def test_debounced_before_timeout():
    now = time.time()
    assert (
        should_regenerate(
            None,
            None,
            last_geom_sig=None,
            last_app_sig=None,
            preview_mode="debounced",
            preview_stale=True,
            cached_any=False,
            last_change_ts=now,
            debounce_timeout_s=2.0,
        )
        is False
    )


def test_debounced_after_timeout():
    now = time.time() - 5.0
    assert (
        should_regenerate(
            None,
            None,
            last_geom_sig=None,
            last_app_sig=None,
            preview_mode="debounced",
            preview_stale=True,
            cached_any=False,
            last_change_ts=now,
            debounce_timeout_s=1.0,
        )
        is True
    )
