"""Zero-buffer WebGPU preview embedded in Streamlit.

This implementation follows the project's WebGPU roadmap: the vertex shader
derives positions from the vertex index and a small uniform block, allowing
the browser to redraw extremely large regular grids without re-uploading
per-vertex buffers on parameter change.

Notes:
- If WebGPU is not available, the component shows a friendly message and the
  existing Plotly/PyVista preview code remains the fallback elsewhere in the
  app.

"""

from __future__ import annotations

import logging
import os
import time
from collections.abc import Iterable
from typing import Any

from pfui._st import get_components_v1
from pfui._st import get_effective_st as get_st
from typing import Callable, Optional
from pfui.preview.webgpu_core import build_webgpu_html
from pfui.state import queue_update, queue_webgpu_camera_state

_render_component: Optional[Callable[..., dict[str, Any] | None]] = None
try:  # Optional during initial migration
    from pfui.components.webgpu_component import (
        render_webgpu_component as _render_component,
    )
except Exception:  # pragma: no cover - component not built yet
    _render_component = None


LOGGER = logging.getLogger(__name__)
_DEBUG_ENV = "POTFOUNDRY_WGPU_DEBUG"
_MAX_EVENT_LOG = 64
_SOFT_FALLBACK_KEY = "_webgpu_soft_fallback_deadline"
_SOFT_FALLBACK_REASON_KEY = "_webgpu_soft_fallback_reason"
_SOFT_FALLBACK_WINDOW_SEC = 6.0  # Increased from 3.0 for better reliability on slow connections
_DEFAULT_WIDGET_KEYS: tuple[str, ...] = ("webgpu_full_preview", "webgpu_preview")
_GLOBAL_RERUN_COOLDOWN_S = 1.0
_WEBGPU_COMMIT_RERUN_COOLDOWN_S = 1.0
# Guard: limit maximum reruns per minute to avoid runaway loops and noisy clients.
# These are intentionally conservative defaults; they can be tuned later.
_GLOBAL_RERUNS_PER_MINUTE = 8
_CANVAS_RERUNS_PER_MINUTE = 3
# Prevent runaway rerun loops by limiting the number of reruns in a short
# period. If exceeded, block reruns for a small penalty window and log a
# diagnostic to help identify noisy frontends.
_WEBGPU_RERUN_MAX_PER_MINUTE = 20
_WEBGPU_RERUN_BLOCK_PENALTY_S = 30
_WEBGPU_PENDING_RERUN_MAX_AGE_S = 8.0


def _track_widget_key(widget_key: str) -> None:
    st = get_st()
    ss = st.session_state
    if not isinstance(widget_key, str) or not widget_key:
        return
    keys = ss.get("_webgpu_widget_keys")
    if not isinstance(keys, list):
        ss["_webgpu_widget_keys"] = [widget_key]
        return
    if widget_key not in keys:
        keys.append(widget_key)


def process_pending_webgpu_events(widget_keys: Iterable[str] | None = None) -> None:
    """Apply any queued WebGPU component events before widgets render."""
    st = get_st()
    ss = st.session_state
    tracked_keys: list[str] = []
    if isinstance(widget_keys, Iterable):
        for key in widget_keys:
            if isinstance(key, str) and key:
                tracked_keys.append(key)
    stored = ss.get("_webgpu_widget_keys")
    if isinstance(stored, list):
        tracked_keys.extend(str(entry) for entry in stored if isinstance(entry, str) and entry)
    tracked_keys.extend(_DEFAULT_WIDGET_KEYS)
    seen: set[str] = set()
    MAX_EVENTS_PER_CALL = 128
    processed_events = 0
    processed_by_type: dict[str, int] = {}
    # Track whether any processed event requested a streamlit rerun. We will
    # coalesce multiple rerun requests into a single explicit st.rerun call
    # at the end of event processing to avoid cascades when many events are
    # emitted rapidly by the frontend.
    # pending_rerun_reason: str | None = None  # unused placeholder removed
    # Collect the last commit payload per canvas (canvasId) so we only apply
    # the final commit from a burst of paramBatchComplete events.
    pending_commit_by_canvas: dict[str, dict[str, Any]] = {}
    start_ts = time.time()
    # Backpressure & safety: avoid reprocessing events if there is an active
    # block due to previous heavy workloads. This prevents continuous loops
    # when clients flood the server with events and the server cannot keep up.
    now = time.time()
    blocked_until = float(ss.get("_webgpu_backpressure_blocked_until") or 0)
    if now < blocked_until:
        LOGGER.warning("Skipping process_pending_webgpu_events due to active backpressure until %.3f", blocked_until)
        return
    LOGGER.debug("Starting process_pending_webgpu_events; tracked_keys=%s", tracked_keys)
    # Log initial pending event count for diagnostics
    try:
        pending_keys = [k for k in ss.keys() if isinstance(k, str) and (k.startswith("webgpu") or k.startswith("_webgpu"))]
        LOGGER.debug("Pending session keys: %s", pending_keys)
    except Exception:
        LOGGER.debug("Pending session keys: <could-not-read>")
    # Log the current session keys that look WebGPU-relevant to help identify
    # noisy clients and to ensure we are looking at the right widget keys.
    try:
        pending_keys = [k for k in ss.keys() if isinstance(k, str) and (k.startswith("webgpu") or k.startswith("_webgpu"))]
        LOGGER.debug("Pending session keys: %s", pending_keys)
    except Exception:
        LOGGER.debug("Pending session keys: <could-not-read>")

    for key in tracked_keys:
        if processed_events >= MAX_EVENTS_PER_CALL:
            LOGGER.debug("Skipping further WebGPU event processing; processed=%s >= %s", processed_events, MAX_EVENTS_PER_CALL)
            break
        if not key or key in seen:
            continue
        seen.add(key)
        event = ss.get(key)
        if isinstance(event, dict):
            # Handle the event, but always clear the stored event afterwards
            # to avoid re-processing across subsequent runs. If handler raises
            # we swallow the exception here and ensure the snapshot is cleared
            # (best-effort) so we don't immortalize stale events.
            try:
                # If we have an immediate paramBatchComplete with a commit, we
                # defer actual apply to coalesce commit events per canvas.
                etype = event.get("type")
                if etype == "paramBatchComplete":
                    payload = event.get("payload") or {}
                    # Only process commit payloads as actual commits; preview
                    # (non-commit) param updates can be applied immediately.
                    if isinstance(payload, dict) and bool(payload.get("commit")):
                        canvas_id = (
                            payload.get("canvasId") or payload.get("canvas_id") or "webgpu-preview"
                        )
                        # Save the latest payload per canvas - this overwrites
                        # earlier commits for the same canvas and thus coalesces
                        # into a single commit apply.
                        pending_commit_by_canvas[str(canvas_id)] = payload
                        # Do not handle now; we'll handle after event loop.
                    else:
                        # Non-commit param batches should be applied immediately.
                        _handle_component_event(event)
                else:
                    # Non-param events handled normally.
                    _handle_component_event(event)
            except Exception:
                LOGGER.exception("Exception while handling WebGPU event: %s", event)
            finally:
                processed_events += 1
                try:
                    et = str(event.get('type') if isinstance(event, dict) else 'unknown')
                    processed_by_type[et] = processed_by_type.get(et, 0) + 1
                except Exception:
                    pass
            # Ensure the event no longer appears in session_state. Different
            # Streamlit shims/versions expose different APIs (pop, del, assignment)
            # so try several approaches in order of preference. This is a best
            # effort cleanup to prevent replay loops when events cannot be
            # processed cleanly.
            try:
                ss.pop(key, None)
            except Exception:
                try:
                    del ss[key]
                except Exception:
                    try:
                        ss[key] = None
                    except Exception:
                        # Fall through: best effort, do not fail caller
                        pass
            LOGGER.debug("Post-process event check (key=%s) present=%s", key, ss.get(key) is not None)

    # After processing all events, apply the last commit payload per canvas
    # so each canvas processes at most one commit in this run.
    for canvas_id, payload in pending_commit_by_canvas.items():
        try:
            # Apply the last pending commit for this canvas and ensure we
            # schedule a rerun request rather than calling it immediately.
            _apply_live_param_batch(payload, rerun_if_queued=True, processing_events=True)
        except Exception:
            LOGGER.exception("Failed to apply coalesced commit for canvas=%s", canvas_id)

    # Process any accumulated per-canvas scheduled reruns. We call
    # _request_streamlit_rerun for each canvas once. This keeps per-canvas
    # reruns distinct while coalescing duplicate commits on the canvas.
    try:
        pending_canvases = ss.get("_webgpu_pending_rerun_canvases")
        if not isinstance(pending_canvases, (list, tuple)):
            pending_canvases = []
        pending_created_ts = ss.get("_webgpu_pending_rerun_created_ts")
        if isinstance(pending_created_ts, (int, float)):
            age = time.time() - float(pending_created_ts)
            if age > _WEBGPU_PENDING_RERUN_MAX_AGE_S and pending_canvases:
                LOGGER.debug(
                    "Dropping stale WebGPU rerun request (age=%.2fs, canvases=%s)",
                    age,
                    pending_canvases,
                )
                pending_canvases = []
        # Clear the list before issuing reruns to avoid race conditions where
        # new events re-add entries while we are processing.
        ss["_webgpu_pending_rerun_canvases"] = []
        ss.pop("_webgpu_pending_rerun_created_ts", None)
        pending_reason = ss.get("_webgpu_pending_rerun_reason")
        for canvas_id in pending_canvases:
            try:
                _request_streamlit_rerun(str(pending_reason or f"webgpu-live-controls:{canvas_id}"))
            except Exception:
                try:
                    _request_streamlit_rerun("webgpu-live-controls")
                except Exception:
                    pass
        # remove the reason key so it does not persist across runs
        ss.pop("_webgpu_pending_rerun_reason", None)
    except Exception:
        pass
    # Debug logs summarizing what we handled in this invocation
    try:
        LOGGER.debug('processed_by_type=%s', processed_by_type)
    except Exception:
        pass
    LOGGER.debug(
        "Finished process_pending_webgpu_events; processed=%s, pending_commits=%s, pending_rerun_canvases=%s, duration=%sms",
        processed_events,
        list(pending_commit_by_canvas.keys()),
        pending_canvases if 'pending_canvases' in locals() else [],
        int((time.time() - start_ts) * 1000),
    )
    # Backpressure detection: if we processed many events or the call took too
    # long, set a short block so the server has time to recover and clients
    # get backpressure feedback. This protects Streamlit from cascading
    # reruns that can make the UI appear to be stuck running.
    duration_ms = int((time.time() - start_ts) * 1000)
    MAX_SAFE_EVENTS = 256
    MAX_SAFE_TIME_MS = 1200
    if processed_events >= MAX_SAFE_EVENTS or duration_ms > MAX_SAFE_TIME_MS:
        try:
            block_until = time.time() + 3.0
            ss["_webgpu_backpressure_blocked_until"] = block_until
            ss["_webgpu_backpressure_reason"] = {
                "processed": processed_events,
                "duration_ms": duration_ms,
            }
            LOGGER.warning("Backpressure active: processed=%s duration=%sms - blocking until %.3f", processed_events, duration_ms, block_until)
        except Exception:
            pass
    # Expose a short-lived flag in session_state if event backlog is observed
    try:
        if processed_events >= MAX_EVENTS_PER_CALL:
            ss["_webgpu_event_backlog"] = {"ts": time.time(), "processed": processed_events}
        else:
            ss.pop("_webgpu_event_backlog", None)
    except Exception:
        pass

def _debug_mode_enabled() -> bool:
    value = os.environ.get(_DEBUG_ENV, "").strip().lower()
    return value in {"1", "true", "yes", "on"}


def _build_commit_signature(payload: dict[str, Any]) -> str:
    """Create a canonical signature for a commit payload.

    This keeps a consistent format with stable sorting and numeric rounding to
    avoid transient differences causing false duplication misses.
    """
    import json

    def _normalize_val(v: Any) -> Any:
        if isinstance(v, bool):
            return v
        if isinstance(v, (int, float)):
            try:
                fv = float(v)
            except Exception:
                return v
            return round(fv, 4)
        return v

    params = payload.get("params")
    if not isinstance(params, dict):
        params = {}
    raw_fields = payload.get("fields")
    fields: list[dict[str, Any]] = []
    if isinstance(raw_fields, list):
        for f in raw_fields:
            if isinstance(f, dict):
                fields.append(f)
    sorted_fields = []
    for f in fields:
        if not isinstance(f, dict):
            continue
        session_key = f.get("sessionKey")
        value = f.get("value")
        sorted_fields.append((session_key, _normalize_val(value)))
    sorted_fields = sorted(sorted_fields, key=lambda pair: (str(pair[0]), str(pair[1])))
    norm_params: dict[str, Any] = {}
    for k, v in params.items():
        norm_params[str(k)] = _normalize_val(v)
    sig_obj = {"params": norm_params, "fields": sorted_fields}
    try:
        sig = json.dumps(sig_obj, sort_keys=True, separators=(",", ":"))
    except Exception:
        sig = str(sig_obj)
    return sig


def _record_component_event(event_type: str, payload: dict[str, Any], seq: int | None) -> None:
    st = get_st()
    ss = st.session_state
    log = ss.get("_webgpu_event_log")
    if log is None:
        log = []
        ss["_webgpu_event_log"] = log
    entry = {
        "type": event_type,
        "seq": seq,
        "timestamp": payload.get("timestamp") or int(time.time() * 1000),
        "payload": payload,
    }
    # Debug: Also log condensed event marker to the main logger to help
    # with runtime console diagnosis (avoid spamming with full JSON.
    LOGGER.debug("WebGPU event recorded: type=%s seq=%s canvas=%s", event_type, seq, payload.get("canvasId") or payload.get("canvas_id"))
    log.append(entry)
    if len(log) > _MAX_EVENT_LOG:
        del log[: len(log) - _MAX_EVENT_LOG]
    ss["_webgpu_last_event"] = entry
    ss["_webgpu_last_event_ts"] = entry["timestamp"]


def _render_debug_panel() -> None:
    if not _debug_mode_enabled():
        return
    st = get_st()
    log = st.session_state.get("_webgpu_event_log", [])
    with st.expander("WebGPU diagnostics", expanded=False):
        last_diag = st.session_state.get("_webgpu_last_diagnostic")
        last_error = st.session_state.get("_webgpu_last_error")
        fallback_deadline = st.session_state.get(_SOFT_FALLBACK_KEY)
        last_event_ts = st.session_state.get("_webgpu_last_event_ts")
        if log:
            st.json(log[-20:])
        else:
            st.caption("No WebGPU events captured yet.")
        if last_diag:
            st.caption(
                f"Last diagnostic: {last_diag.get('message')} (canvas={last_diag.get('canvas_id')})",
            )
        if last_error:
            st.caption(
                f"Last error: {last_error.get('message')} (fatal={last_error.get('fatal')})",
            )
        if last_event_ts:
            st.caption(f"Last event timestamp: {last_event_ts}")
        if isinstance(fallback_deadline, (int, float)):
            st.caption(f"Soft fallback deadline: {fallback_deadline:.3f}")


def _request_streamlit_rerun(reason: str) -> None:
    st = get_st()
    rerun_fn = getattr(st, "rerun", None) or getattr(st, "experimental_rerun", None)
    if rerun_fn is None:
        return
    try:
        ss = st.session_state
        now = time.time()

        # Block reruns during library operations to preserve WebGPU
        # Check for recent design load (2 second window)
        design_load_ts = ss.get("_webgpu_design_load_ts")
        if isinstance(design_load_ts, (int, float)):
            elapsed = now - float(design_load_ts)
            if elapsed < 2.0:
                LOGGER.info("Blocking rerun - design load in progress (elapsed=%.3fs, reason=%s)", elapsed, reason)
                return

        # Check for recent library request (1 second window)
        library_request_ts = ss.get("_webgpu_library_request_ts")
        if isinstance(library_request_ts, (int, float)):
            elapsed = now - float(library_request_ts)
            if elapsed < 1.0:
                LOGGER.info("Blocking rerun - library request in progress (elapsed=%.3fs, reason=%s)", elapsed, reason)
                return

        # Check for active library response (hasn't been acknowledged yet)
        if ss.get("_webgpu_library_response"):
            LOGGER.info("Blocking rerun - library response pending (reason=%s)", reason)
            return

        # Emit a single-line debug with current rate limit state to help
        # diagnose why reruns may be suppressed.
        try:
            global_bucket_ts = int(ss.get("_webgpu_rerun_minute_bucket_ts") or 0)
            global_bucket_cnt = int(ss.get("_webgpu_rerun_minute_bucket_cnt") or 0)
        except Exception:
            global_bucket_ts = None
            global_bucket_cnt = None
        LOGGER.debug(
            "_request_streamlit_rerun called: reason=%s global_bucket_ts=%s global_cnt=%s",
            reason,
            global_bucket_ts,
            global_bucket_cnt,
        )
        last = float(ss.get("_webgpu_global_rerun_ts") or 0)
        if now - last < _GLOBAL_RERUN_COOLDOWN_S:
            LOGGER.debug("Skipping rerun due to global cooldown (reason=%s)", reason)
            return
        # Emergency throttling: if we've triggered too many reruns in
        # the last minute, block further reruns for a penalty window.
        blocked_until = float(ss.get("_webgpu_rerun_blocked_until") or 0)
        if now < blocked_until:
            LOGGER.warning("Skipping rerun due to active block until %.3f (reason=%s)", blocked_until, reason)
            return
        # Minute-bucketed counts to protect against noisy clients that can
        # rapidly request reruns across many seconds. We track a global
        # counter per minute plus a per-canvas counter if the reason contains
        # a canvas id after a colon like 'webgpu-live-controls:canvas-id'.
        bucket = int(now) // 60
        # Global bucket
        global_bucket_key = "_webgpu_rerun_minute_bucket_ts"
        global_bucket_cnt_key = "_webgpu_rerun_minute_bucket_cnt"
        global_bucket_ts = int(ss.get(global_bucket_key) or 0)
        if global_bucket_ts != bucket:
            ss[global_bucket_key] = bucket
            ss[global_bucket_cnt_key] = 0
        global_cnt = int(ss.get(global_bucket_cnt_key) or 0)
        if global_cnt >= _GLOBAL_RERUNS_PER_MINUTE:
            LOGGER.warning("Global rerun rate limit hit (%s/min) - suppressed rerun (reason=%s)", _GLOBAL_RERUNS_PER_MINUTE, reason)
            return

        # Per-canvas bucket
        canvas_id = None
        if isinstance(reason, str) and ":" in reason:
            try:
                _, canvas_id = reason.split(":", 1)
            except Exception:
                canvas_id = None
        if canvas_id:
            canvas_bucket_ts_key = f"_webgpu_canvas_rerun_bucket_ts:{canvas_id}"
            canvas_bucket_cnt_key = f"_webgpu_canvas_rerun_bucket_cnt:{canvas_id}"
            cb_ts = int(ss.get(canvas_bucket_ts_key) or 0)
            if cb_ts != bucket:
                ss[canvas_bucket_ts_key] = bucket
                ss[canvas_bucket_cnt_key] = 0
            canvas_cnt = int(ss.get(canvas_bucket_cnt_key) or 0)
            if canvas_cnt >= _CANVAS_RERUNS_PER_MINUTE:
                LOGGER.warning("Rerun rate limit hit for canvas=%s (%s/min) - suppressed rerun", canvas_id, _CANVAS_RERUNS_PER_MINUTE)
                return
            ss[canvas_bucket_cnt_key] = canvas_cnt + 1

        # record & advance the global count and timestamp
        ss[global_bucket_cnt_key] = int(ss.get(global_bucket_cnt_key) or 0) + 1
        ss[global_bucket_key] = bucket
        ss["_webgpu_last_rerun_reason"] = reason
        ss["_webgpu_global_rerun_ts"] = now

        # Maintain a small history of rerun timestamps for rate-limiting
        # decisions whenever necessary.
        history = ss.get("_webgpu_rerun_history") or []
        # Filter to last 60s
        history = [float(ts) for ts in history if now - float(ts) <= 60.0]
        if len(history) >= _WEBGPU_RERUN_MAX_PER_MINUTE:
            # Too many reruns; block further ones for penalty window.
            ss["_webgpu_rerun_blocked_until"] = now + _WEBGPU_RERUN_BLOCK_PENALTY_S
            ss["_webgpu_last_rerun_block_count"] = len(history)
            LOGGER.error("Too many WebGPU reruns in 60s (count=%s); block until %.3f", len(history), ss.get("_webgpu_rerun_blocked_until"))
            return
        history.append(now)
        ss["_webgpu_rerun_history"] = history
        ss["_webgpu_last_rerun_reason"] = reason
        ss["_webgpu_global_rerun_ts"] = now
    except Exception:
        pass
    rerun_fn()


def _apply_camera_state(payload: dict[str, Any], *, rerun_if_queued: bool = False) -> None:
    # Camera state updates are high frequency and must not cause an
    # immediate Streamlit rerun to avoid blocking the UI. They are stored
    # in session_state via queue_webgpu_camera_state for the next user
    # driven run.
    _ = queue_webgpu_camera_state(payload)


def _handle_library_request(payload: dict[str, Any]) -> None:
    """Handle library requests from WebGPU component.
    
    Supported actions:
    - list: Fetch published designs with optional filters
    - loadDesign: Load design parameters into editor
    - publish: Publish current design to library
    
    IMPORTANT: Library operations must NOT trigger st.rerun() as this
    would unmount the WebGPU component. Instead, responses are stored
    in session state for the frontend to poll.
    """
    st = get_st()
    ss = st.session_state
    action = payload.get("action")

    # Set timestamp for ALL library requests to block reruns during processing
    ss["_webgpu_library_request_ts"] = time.time()
    LOGGER.debug("Library request received: action=%s", action)

    if action == "list":
        try:
            from potfoundry.library import list_published

            page = int(payload.get("page", 1))
            limit = int(payload.get("limit", 12))
            search = payload.get("search")
            style = payload.get("style")

            offset = (page - 1) * limit
            designs, has_more = list_published(
                style=style,
                search_query=search,
                offset=offset,
                limit=limit,
            )

            # Debug: log first design to verify fields
            if designs:
                LOGGER.info("Library list - first design keys: %s", list(designs[0].keys()))
                LOGGER.info("Library list - first design thumb_url: %s", designs[0].get("thumb_url"))
                LOGGER.info("Library list - first design stl_url: %s", designs[0].get("stl_url"))

            # Store response for component to read on next render cycle
            # NOTE: We intentionally do NOT trigger a full st.rerun() here.
            # The response will be picked up when the component next renders,
            # avoiding disruptive full-page reloads for library browsing.
            ss["_webgpu_library_response"] = {
                "action": "list",
                "page": page,
                "designs": designs,
                "hasMore": has_more,
                "error": None,
            }
            LOGGER.debug("Library list stored %d designs (page=%d)", len(designs), page)
        except Exception as e:
            LOGGER.exception("Library list failed")
            ss["_webgpu_library_response"] = {
                "action": "list",
                "page": payload.get("page", 1),
                "designs": [],
                "hasMore": False,
                "error": str(e),
            }

    elif action == "loadDesign":
        # Frontend handles params directly via controller.updateParams()
        # Python side syncs session state for sidebar widgets
        try:
            from pfui.state import widget_key

            design = payload.get("design", {})
            LOGGER.info("Library loadDesign - syncing session state for design: %s", design.get("name", "unknown"))

            style = design.get("style")
            size = design.get("size", {})
            opts = design.get("opts", {})

            # Log current session state values BEFORE update
            LOGGER.info("Library loadDesign - BEFORE: H=%s, top_od=%s, style=%s",
                       ss.get("H"), ss.get("top_od"), ss.get("style"))

            # Set a flag to skip incoming param events for a short window
            # This prevents old values from the frontend overwriting our new values
            ss["_webgpu_design_load_ts"] = time.time()

            # Clear any pending WebGPU events that might contain old values
            keys_to_clear = [k for k in list(ss.keys()) if isinstance(k, str) and k.startswith("webgpu_preview_event")]
            for k in keys_to_clear:
                try:
                    ss.pop(k, None)
                except Exception:
                    pass
            LOGGER.info("Library loadDesign - cleared %d pending WebGPU events", len(keys_to_clear))

            # Clear any pending updates that might overwrite our values
            ss.pop("__pending_updates__", None)

            # Update style - DIRECTLY set in session state
            current_style = style or ss.get("style", "")
            if style:
                ss["style"] = style
                ss[widget_key("style")] = style
                current_style = style

            # Extract size parameters
            H = float(size.get("height", ss.get("H", 120.0)))
            top_od = float(size.get("top_od", ss.get("top_od", 140.0)))
            bottom_od = float(size.get("bottom_od", ss.get("bottom_od", 90.0)))
            t_wall = float(size.get("wall_thickness", ss.get("t_wall", 3.0)))
            t_bottom = float(size.get("bottom_thickness", ss.get("t_bottom", 3.0)))
            r_drain = float(size.get("drain_radius", ss.get("r_drain", 10.0)))
            expn = float(size.get("flare_exp", ss.get("expn", 1.1)))

            Rt = top_od * 0.5
            Rb = bottom_od * 0.5

            # Store values that need to be applied to sidebar widgets
            # The sidebar will read these and apply them before rendering widgets
            ss["_design_load_pending"] = {
                "H": H,
                "top_od": top_od,
                "bottom_od": bottom_od,
                "Rt": Rt,
                "Rb": Rb,
                "t_wall": t_wall,
                "t_bottom": t_bottom,
                "r_drain": r_drain,
                "expn": expn,
                "style": current_style,
                "opts": dict(opts) if opts else {},
            }

            # Also directly set session state values (for non-widget uses)
            ss["H"] = H
            ss["top_od"] = top_od
            ss["bottom_od"] = bottom_od
            ss["Rt"] = Rt
            ss["Rb"] = Rb
            ss["t_wall"] = t_wall
            ss["t_bottom"] = t_bottom
            ss["r_drain"] = r_drain
            ss["expn"] = expn

            # Also set the widget key for expn (slider uses widget_key)
            ss[widget_key(current_style, "expn")] = expn

            # Set style opts - both dict and individual widget keys
            if opts:
                ss["style_opts"] = dict(opts)
                ss["opts"] = dict(opts)
                for opt_key, opt_val in opts.items():
                    wk = widget_key(current_style, opt_key)
                    ss[wk] = opt_val

            # Mark preview as stale to trigger rebuild
            ss["_preview_stale"] = True

            # Log session state values AFTER update
            LOGGER.info("Library loadDesign - AFTER: H=%s, top_od=%s, style=%s",
                       ss.get("H"), ss.get("top_od"), ss.get("style"))

            LOGGER.info("Library loadDesign - session state updated for potential future use")

            # NO st.rerun() - WebGPU is self-contained and updates its own embedded controls
            # The frontend handles all parameter updates via controller.updateParams()

        except Exception as e:
            LOGGER.exception("Library loadDesign session sync failed: %s", e)

    elif action == "publish":
        try:
            from potfoundry.library import publish_design
            from potfoundry.geometry import build_pot_mesh
            from potfoundry.core.io.stl import write_stl_binary
            import tempfile
            from pathlib import Path

            title = payload.get("title", "Untitled")
            tags = payload.get("tags", [])
            license_str = payload.get("license", "CC BY-NC 4.0")

            # Get current design parameters
            H = float(ss.get("H", 120.0))
            top_od = float(ss.get("top_od", 140.0))
            bottom_od = float(ss.get("bottom_od", 90.0))
            t_wall = float(ss.get("t_wall", 3.0))
            t_bottom = float(ss.get("t_bottom", 3.0))
            r_drain = float(ss.get("r_drain", 10.0))
            expn = float(ss.get("expn", 1.1))
            style_name = str(ss.get("style", "HarmonicRipple"))
            n_theta = int(ss.get("n_theta", 168))
            n_z = int(ss.get("n_z", 84))
            opts = dict(ss.get("style_opts", {}))

            Rt = 0.5 * top_od
            Rb = 0.5 * bottom_od

            # Get style function
            from pfui.imports import STYLES
            style_tuple = STYLES.get(style_name)
            if style_tuple:
                r_outer_fn = style_tuple[0]
            else:
                def r_outer_fn(th, z, H_, Rb_, o):
                    return Rb_

            # Build mesh
            verts, faces, _ = build_pot_mesh(
                H=H, Rt=Rt, Rb=Rb,
                t_wall=t_wall, t_bottom=t_bottom, r_drain=r_drain,
                expn=expn, n_theta=n_theta, n_z=n_z,
                r_outer_fn=r_outer_fn, style_opts=opts,
            )

            # Write to temp file
            tmp_path = Path(tempfile.gettempdir()) / f"_pf_publish_{int(time.time())}.stl"
            write_stl_binary(str(tmp_path), "potfoundry", verts, faces)
            stl_bytes = tmp_path.read_bytes()
            tmp_path.unlink(missing_ok=True)

            # Publish
            result = publish_design(
                stl_bytes=stl_bytes,
                style=style_name,
                size={
                    "height": H,
                    "top_od": top_od,
                    "bottom_od": bottom_od,
                    "wall_thickness": t_wall,
                    "bottom_thickness": t_bottom,
                    "drain_radius": r_drain,
                    "flare_exp": expn,
                },
                opts=opts,
                mesh={"n_theta": n_theta, "n_z": n_z},
                diagnostics={"triangle_count": len(faces), "vertex_count": len(verts)},
                license=license_str,
                title=title,
                tags=tags,
            )

            # Store publish result - no rerun needed, frontend polls for result
            ss["_webgpu_library_response"] = {
                "action": "publish",
                "success": True,
                "id": result.id,
                "duplicate": result.duplicate,
                "error": None,
            }
            LOGGER.info("Library publish succeeded: id=%s duplicate=%s", result.id, result.duplicate)
        except Exception as e:
            LOGGER.exception("Library publish failed")
            ss["_webgpu_library_response"] = {
                "action": "publish",
                "success": False,
                "error": str(e),
            }


def _store_live_preview_snapshot(payload: dict[str, Any]) -> None:
    """Persist the latest slider preview values while avoiding stale overwrites."""
    st = get_st()
    ss = st.session_state
    timestamp = payload.get("timestamp")
    fields = payload.get("fields")
    if not isinstance(fields, list):
        return

    # Maintain legacy structure for backward compatibility with older UI builds.
    ss["_webgpu_live_controls_preview"] = {"timestamp": timestamp, "fields": fields}

    preview_map = ss.get("_webgpu_live_controls_preview_map")
    if not isinstance(preview_map, dict):
        preview_map = {}

    for entry in fields:
        if not isinstance(entry, dict):
            continue
        session_key = entry.get("sessionKey")
        value = entry.get("value")
        if isinstance(session_key, str) and isinstance(value, (int, float)):
            preview_map[session_key] = {"value": float(value), "timestamp": timestamp}

    ss["_webgpu_live_controls_preview_map"] = preview_map


def _clear_live_preview_snapshot() -> None:
    st = get_st()
    ss = st.session_state
    ss.pop("_webgpu_live_controls_preview", None)
    ss.pop("_webgpu_live_controls_preview_map", None)


def _apply_live_param_batch(
    payload: dict[str, Any], *, rerun_if_queued: bool = False, processing_events: bool = False
) -> None:
    st = get_st()
    ss = st.session_state

    # Skip param events for a short window after a design load
    # This prevents old values from the frontend overwriting newly loaded design values
    design_load_ts = ss.get("_webgpu_design_load_ts")
    if isinstance(design_load_ts, (int, float)):
        elapsed = time.time() - float(design_load_ts)
        if elapsed < 2.0:  # Skip param events for 2 seconds after design load
            LOGGER.info("Skipping param batch - design load in progress (elapsed=%.3fs)", elapsed)
            return
        else:
            # Clear the flag after the window expires
            ss.pop("_webgpu_design_load_ts", None)

    commit_requested = bool(payload.get("commit"))
    if not commit_requested:
        _store_live_preview_snapshot(payload)
        return
    _clear_live_preview_snapshot()
    fields = payload.get("fields")
    changed = False
    pending_updates: dict[str, float] = {}
    params = payload.get("params")
    params_numeric: dict[str, float] = {}
    if isinstance(params, dict):
        ss["_webgpu_live_params"] = params
        for key, value in params.items():
            if isinstance(value, (int, float)):
                # Skip params that are no-ops vs existing session state
                numeric = float(value)
                existing = ss.get(key)
                try:
                    if isinstance(existing, (int, float)) and float(existing) == numeric:
                        continue
                except Exception:
                    pass
                params_numeric[key] = numeric

    if isinstance(fields, list):
        for entry in fields:
            if not isinstance(entry, dict):
                continue
            session_key = entry.get("sessionKey")
            value = entry.get("value")
            if isinstance(session_key, str) and isinstance(value, (int, float)):
                numeric_value = float(value)
                existing_s = ss.get(session_key)
                try:
                    if isinstance(existing_s, (int, float)) and float(existing_s) == numeric_value:
                        # no-op change; skip
                        continue
                except Exception:
                    pass
                pending_updates[session_key] = numeric_value
                if session_key == "top_od" and "Rt" not in params_numeric:
                    pending_updates["Rt"] = numeric_value * 0.5
                elif session_key == "bottom_od" and "Rb" not in params_numeric:
                    pending_updates["Rb"] = numeric_value * 0.5
                changed = True

    if params_numeric:
        pending_updates.update(params_numeric)
        changed = True

    if pending_updates:
        queue_update(pending_updates)

    if changed:
        # Note: param commits are intended to trigger a Streamlit rerun so the
        # backend updates occur (model, geometry recalculation, etc.). However
        # repeated commits under test conditions or from noisy frontends can
        # cause many consecutive reruns; we gate that behavior via dedupe and
        # a small cooldown in _should_trigger_param_commit_rerun.
        ss["_preview_stale"] = True
        ss["_param_update_nonce"] = int(ss.get("_param_update_nonce", 0)) + 1
        ss["_webgpu_live_controls_last"] = {
            "timestamp": payload.get("timestamp"),
            "fields": fields,
        }
        if rerun_if_queued:
            # Only trigger rerun if the commit is not a duplicate (dedupe
            # identical payloads), and respect a small global cooldown so
            # multiple commits in quick succession don't flood reruns.
            try:
                canvas_id = payload.get("canvasId") or payload.get("canvas_id") or "webgpu-preview"
                if _should_trigger_param_commit_rerun(canvas_id, payload):
                    # Additional safety: impose a short cooldown for commit-triggered
                    # reruns to prevent a noisy frontend/client loop from repeatedly
                    # causing immediate reruns (this is defensive against cases
                    # where small floating point differences or derived params
                    # cause duplicate commits).
                    now = time.time()
                    cooldown_key = f"_webgpu_last_commit_ts:{canvas_id}"
                    last_commit = ss.get(cooldown_key)
                    if isinstance(last_commit, (int, float)) and now - float(last_commit) < _WEBGPU_COMMIT_RERUN_COOLDOWN_S:
                        LOGGER.debug(
                            "Skipping commit-triggered rerun due to commit cooldown (canvas=%s) last=%.3f now=%.3f",
                            canvas_id,
                            float(last_commit),
                            now,
                        )
                    else:
                        ss[cooldown_key] = now
                        # Instead of requesting an immediate rerun here, schedule
                        # one using session state so multiple commits during a
                        # single process_pending_webgpu_events run are combined.
                        try:
                            if processing_events:
                                # Note: we store a list of canvases that need reruns so
                                # each canvas schedules a single rerun at the end of
                                # event processing. This avoids immediate multiple
                                # reruns and prevents runaway loops when the frontend
                                # emits bursts of commits.
                                pending_list = ss.get("_webgpu_pending_rerun_canvases")
                                if not isinstance(pending_list, list):
                                    pending_list = []
                                if canvas_id not in pending_list:
                                    pending_list.append(canvas_id)
                                ss["_webgpu_pending_rerun_canvases"] = pending_list
                                ss["_webgpu_pending_rerun_reason"] = "webgpu-live-controls"
                                ss["_webgpu_pending_rerun_created_ts"] = now
                            else:
                                _request_streamlit_rerun(f"webgpu-live-controls:{canvas_id}")
                        except Exception:
                            # As a defensive fallback, request a rerun immediately
                            # if we cannot set the session flag.
                            _request_streamlit_rerun("webgpu-live-controls")
            except Exception:
                # Fall back to the previous behavior if anything unexpected
                # happens during dedupe/rate-limit checks.
                _request_streamlit_rerun("webgpu-live-controls")


def _should_trigger_param_commit_rerun(canvas_id: str, payload: dict[str, Any], *, cooldown_s: float = 0.2) -> bool:
    """Return True if the commit should trigger a real rerun.

    Uses a session-state stored signature (per-canvas when available) to
    deduplicate identical commits and a global cooldown to avoid repeated
    reruns in a tight burst.
    """
    # json is not needed here since we delegate canonicalization to
    # _build_commit_signature(). Keep the function import-free for test isolation.
    ss = get_st().session_state
    # If the component hasn't yet been observed for this canvas id, skip
    # commit-driven reruns generated during initialization. Mark the canvas
    # as seen to allow subsequent commits to behave normally.
    canvas_seen_key = f"_webgpu_component_seen:{canvas_id}"
    if not ss.get(canvas_seen_key):
        ss[canvas_seen_key] = True
        LOGGER.debug("Initial commit detected for canvas=%s; skipping rerun and marking as seen", canvas_id)
        return False
    # Use the canonical signature builder for consistency
    sig = _build_commit_signature(payload)

    sig_key = f"_webgpu_last_param_commit_sig:{canvas_id}"
    last_sig = ss.get(sig_key)
    if last_sig == sig:
        # Duplicate commit; avoid rerun.
        LOGGER.debug("WebGPU commit dedupe (canvas=%s) - skipping rerun", canvas_id)
        return False
    # Otherwise, set last signature.
    ss[sig_key] = sig

    # Rate-limit reruns (global per-canvas) to avoid rapid replays.
    ts_key = f"_webgpu_last_rerun_ts:{canvas_id}"
    now = time.time()
    last_ts = ss.get(ts_key)
    try:
        if isinstance(last_ts, (int, float)) and now - float(last_ts) < float(cooldown_s):
            LOGGER.debug(
                "WebGPU commit rate-limited (canvas=%s) last=%.3f now=%.3f cooldown=%.3f",
                canvas_id,
                float(last_ts),
                now,
                float(cooldown_s),
            )
            return False
    except Exception:
        pass
    ss[ts_key] = now
    return True


def _handle_component_event(event: dict[str, Any] | None, *, rerun_if_queued: bool = False) -> None:
    if not event:
        return
    st = get_st()
    ss = st.session_state
    seq = event.get("seq")
    if seq is not None:
        last_seq = ss.get("_webgpu_component_seq")
        if last_seq == seq:
            return
        ss["_webgpu_component_seq"] = seq
    event_type = event.get("type")
    raw_payload = event.get("payload")
    payload_dict = raw_payload if isinstance(raw_payload, dict) else {}
    if event_type:
        LOGGER.debug("Handling component event: type=%s seq=%s", event_type, seq)
        _record_component_event(event_type, payload_dict, seq)
    if event_type == "cameraState" and payload_dict:
        _apply_camera_state(payload_dict, rerun_if_queued=rerun_if_queued)
    elif event_type == "ready":
        if not ss.get("_webgpu_ready_logged"):
            LOGGER.info(
                "WebGPU component ready",
                extra={
                    "canvas_id": payload_dict.get("canvasId") or payload_dict.get("canvas_id"),
                    "timestamp": payload_dict.get("timestamp"),
                },
            )
            ss["_webgpu_ready_logged"] = True
        _reset_soft_fallback_state()
    elif event_type == "error":
        message = str(payload_dict.get("message") or "WebGPU component error")
        code = payload_dict.get("code")
        detail = payload_dict.get("detail")
        fatal = bool(payload_dict.get("fatal", False))
        context = payload_dict.get("context") if isinstance(payload_dict.get("context"), dict) else {}
        canvas_id = payload_dict.get("canvasId") or payload_dict.get("canvas_id")
        log_extra = {"code": code, "detail": detail, "context": context, "canvas_id": canvas_id, "seq": seq}
        if fatal:
            LOGGER.error("WebGPU component error: %s", message, extra=log_extra)
        else:
            LOGGER.warning("WebGPU component warning: %s", message, extra=log_extra)
        formatted = f"{message} ({code})" if code else message
        # In normal operation we avoid pushing routine non-fatal errors to UI
        # unless debug mode is on; this reduces noisy UI updates.
        if fatal or _debug_mode_enabled():
            st.warning(formatted)
        ss["_webgpu_last_error"] = {
            "message": message,
            "code": code,
            "detail": detail,
            "fatal": fatal,
            "context": context,
            "canvas_id": canvas_id,
            "timestamp": payload_dict.get("timestamp"),
        }
    elif event_type == "diagnostic":
        message = payload_dict.get("message") or "diagnostic"
        detail = payload_dict.get("detail") if isinstance(payload_dict.get("detail"), dict) else {}
        canvas_id = payload_dict.get("canvasId") or payload_dict.get("canvas_id")
        LOGGER.debug(
            "WebGPU diagnostic: %s",
            message,
            extra={"detail": detail, "canvas_id": canvas_id, "seq": seq},
        )
        # Dedupe repeat diagnostics per-canvas to avoid frequent session_state writes
        try:
            sig = None
            try:
                sig = f"{message}:{str(detail)}"
            except Exception:
                sig = message
            sig_key = f"_webgpu_last_diag_sig:{canvas_id}"
            ts_key = f"_webgpu_last_diag_ts:{canvas_id}"
            last_sig = ss.get(sig_key)
            last_ts = float(ss.get(ts_key) or 0)
            now_ts = time.time()
            DIAG_COOLDOWN_S = 0.4
            if last_sig != sig or now_ts - last_ts > DIAG_COOLDOWN_S:
                ss["_webgpu_last_diagnostic"] = {
                    "message": message,
                    "detail": detail,
                    "canvas_id": canvas_id,
                    "timestamp": payload_dict.get("timestamp"),
                }
                ss[sig_key] = sig
                ss[ts_key] = now_ts
        except Exception:
            try:
                ss["_webgpu_last_diagnostic"] = {
                    "message": message,
                    "detail": detail,
                    "canvas_id": canvas_id,
                    "timestamp": payload_dict.get("timestamp"),
                }
            except Exception:
                pass
        _reset_soft_fallback_state()
    elif event_type == "paramBatchComplete" and payload_dict:
        _apply_live_param_batch(payload_dict, rerun_if_queued=rerun_if_queued)
    elif event_type == "libraryRequest" and payload_dict:
        _handle_library_request(payload_dict)
    elif event_type == "libraryPoll":
        # Lightweight poll event - no action needed.
        # The component will receive any pending library response via props
        # on this render cycle. This avoids full page reruns.
        LOGGER.debug("Library poll: attempt=%s", payload_dict.get("attempt", 0))
    elif event_type == "libraryAck":
        # Frontend acknowledges receipt of library response - clear it
        ss.pop("_webgpu_library_response", None)
        LOGGER.debug("Library response acknowledged and cleared")


def _fatal_error_seen() -> bool:
    entry = get_st().session_state.get("_webgpu_last_error")
    return bool(isinstance(entry, dict) and entry.get("fatal"))


def _start_or_extend_soft_fallback(reason: str) -> bool:
    if _fatal_error_seen():
        return False
    st = get_st()
    ss = st.session_state
    now = time.time()
    deadline = ss.get(_SOFT_FALLBACK_KEY)
    if not isinstance(deadline, (int, float)):
        deadline = None
    if deadline is None:
        deadline = now + _SOFT_FALLBACK_WINDOW_SEC
        ss[_SOFT_FALLBACK_KEY] = deadline
        ss[_SOFT_FALLBACK_REASON_KEY] = reason
        LOGGER.info(
            "WebGPU soft fallback grace activated (reason=%s) until %.3f",
            reason,
            deadline,
        )
        st.info("WebGPU preview initializing...")
        return True
    if now < deadline:
        st.info("WebGPU preview initializing...")
        return True
    LOGGER.warning(
        "WebGPU soft fallback window elapsed (reason=%s)",
        ss.get(_SOFT_FALLBACK_REASON_KEY, reason),
    )
    return False


def _reset_soft_fallback_state() -> None:
    st = get_st()
    ss = st.session_state
    ss.pop(_SOFT_FALLBACK_KEY, None)
    ss.pop(_SOFT_FALLBACK_REASON_KEY, None)


def _clear_webgpu_blocking_state() -> None:
    """Clear any WebGPU state that could block re-initialization.
    
    Call this when loading a new design or when the user explicitly
    wants to reset the preview state.
    """
    st = get_st()
    ss = st.session_state
    # Clear fatal error state
    ss.pop("_webgpu_last_error", None)
    # Clear soft fallback state
    ss.pop(_SOFT_FALLBACK_KEY, None)
    ss.pop(_SOFT_FALLBACK_REASON_KEY, None)
    # Clear component "seen" state to allow fresh initialization
    # We need to clear all canvas-specific seen keys
    keys_to_clear = [k for k in ss.keys() if k.startswith("_webgpu_component_seen:")]
    for k in keys_to_clear:
        ss.pop(k, None)
    # Clear the ready logged flag to allow fresh ready event
    ss.pop("_webgpu_ready_logged", None)
    # Clear rerun block state (in case rate limiting kicked in)
    ss.pop("_webgpu_rerun_blocked_until", None)
    # Clear the rerun history to reset rate limiting
    ss.pop("_webgpu_rerun_history", None)
    LOGGER.debug("Cleared WebGPU blocking state for fresh re-initialization")


def render_webgpu_preview(
    vertices: object | None = None,
    faces: object | None = None,
    *,
    params: dict | None = None,
    height_px: int = 600,
    background_color: str = "#242B46",
    background_rgba: tuple[float, float, float, float] | None = None,
    background_mode: str | None = None,
    gradient: tuple[str, str, str] | None = None,
    widget_key: str = "webgpu_preview",
    canvas_id: str = "wgpu-canvas",
    live_controls: dict[str, Any] | None = None,
    **kwargs,
) -> None:
    """Render the WebGPU preview via the modular core builder.

    try:
        ss = st.session_state
        now = time.time()
        last = float(ss.get("_webgpu_global_rerun_ts") or 0)
        if now - last < _GLOBAL_RERUN_COOLDOWN_S:
            LOGGER.debug("Skipping rerun due to global cooldown (reason=%s)", reason)
            return
    """
    p = dict(params or {})
    widget_slug = widget_key.strip() if isinstance(widget_key, str) else ""
    resolved_canvas_id = (canvas_id or "").strip()
    if not resolved_canvas_id:
        resolved_canvas_id = f"{widget_slug}-canvas" if widget_slug else "wgpu-canvas"
    component_dom_id = widget_slug or "pf-wgpu-default"
    _track_widget_key(widget_key)
    if gradient is not None and "gradient" not in p:
        try:
            p["gradient"] = list(gradient)
        except Exception:
            pass

    fallback_reason: str | None = None
    component_available = _render_component is not None
    if component_available:
        component = _render_component
        assert component is not None  # narrow Optional for type-checkers
        try:
            LOGGER.debug("WebGPU live_controls payload for %s: %s", widget_key, live_controls)
            # Get library data from session state if available
            # NOTE: We use get() not pop() so the data persists across renders
            # until the frontend acknowledges receipt via libraryAck event.
            st = get_st()
            ss = st.session_state

            # AUTO-LOAD library data on first render to avoid frontend requests
            # that would trigger Streamlit reruns via setComponentValue
            library_data = ss.get("_webgpu_library_response", None)
            if library_data is None and not ss.get("_webgpu_library_auto_loaded"):
                # Mark as auto-loaded to prevent repeated attempts
                ss["_webgpu_library_auto_loaded"] = True
                try:
                    from potfoundry.library import list_published
                    designs, has_more = list_published(
                        style=None,
                        search_query=None,
                        offset=0,
                        limit=12,
                    )
                    library_data = {
                        "action": "list",
                        "page": 1,
                        "designs": designs,
                        "hasMore": has_more,
                        "error": None,
                    }
                    ss["_webgpu_library_response"] = library_data
                    LOGGER.info("Auto-loaded %d library designs on first render", len(designs))
                except Exception as e:
                    LOGGER.warning("Failed to auto-load library: %s", e)
                    # Don't set error response - let frontend try later if needed

            event = component(
                p,
                height_px=height_px,
                background_color=background_color,
                background_rgba=background_rgba,
                background_mode=background_mode,
                gradient=gradient,
                widget_key=widget_key,
                canvas_id=resolved_canvas_id,
                live_controls=live_controls,
                library_data=library_data,
            )
        except Exception:  # fallback to legacy HTML
            LOGGER.exception("WebGPU component invocation failed; considering fallback")
            fallback_reason = "exception"
        else:
            if event is None:
                LOGGER.debug("WebGPU component returned no event; keeping component active")
                _reset_soft_fallback_state()
                if _debug_mode_enabled():
                    _render_debug_panel()
                return
            # Only force immediate reruns for explicit parameter batch commits
            # (paramBatchComplete) where the payload commit flag is true.
            # Camera state updates and non-commit param batches should NOT
            # re-run the Streamlit script; this prevents the switch-to-Preview
            # flow from causing a rerun loop.
            rerun = False
            if event.get("type") == "paramBatchComplete":
                payload = event.get("payload")
                payload_dict = payload if isinstance(payload, dict) else {}
                rerun = bool(payload_dict.get("commit") is True)
                # Provide access to session_state for the initial-commit guard
                st = get_st()
                ss = st.session_state
                # Avoid immediate reruns from initial mount commits. If the
                # component has never been observed for this canvas, ignore
                # the first commit-triggered rerun as it's often emitted on
                # component boot due to syncing rather than a user action.
                if rerun:
                    canvas_seen_key = f"_webgpu_component_seen:{resolved_canvas_id}"
                    if not ss.get(canvas_seen_key):
                        ss[canvas_seen_key] = True
                        LOGGER.debug(
                            "Ignoring initial commit-triggered rerun for canvas=%s",
                            resolved_canvas_id,
                        )
                        rerun = False
            _handle_component_event(event, rerun_if_queued=rerun)
            if _fatal_error_seen():
                LOGGER.error("WebGPU fatal error event received; triggering fallback")
                fallback_reason = "fatal-event"
            else:
                _reset_soft_fallback_state()
                if _debug_mode_enabled():
                    _render_debug_panel()
                return

    if fallback_reason and fallback_reason != "component-missing" and _start_or_extend_soft_fallback(fallback_reason):
        return

    if not component_available:
        fallback_reason = fallback_reason or "component-missing"

    if fallback_reason:
        LOGGER.warning("WebGPU component falling back to legacy HTML (reason=%s)", fallback_reason)
        get_st().warning("WebGPU component fell back to legacy renderer; see logs for details.")

    html = build_webgpu_html(
        p,
        height_px=height_px,
        background_color=background_color,
        component_id=component_dom_id,
        canvas_id=resolved_canvas_id,
    )
    get_components_v1().html(html, height=height_px, scrolling=False)
    if _debug_mode_enabled():
        _render_debug_panel()


__all__ = ["process_pending_webgpu_events", "render_webgpu_preview"]
