
from typing import Any, Protocol

class _ComponentFunc(Protocol):
	def __call__(self, *args: Any, **kwargs: Any) -> Any: ...


def declare_component(
	name: str,
	*,
	path: str | None = None,
	url: str | None = None,
) -> _ComponentFunc: ...


def html(component_html: Any, height: int = 0, scrolling: bool = False) -> Any: ...
