"""Validation functions for library publishing.

Provides validation for:
- Title content and length
- Tags format and content
- License identifiers
- STL file size limits
- Triangle count limits
"""

from __future__ import annotations

import re

__all__ = [
    "ALLOWED_LICENSES",
    "BLOCKLIST_PATTERNS",
    "MAX_STL_SIZE_MB",
    "MAX_TAGS",
    "MAX_TAG_LENGTH",
    "MAX_TITLE_LENGTH",
    "MAX_TRIANGLE_COUNT",
    "validate_license",
    "validate_stl_size",
    "validate_tags",
    "validate_title",
    "validate_triangle_count",
]


# Constants
MAX_TITLE_LENGTH = 120
MAX_TAGS = 10
MAX_TAG_LENGTH = 24
MAX_STL_SIZE_MB = 25
MAX_TRIANGLE_COUNT = 5_000_000

# Blocklist for inappropriate content (expandable)
BLOCKLIST_PATTERNS = [
    r"\b(spam|test123|asdf|xxx)\b",  # Common spam/test patterns
]

# Allowed licenses
ALLOWED_LICENSES = [
    "CC BY-NC 4.0",
    "CC BY 4.0",
    "CC BY-SA 4.0",
    "CC0 1.0",
    "MIT",
    "Apache 2.0",
]


def validate_title(title: str) -> tuple[bool, str | None]:
    """Validate title string.

    Args:
        title: Title to validate
        
    Returns:
        Tuple of (is_valid, error_message)

    """
    if not title:
        return False, "Title cannot be empty"

    if len(title) > MAX_TITLE_LENGTH:
        return False, f"Title exceeds {MAX_TITLE_LENGTH} characters"

    # Check blocklist
    for pattern in BLOCKLIST_PATTERNS:
        if re.search(pattern, title, re.IGNORECASE):
            return False, "Title contains inappropriate content"

    return True, None


def validate_tags(tags: list[str]) -> tuple[bool, str | None]:
    """Validate tags list.

    Args:
        tags: List of tags to validate
        
    Returns:
        Tuple of (is_valid, error_message)

    """
    if len(tags) > MAX_TAGS:
        return False, f"Maximum {MAX_TAGS} tags allowed"

    for tag in tags:
        if len(tag) > MAX_TAG_LENGTH:
            return False, f"Tag '{tag}' exceeds {MAX_TAG_LENGTH} characters"

        # Only alphanumeric, dash, underscore
        if not re.match(r"^[A-Za-z0-9_-]+$", tag):
            return (
                False,
                f"Tag '{tag}' contains invalid characters (use A-Z, 0-9, -, _)",
            )

        # Check blocklist
        for pattern in BLOCKLIST_PATTERNS:
            if re.search(pattern, tag, re.IGNORECASE):
                return False, f"Tag '{tag}' contains inappropriate content"

    return True, None


def validate_license(license: str) -> tuple[bool, str | None]:
    """Validate license identifier.

    Args:
        license: License identifier to validate
        
    Returns:
        Tuple of (is_valid, error_message)

    """
    if license not in ALLOWED_LICENSES:
        return False, f"License must be one of: {', '.join(ALLOWED_LICENSES)}"

    return True, None


def validate_stl_size(stl_bytes: bytes) -> tuple[bool, str | None]:
    """Validate STL file size.

    Args:
        stl_bytes: STL file content as bytes
        
    Returns:
        Tuple of (is_valid, error_message)

    """
    size_mb = len(stl_bytes) / (1024 * 1024)

    if size_mb > MAX_STL_SIZE_MB:
        return False, f"STL file too large: {size_mb:.1f}MB (max {MAX_STL_SIZE_MB}MB)"

    return True, None


def validate_triangle_count(diagnostics: dict) -> tuple[bool, str | None]:
    """Validate triangle count from diagnostics.

    Args:
        diagnostics: Mesh diagnostics dictionary containing triangle_count
        
    Returns:
        Tuple of (is_valid, error_message)

    """
    triangle_count = diagnostics.get("triangle_count", 0)

    if triangle_count > MAX_TRIANGLE_COUNT:
        return (
            False,
            f"Triangle count too high: {triangle_count:,} (max {MAX_TRIANGLE_COUNT:,})",
        )

    return True, None
