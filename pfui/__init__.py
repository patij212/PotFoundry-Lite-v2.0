"""pfui package initializer.

This file intentionally kept minimal. Adding it enables relative imports
within the `pfui` package and fixes static analysis tools (mypy) that
require a package __init__ to resolve relative imports.

Keep logic-free to avoid import-time side-effects during test discovery.
"""

__all__ = []
