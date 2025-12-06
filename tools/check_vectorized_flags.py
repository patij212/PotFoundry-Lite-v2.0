from potfoundry.core.styles import STYLES
for name, (fn, _) in STYLES.items():
    print(f"{name}: {getattr(fn, '__vectorized__', None)}")
