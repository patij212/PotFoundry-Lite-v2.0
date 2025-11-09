"""Library publishing package for PotFoundry.

Provides modular library publishing functionality with:
- Content hashing and canonical payload generation
- Validation for titles, tags, licenses, file sizes
- Rate limiting for publish operations
- Backward compatibility with potfoundry.library module

Core modules remain in parent library.py (publish_design, make_thumbnail, etc.)
"""

from __future__ import annotations

from .hashing import APP_VERSION, _normalize_dict, canonical_payload, content_id
from .rate_limit import check_rate_limit, record_publish
from .validation import (
    ALLOWED_LICENSES,
    BLOCKLIST_PATTERNS,
    MAX_STL_SIZE_MB,
    MAX_TAG_LENGTH,
    MAX_TAGS,
    MAX_TITLE_LENGTH,
    MAX_TRIANGLE_COUNT,
    validate_license,
    validate_stl_size,
    validate_tags,
    validate_title,
    validate_triangle_count,
)

__all__ = [
    # Version
    "APP_VERSION",
    # Hashing
    "canonical_payload",
    "content_id",
    "_normalize_dict",  # Exported for testing
    # Validation
    "MAX_TITLE_LENGTH",
    "MAX_TAGS",
    "MAX_TAG_LENGTH",
    "MAX_STL_SIZE_MB",
    "MAX_TRIANGLE_COUNT",
    "BLOCKLIST_PATTERNS",
    "ALLOWED_LICENSES",
    "validate_title",
    "validate_tags",
    "validate_license",
    "validate_stl_size",
    "validate_triangle_count",
    # Rate limiting
    "check_rate_limit",
    "record_publish",
]
