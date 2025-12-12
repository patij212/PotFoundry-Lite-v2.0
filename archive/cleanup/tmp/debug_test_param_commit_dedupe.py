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

payload = {
    'commit': True,
    'timestamp': 123,
    'fields': [{'sessionKey': 'H', 'value': 150.0}],
    'params': {'H': 150.0},
    'canvasId': 'test-canvas',
}

print('Before apply session:', fake_streamlit.session_state.keys())
renderer._apply_live_param_batch(payload, rerun_if_queued=True)
print('After apply session:', fake_streamlit.session_state.keys())
renderer.process_pending_webgpu_events()
print('After process session:', fake_streamlit.session_state.keys())
print('Reruns called:', len(rerun_calls))
# Now apply duplicate
renderer._apply_live_param_batch(payload, rerun_if_queued=True)
renderer.process_pending_webgpu_events()
print('Final reruns:', len(rerun_calls))
print('session state:', fake_streamlit.session_state)
