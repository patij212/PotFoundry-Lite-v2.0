from pfui.tabs.interactive.preview import webgpu_renderer
import time

st = webgpu_renderer.get_st()
ss = st.session_state
print('Initial session_state keys:', list(ss.keys()))

# Simulate ready event
webgpu_renderer._handle_component_event({'type':'ready','payload':{'timestamp':time.time(),'canvasId':'webgpu-preview'}}, rerun_if_queued=False)
print('After ready seen flag:', ss.get('_webgpu_component_seen:webgpu-preview'))

# Simulate commit event that would normally trigger rerun
webgpu_renderer._handle_component_event({'type':'paramBatchComplete','payload':{'params':{},'fields':[],'timestamp':time.time(),'commit':True}}, rerun_if_queued=True)
print('After commit, commit sig key:', ss.get('_webgpu_last_param_commit_sig:webgpu-preview'))
print('Session keys now:', list(ss.keys()))

# Simulate subsequent commit (should dedupe or cooldown)
webgpu_renderer._handle_component_event({'type':'paramBatchComplete','payload':{'params':{},'fields':[],'timestamp':time.time(),'commit':True}}, rerun_if_queued=True)
print('After subsequent commit, _webgpu_global_rerun_ts:', ss.get('_webgpu_global_rerun_ts'))
print('Done')
