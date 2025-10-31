from __future__ import annotations

import threading
from typing import Any, Callable


class Debouncer:
    """Simple thread-based debouncer.

    Use by calling .call(func, *args, **kwargs) repeatedly; the function
    will be invoked only after the given delay has elapsed since the last
    call. Not perfect for high-frequency production but sufficient for UI.
    """

    def __init__(self, delay: float = 0.25):
        self.delay = delay
        self._timer: threading.Timer | None = None
        self._lock = threading.Lock()

    def call(self, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> None:
        with self._lock:
            if self._timer is not None:
                try:
                    self._timer.cancel()
                except Exception:
                    pass
            self._timer = threading.Timer(self.delay, lambda: fn(*args, **kwargs))
            self._timer.daemon = True
            self._timer.start()

    def flush(self) -> None:
        """Force-run the pending timer (if any) synchronously."""
        with self._lock:
            t = self._timer
            self._timer = None
        if t is not None:
            t.cancel()
            # run synchronously
            try:
                t.function()
            except Exception:
                pass
