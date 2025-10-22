"""Test version management."""

import potfoundry


def test_version_exists():
    """Verify __version__ is defined in potfoundry."""
    assert hasattr(potfoundry, "__version__")
    assert potfoundry.__version__ is not None


def test_version_format():
    """Verify version follows semantic versioning format."""
    version = potfoundry.__version__
    assert isinstance(version, str)
    parts = version.split(".")
    assert len(parts) == 3, f"Version should be MAJOR.MINOR.PATCH, got {version}"
    # Check parts are numeric
    for part in parts:
        assert part.isdigit(), (
            f"Version part should be numeric, got {part} in {version}"
        )


def test_version_value():
    """Verify current version is 2.1.0."""
    assert potfoundry.__version__ == "2.1.0"


def test_version_in_all():
    """Verify __version__ is exported in __all__."""
    assert "__version__" in potfoundry.__all__
