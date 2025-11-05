"""Update decision logic and debounce JavaScript injection for preview."""

from __future__ import annotations

from typing import Any, cast

import streamlit as st

from .utils import to_float_scalar


def should_update_preview_ui(preview_mode: str, ss: dict[str, Any]) -> tuple[bool, bool]:
    """Determine if preview should update based on mode and render UI controls.
    
    Args:
        preview_mode: One of "auto", "manual", or "debounced"
        ss: Session state dictionary
        
    Returns:
        Tuple of (should_update, controls_rendered)
    """
    should_update = False
    controls_rendered = False
    
    if preview_mode == "auto":
        should_update = True
    else:
        controls_rendered = True
        # Render manual update controls (button + caption). The debounced
        # mode will attempt a client-side auto-click, but we also implement a
        # server-side fallback below in case the JS doesn't run in the client.
        col1, col2 = st.columns([3, 1])
        with col1:
            update_clicked = st.button("🔄 Update Preview", type="primary")
            if update_clicked:
                should_update = True
                # Clear cache to force regeneration
                try:
                    st.cache_data.clear()
                except Exception:
                    pass
    
            if preview_mode == "debounced":
                # Inject debounce JavaScript
                inject_debounce_js(ss)
        
        with col2:
            st.caption("Manual mode" if preview_mode == "manual" else "Debounced mode")
            # Quick utility: allow clearing preview caches if rendering gets stuck
            if st.button("Reset preview cache", key="btn_reset_preview_cache"):
                clear_preview_cache(ss)
                st.rerun()
    
        # Server-side fallback for debounced/manual modes
        if not should_update:
            should_update = check_server_side_update(preview_mode, ss)
    
    return should_update, controls_rendered


def inject_debounce_js(ss: dict[str, Any]) -> None:
    """Inject JavaScript for debounced preview updates.
    
    Args:
        ss: Session state dictionary
    """
    timeout_ms = int(to_float_scalar(ss.get("debounce_timeout", 0.8)) * 1000)
    js = """
<script>
(function(){
  if (window._pf_debounce_installed) return;
  window._pf_debounce_installed = true;
  var timeout = %d;
  var timer = null;
  function findButton(){
var byText = Array.from(document.querySelectorAll('button')).find(function(b){
  return b.innerText && b.innerText.trim().startsWith('🔄 Update Preview');
});
if(byText) return byText;
var byAttr = Array.from(document.querySelectorAll('button')).find(function(b){
  return (b.getAttribute('data-testid') && b.getAttribute('data-testid').toLowerCase().includes('button')) || (b.className && b.className.toLowerCase().includes('stButton'));
});
return byAttr || null;
  }
  function scheduleClick(){
if(timer) clearTimeout(timer);
timer = setTimeout(function(){
  var btn = findButton()
  if(btn){ try{ btn.click()
  } catch(e){} }
}, timeout);
  }
  var observer = new MutationObserver(function(){ scheduleClick()
  })
  observer.observe(document.body, {childList:true, subtree:true, attributes:true});
  ['input','change','mouseup','keyup','pointerup'].forEach(function(ev){ document.addEventListener(ev, scheduleClick, true)
  })
  var finder = setInterval(function(){ if(findButton()) { clearInterval(finder)
  } }, 250)
})();
</script>
""" % (timeout_ms,)
    try:
        import streamlit.components.v1 as components
        components.html(js, height=0)
    except Exception:
        pass


def clear_preview_cache(ss: dict[str, Any]) -> None:
    """Clear all preview caches from session state.
    
    Args:
        ss: Session state dictionary
    """
    try:
        st.cache_data.clear()
    except Exception:
        pass
    
    # Clear session-cached arrays and figures
    for k in (
        "_last_X",
        "_last_Y",
        "_last_Z",
        "_last_mesh_V",
        "_last_mesh_F",
        "_last_mesh_fig_json",
        "_last_surface_fig_json",
        "_last_mesh_png",
        "_last_surface_png",
    ):
        try:
            if k in ss:
                del ss[k]
        except Exception:
            pass
    ss["_preview_stale"] = True


def check_server_side_update(preview_mode: str, ss: dict[str, Any]) -> bool:
    """Check if server-side fallback should trigger update.
    
    Args:
        preview_mode: Preview mode string
        ss: Session state dictionary
        
    Returns:
        True if should update based on server-side check
    """
    try:
        # Import the helper function (may not exist in all versions)
        from pfui.app_components.plotting import should_update_preview
        
        last_ts = cast(Any, ss.get("_last_change_ts", None))
        debounce_timeout_seconds = to_float_scalar(ss.get("debounce_timeout", 0.8))
        
        try:
            if should_update_preview(
                preview_mode,
                last_change_ts=last_ts,
                debounce_timeout_s=debounce_timeout_seconds,
                stale=bool(cast(Any, ss.get("_preview_stale", False))),
            ):
                return True
        except Exception:
            # best-effort; ignore failures
            pass
    except ImportError:
        # Function doesn't exist, skip check
        pass
    except Exception:
        # best-effort; ignore failures
        pass
    
    return False
