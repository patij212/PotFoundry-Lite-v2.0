from pfui.tabs.interactive import preview_impl
import json

ss = {}
preview = preview_impl._build_live_controls_spec(ss, 'FourierBloom', enabled=True)
field = next((f for f in preview['fields'] if f.get('sessionKey') == 'r_drain'), None)
print(json.dumps(field, indent=2))
