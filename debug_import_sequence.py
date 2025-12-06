import importlib
import time

modules = [
    "pfui._st",
    "pfui.tabs.interactive.preview.cache_management",
    "pfui.tabs.interactive.preview.utils",
    "pfui.tabs.interactive.preview.update_decision",
]

for mod in modules:
    print(f"Importing {mod}...")
    t0 = time.time()
    try:
        importlib.import_module(mod)
    except Exception as e:
        print(f"Error importing {mod}:", e)
        import traceback
        traceback.print_exc()
        break
    t1 = time.time()
    print(f"Imported {mod} in {t1 - t0:.3f} seconds")

print("Done")
