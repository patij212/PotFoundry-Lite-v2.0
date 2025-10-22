def test_schemas_accessors_importable():
    # Smoke test: ensure accessor functions are importable and return mappings
    from pfui import schemas

    ga = schemas.get_global_aliases()
    assert isinstance(ga, dict) or hasattr(ga, 'get')

    abs_ = schemas.get_aliases_by_style()
    assert isinstance(abs_, dict) or hasattr(abs_, 'get')

    gr = schemas.get_global_reverse()
    assert isinstance(gr, dict) or hasattr(gr, 'get')

    rb = schemas.get_reverse_by_style()
    assert isinstance(rb, dict) or hasattr(rb, 'get')
