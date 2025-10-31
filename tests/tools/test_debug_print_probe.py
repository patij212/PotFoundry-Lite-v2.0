import pytest

from tools import debug_print_probe


@pytest.mark.integration
def test_get_build_pot_mesh_callable():
    """Runtime test: ensure the lazy wrapper returns a callable.

    This test imports the project's geometry module at runtime, so it is
    higher-risk than pure unit tests. It verifies the wrapper wiring only.
    """
    fn = debug_print_probe._get_build_pot_mesh()
    assert callable(fn)
    # Optionally call with minimal params to smoke test signature shape (not executed)
    # We avoid calling the heavy function here to keep test lightweight.
