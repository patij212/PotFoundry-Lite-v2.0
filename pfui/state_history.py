from __future__ import annotations

"""
Purpose
    Lightweight undo/redo for UI state. Stores deep-copied snapshots
    in small ring buffers. UI-only; safe to import in tests with a stubbed
    `streamlit` module.

Inputs
    Functions mutate st.session_state.

Outputs
    Undo/redo stacks and restored UI state.

Guarantees
    - No imports from potfoundry/core/**
    - No side effects on import.
    - Deep copies at checkpoint: later UI mutations won’t alias snapshots.

Errors
    - Functions are no-ops when stacks are empty.
"""

from typing import Any, Dict  # noqa: E402
import copy  # noqa: E402

# Allow tests to stub `streamlit` via sys.modules before importing; pre-declare
# the `st` name so type-checkers don't require `# type: ignore` on the local
# import below.
st: Any

MAX_HISTORY = 50
UNDO = "__undo_stack__"
REDO = "__redo_stack__"


def _st():
    # Lazy import so tests can stub sys.modules['streamlit'] first.
    import streamlit as st

    return st


def _push(stack: str, snapshot: Dict[str, Any]) -> None:
    st = _st()
    st.session_state.setdefault(stack, [])
    st.session_state[stack].append(snapshot)
    if len(st.session_state[stack]) > MAX_HISTORY:
        st.session_state[stack].pop(0)


def _snapshot(style: str) -> Dict[str, Any]:
    st = _st()
    # Deep copy so later UI edits don’t mutate the snapshot.
    return {
        "style": style,
        "global": copy.deepcopy(st.session_state.get("ui.global", {})),
        "params": copy.deepcopy(st.session_state.get("ui.params", {})),
    }


def checkpoint(style: str) -> None:
    """
    Purpose:
        Save a snapshot to the undo stack and clear the redo stack.
    """
    st = _st()
    _push(UNDO, _snapshot(style))
    st.session_state[REDO] = []


def undo() -> None:
    """
    Purpose:
        Restore the last snapshot from undo, pushing current state to redo.
    """
    st = _st()
    if not st.session_state.get(UNDO):
        return
    current = _snapshot(st.session_state.get("ui.style", ""))
    _push(REDO, current)
    snap = st.session_state[UNDO].pop()
    st.session_state["ui.style"] = snap["style"]
    st.session_state["ui.global"] = snap["global"]
    st.session_state["ui.params"] = snap["params"]


def redo() -> None:
    """
    Purpose:
        Restore the last snapshot from redo, pushing current state to undo.
    """
    st = _st()
    if not st.session_state.get(REDO):
        return
    current = _snapshot(st.session_state.get("ui.style", ""))
    _push(UNDO, current)
    snap = st.session_state[REDO].pop()
    st.session_state["ui.style"] = snap["style"]
    st.session_state["ui.global"] = snap["global"]
    st.session_state["ui.params"] = snap["params"]
