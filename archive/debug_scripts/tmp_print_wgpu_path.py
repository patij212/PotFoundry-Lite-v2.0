import sys
sys.path.insert(0, '.')
from pfui.components.webgpu_component import _discover_build_path
print(_discover_build_path())
