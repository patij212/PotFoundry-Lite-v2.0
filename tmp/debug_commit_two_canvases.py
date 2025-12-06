import sys, types, importlib

fake_streamlit = types.ModuleType("streamlit")
fake_streamlit.session_state = {}
rerun_calls = []

def fake_rerun():
    rerun_calls.append(True)

fake_streamlit.experimental_rerun = fake_rerun

sys.modules['streamlit'] = fake_streamlit
renderer = importlib.import_module('pfui.tabs.interactive.preview.webgpu_renderer')
importlib.reload(renderer)

payload_a = {
    'commit': True,
    'timestamp': 200,
    'fields': [{'sessionKey': 'H', 'value': 150.0}],
    'params': {'H': 150.0},
    'canvasId': 'canvas-a',
}
payload_b = {
    'commit': True,
    'timestamp': 201,
    'fields': [{'sessionKey': 'H', 'value': 150.0}],
    'params': {'H': 150.0},
    'canvasId': 'canvas-b',
}
print('initial ss keys:', list(fake_streamlit.session_state.keys()))
renderer._apply_live_param_batch(payload_a, rerun_if_queued=True)
print('after apply a pending_rerun_canvases:', fake_streamlit.session_state.get('_webgpu_pending_rerun_canvases'))
renderer.process_pending_webgpu_events()
print('after process a rerun_calls:', len(rerun_calls))
# Clear global cooldown timestamp to allow second rerun
fake_streamlit.session_state['_webgpu_global_rerun_ts'] = 0
renderer._apply_live_param_batch(payload_b, rerun_if_queued=True)
print('after apply b pending_rerun_canvases:', fake_streamlit.session_state.get('_webgpu_pending_rerun_canvases'))
renderer.process_pending_webgpu_events()
print('after process b rerun_calls:', len(rerun_calls))
print('ss keys:', list(fake_streamlit.session_state.keys()))
print('ss state:', fake_streamlit.session_state)
