"""Supabase integration package for PotFoundry.

Provides modular Supabase client functionality with:
- Configuration and exceptions
- Placeholder client for non-configured environments
- Utility functions for validation and TLS handling
- Main SupabaseClient (imported from parent supabase_client.py)

For backward compatibility, the main client is still available from
potfoundry.integrations.supabase_client module.
"""

from __future__ import annotations

from .exceptions import (
    DatabaseError,
    LibraryError,
    NotConfiguredError,
    SupabaseConfig,
    UploadError,
)
from .placeholder import NotConfiguredClient
from .utils import (
    emit_tls_override_warning,
    is_disabled_via_secrets,
    looks_like_invalid_key,
    should_skip_tls_verify,
)

__all__ = [
    # Configuration and exceptions
    "SupabaseConfig",
    "LibraryError",
    "NotConfiguredError",
    "UploadError",
    "DatabaseError",
    # Clients
    "NotConfiguredClient",
    # Utilities
    "is_disabled_via_secrets",
    "should_skip_tls_verify",
    "emit_tls_override_warning",
    "looks_like_invalid_key",
]
