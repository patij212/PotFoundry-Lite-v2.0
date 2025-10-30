"""Minimal type stub for the `supabase` package used in PotFoundry.
This file provides a tiny subset of the public API used by the project so mypy stops reporting import-not-found.

Note: This is intentionally minimal. If you use more of the supabase API, expand these declarations.
"""
from typing import Any, Dict, List, Optional, Mapping, Tuple, Union


class SupabaseResponse:
    # Most call-sites expect a list of row dicts or None
    data: Optional[List[Dict[str, Any]]]


class Query:
    def upsert(self, row: Dict[str, Any]) -> "Query": ...

    def update(self, changes: Dict[str, Any]) -> "Query": ...

    def select(self, what: str = ...) -> "Query": ...

    def delete(self) -> "Query": ...

    def eq(self, col: str, val: Any) -> "Query": ...

    def contains(self, col: str, val: Any) -> "Query": ...

    def ilike(self, col: str, pattern: str) -> "Query": ...

    def order(self, col: str, desc: bool = ...) -> "Query": ...

    def limit(self, n: int) -> "Query": ...

    def offset(self, n: int) -> "Query": ...

    def execute(self) -> SupabaseResponse: ...


class StorageBucket:
    def upload(self, path: str, data: bytes, file_options: Optional[Dict[str, Any]] = ...) -> Any: ...

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
    headers: Dict[str, Any]

    def raise_for_status(self) -> None: ...

    def json(self) -> Any: ...


class Session:
    # Align signatures with requests.Session to reduce mypy param-type complaints
    def get(
        self,
        url: str,
        params: Optional[Any] = ...,
        **kwargs: Any,
    ) -> HTTPResponse: ...

    def post(
        self,
        url: str,
        data: Optional[Union[bytes, Mapping[str, Any]]] = ...,
        json: Optional[Dict[str, Any]] = ...,
        headers: Optional[Mapping[str, str]] = ...,
        params: Optional[Any] = ...,
        timeout: Optional[Union[float, Tuple[float, float]]] = ...,
        **kwargs: Any,
    ) -> HTTPResponse: ...

    def patch(
        self,
        url: str,
        data: Optional[Union[bytes, Mapping[str, Any]]] = ...,
        json: Optional[Dict[str, Any]] = ...,
        headers: Optional[Mapping[str, str]] = ...,
        params: Optional[Any] = ...,
        timeout: Optional[Union[float, Tuple[float, float]]] = ...,
        **kwargs: Any,
    ) -> HTTPResponse: ...

    def delete(
        self,
        url: str,
        params: Optional[Any] = ...,
        headers: Optional[Mapping[str, str]] = ...,
        timeout: Optional[Union[float, Tuple[float, float]]] = ...,
        **kwargs: Any,
    ) -> HTTPResponse: ...

