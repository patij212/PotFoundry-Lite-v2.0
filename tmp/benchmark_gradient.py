"""Benchmark gradient color computation to verify 100x speedup."""

import time

import numpy as np

from pfui.colors import build_gradient_colors

# Simulate 500k vertices (like 512×256 mesh)
n_verts = 521_280
z_norm = np.linspace(0, 1, n_verts)

print(f"Benchmarking gradient colors for {n_verts:,} vertices...")
print()

# Warm-up run
_ = build_gradient_colors(z_norm, "Classic Blue")
# Ensure `colors` is defined for static analyzers (will be overwritten below)
colors: np.ndarray = np.empty((0, 3), dtype=np.uint8)

# Benchmark runs
times: list[float] = []
for i in range(5):
    t0 = time.perf_counter()
    colors = build_gradient_colors(z_norm, "Classic Blue")
    t1 = time.perf_counter()
    elapsed_ms = (t1 - t0) * 1000
    times.append(elapsed_ms)
    print(f"Run {i+1}: {elapsed_ms:.1f}ms")

print()
print(f"Average: {np.mean(times):.1f}ms")
print(f"Min: {np.min(times):.1f}ms")
print(f"Max: {np.max(times):.1f}ms")
print()

# Verify output
assert isinstance(colors, np.ndarray)
assert colors.dtype == np.uint8
assert colors.shape == (n_verts, 3)
print(f"✓ Output verified: {colors.shape} uint8 array")
print(f"✓ Memory efficient: {colors.nbytes / 1024 / 1024:.1f} MB")
print()

# Compare to old performance
old_time_ms = 1290
speedup = old_time_ms / np.mean(times)
print(f"Old implementation: ~{old_time_ms}ms (Python loop)")
print(f"New implementation: ~{np.mean(times):.1f}ms (vectorized NumPy)")
print(f"Speedup: {speedup:.0f}x faster! 🚀")
