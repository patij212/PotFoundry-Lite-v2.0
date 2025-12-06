"""Centralized logging configuration for PotFoundry.

This module provides a unified logging interface for the entire codebase.
All modules should import the logger from here rather than creating their own.

Usage:
    from potfoundry.core.logging import logger

    # Then use standard logging calls:
    logger.debug("Detailed debugging info")
    logger.info("General information")
    logger.warning("Something unexpected but handled")
    logger.error("Error that was caught and handled")
    logger.exception("Error with full traceback")
"""

from __future__ import annotations

import logging
import os
import sys

# Create the main logger for potfoundry
logger = logging.getLogger("potfoundry")

# Only configure if not already configured (avoid duplicate handlers)
if not logger.handlers:
    # Default to WARNING in production, DEBUG if POTFOUNDRY_DEBUG is set
    default_level = logging.DEBUG if os.getenv("POTFOUNDRY_DEBUG") else logging.WARNING
    logger.setLevel(default_level)

    # Console handler with a reasonable format
    handler = logging.StreamHandler(sys.stderr)
    handler.setLevel(default_level)

    # Format: timestamp - logger name - level - message
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)

# Convenience aliases for common exception types that should be caught
# instead of bare 'except Exception:'
IMPORT_ERRORS = (ImportError, ModuleNotFoundError)
VALUE_ERRORS = (ValueError, TypeError, KeyError, IndexError)
IO_ERRORS = (IOError, OSError, FileNotFoundError, PermissionError)
RUNTIME_ERRORS = (RuntimeError, AttributeError)

__all__ = [
    "logger",
    "IMPORT_ERRORS",
    "VALUE_ERRORS",
    "IO_ERRORS",
    "RUNTIME_ERRORS",
]
