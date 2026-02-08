"""Supabase configuration and exceptions.

This module provides configuration dataclasses and exception hierarchy
for Supabase client operations.
"""

from __future__ import annotations

from dataclasses import dataclass

__all__ = [
    "DatabaseError",
    "LibraryError",
    "NotConfiguredError",
    "SupabaseConfig",
    "UploadError",
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



class NotConfiguredError(LibraryError):
    """Raised when Supabase is not configured."""



class UploadError(LibraryError):
    """Raised when file upload fails."""



class DatabaseError(LibraryError):
    """Raised when database operation fails."""

