"""
Pytest configuration for the PotFoundry test suite.

Defines Hypothesis profiles for different testing scenarios.
"""

from hypothesis import settings, Verbosity

# CI profile: Reduced examples for faster execution in CI/CD
settings.register_profile(
    "ci",
    max_examples=10,
    deadline=5000,  # 5 seconds per test
    verbosity=Verbosity.normal,
    print_blob=True,
)

# Development profile: More examples for thorough local testing
settings.register_profile(
    "dev",
    max_examples=50,
    deadline=10000,  # 10 seconds per test
    verbosity=Verbosity.verbose,
)

# Quick profile: Minimal examples for rapid iteration
settings.register_profile(
    "quick",
    max_examples=5,
    deadline=2000,  # 2 seconds per test
    verbosity=Verbosity.quiet,
)

# Default to CI profile in CI environments, dev otherwise
import os
settings.load_profile(os.getenv("HYPOTHESIS_PROFILE", "dev"))
