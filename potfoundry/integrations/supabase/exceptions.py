"""Supabase configuration and exceptions.

This module provides configuration dataclasses and exception hierarchy
for Supabase client operations.
"""

from __future__ import annotations

from dataclasses import dataclass

__all__ = [
    "SupabaseConfig",
    "LibraryError",
    "NotConfiguredError",
    "UploadError",
    "DatabaseError",
]


@dataclass
class SupabaseConfig:
    """Supabase connection configuration.

    Args:
        url: Supabase project URL
        key: API key (service_role for full access or anon for read-only)
        bucket: Storage bucket name for file uploads
    """

    url: str
    key: str
    bucket: str


class LibraryError(Exception):
    """Base exception for library operations."""

    pass


class NotConfiguredError(LibraryError):
    """Raised when Supabase is not configured."""

    pass


class UploadError(LibraryError):
    """Raised when file upload fails."""

    pass


class DatabaseError(LibraryError):
    """Raised when database operation fails."""

    pass
