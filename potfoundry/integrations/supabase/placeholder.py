"""Placeholder client for when Supabase is not configured.

Provides a graceful fallback that raises NotConfiguredError for all operations.
"""

from __future__ import annotations

from .exceptions import NotConfiguredError


__all__ = ["NotConfiguredClient"]


class NotConfiguredClient:
    """Placeholder client when Supabase is not configured.
    
    All operations raise NotConfiguredError to provide clear feedback
    when Supabase integration is not available.
    """

    def upload_bytes(self, *args, **kwargs):
        """Raise NotConfiguredError for upload attempts."""
        raise NotConfiguredError("Supabase not configured")

    def upsert_row(self, *args, **kwargs):
        """Raise NotConfiguredError for upsert attempts."""
        raise NotConfiguredError("Supabase not configured")

    def select_rows(self, *args, **kwargs):
        """Raise NotConfiguredError for select attempts."""
        raise NotConfiguredError("Supabase not configured")

    def is_configured(self) -> bool:
        """Return False to indicate Supabase is not configured."""
        return False

    def delete_rows(self, *args, **kwargs):
        """Raise NotConfiguredError for delete attempts."""
        raise NotConfiguredError("Supabase not configured")

    def update_rows(self, *args, **kwargs):
        """Raise NotConfiguredError for update attempts."""
        raise NotConfiguredError("Supabase not configured")
