import sys, types, importlib
fake_streamlit = types.ModuleType('streamlit')
fake_streamlit.session_state = {}
def fake_rerun(): print('rerun called')
fake_streamlit.experimental_rerun = fake_rerun
sys.modules['streamlit'] = fake_streamlit
renderer = importlib.import_module('pfui.tabs.interactive.preview.webgpu_renderer')
importlib.reload(renderer)
cap = getattr(renderer, '_CANVAS_RERUNS_PER_MINUTE', 3)
canvas = 'ratecap-canvas'
reason = f'webgpu-live-controls:{canvas}'
import time
fake_streamlit.session_state[f'_webgpu_component_seen:{canvas}'] = True
fake_streamlit.session_state['_webgpu_global_rerun_ts'] = 0
for i in range(cap + 3):
    renderer._request_streamlit_rerun(reason)
    print('i', i, 'global_bucket_ts', fake_streamlit.session_state.get('_webgpu_rerun_minute_bucket_ts'), 'global_cnt', fake_streamlit.session_state.get('_webgpu_rerun_minute_bucket_cnt'), 'canvas_cnt', fake_streamlit.session_state.get(f'_webgpu_canvas_rerun_bucket_cnt:{canvas}'))
