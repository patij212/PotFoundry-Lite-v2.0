"""Minimal type stub for the `supabase` package used in PotFoundry.
This file provides a tiny subset of the public API used by the project so mypy stops reporting import-not-found.

Note: This is intentionally minimal. If you use more of the supabase API, expand these declarations.
"""

from collections.abc import Mapping
from typing import Any

class SupabaseResponse:
    # Most call-sites expect a list of row dicts or None
    data: list[dict[str, Any]] | None

class Query:
    def upsert(self, row: dict[str, Any]) -> Query: ...
    def update(self, changes: dict[str, Any]) -> Query: ...
    def select(self, what: str = ...) -> Query: ...
    def delete(self) -> Query: ...
    def eq(self, col: str, val: Any) -> Query: ...
    def contains(self, col: str, val: Any) -> Query: ...
    def ilike(self, col: str, pattern: str) -> Query: ...
    def order(self, col: str, desc: bool = ...) -> Query: ...
    def limit(self, n: int) -> Query: ...
    def offset(self, n: int) -> Query: ...
    def execute(self) -> SupabaseResponse: ...

class StorageBucket:
    def upload(
        self, path: str, data: bytes, file_options: dict[str, Any] | None = ...,
    ) -> Any: ...
    def get_public_url(self, path: str) -> str: ...

class Storage:
    def from_(self, bucket: str) -> StorageBucket: ...

class SupabaseClient:
    storage: Storage

    def table(self, name: str) -> Query: ...

def create_client(url: str, key: str) -> SupabaseClient: ...
def from_url(url: str) -> SupabaseClient: ...

# Minimal HTTP response/session types to match dynamic fallback code paths
class HTTPResponse:
    status_code: int
    text: str
    headers: dict[str, Any]

    def raise_for_status(self) -> None: ...
    def json(self) -> Any: ...

class Session:
    # Align signatures with requests.Session to reduce mypy param-type complaints
    def get(
        self,
        url: str,
        params: Any | None = ...,
        **kwargs: Any,
    ) -> HTTPResponse: ...
    def post(
        self,
        url: str,
        data: bytes | Mapping[str, Any] | None = ...,
        json: dict[str, Any] | None = ...,
        headers: Mapping[str, str] | None = ...,
        params: Any | None = ...,
        timeout: float | tuple[float, float] | None = ...,
        **kwargs: Any,
    ) -> HTTPResponse: ...
    def patch(
        self,
        url: str,
        data: bytes | Mapping[str, Any] | None = ...,
        json: dict[str, Any] | None = ...,
        headers: Mapping[str, str] | None = ...,
        params: Any | None = ...,
        timeout: float | tuple[float, float] | None = ...,
        **kwargs: Any,
    ) -> HTTPResponse: ...
    def delete(
        self,
        url: str,
        params: Any | None = ...,
        headers: Mapping[str, str] | None = ...,
        timeout: float | tuple[float, float] | None = ...,
        **kwargs: Any,
    ) -> HTTPResponse: ...
