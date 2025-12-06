import importlib
import sys
from types import ModuleType
from pfui.tabs.interactive.preview import webgpu_renderer


class StubStreamlit(ModuleType):
    def __init__(self):
        super().__init__("streamlit")
        self.session_state = {}
        self.rerun_count = 0

    def rerun(self):
        self.rerun_count += 1


def fake_component_generator(events):
    def render_component(params, **kwargs):
        # Pop next event or return None
        if not events:
            return None
        return events.pop(0)

    return render_component


def main():
    # Install stub streamlit module
    stub = StubStreamlit()
    sys.modules["streamlit"] = stub
    # Make a component that returns repeated commit True events with identical payload
    event = {"type": "paramBatchComplete", "payload": {"params": {}, "fields": [], "commit": True, "timestamp": 1}}
    events = [event.copy() for _ in range(5)]
    webgpu_renderer._render_component = fake_component_generator(events)

    # Call render_webgpu_preview repeatedly to simulate streamlit runs
    for i in range(6):
        webgpu_renderer.render_webgpu_preview(params={}, widget_key=f"webgpu_preview_{i}")
        print(f"run {i}; rerun_count={stub.rerun_count}; ss_keys={list(stub.session_state.keys())}")


if __name__ == "__main__":
    main()
