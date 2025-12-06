from potfoundry import STYLES
from potfoundry.core import optimizations as opt
from potfoundry.core.geometry import build_pot_mesh

for style_name in STYLES.keys():
    style_fn, _ = STYLES[style_name]
    verts_std, faces_std, _ = build_pot_mesh(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=168, n_z=84,
        r_outer_fn=style_fn, style_opts={},
    )
    print('  style function:', getattr(style_fn,'__name__', repr(style_fn)) )
    verts_acc, faces_acc, diag = opt.build_pot_mesh_accelerated(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=168, n_z=84,
        r_outer_fn=style_fn, style_opts={}, collect_timings=True,
    )
    from numpy import allclose
    eq = allclose(verts_std, verts_acc, rtol=1e-6, atol=1e-9)
    print(style_name, 'accelerated_used:', diag.get('accelerated_used'), 'match:', eq, 'speedup diag:', diag)
    if not eq:
        import numpy as np
        diffs = np.where(~np.isclose(verts_std, verts_acc, rtol=1e-6, atol=1e-9))[0]
        print('  diffs count:', len(diffs))
        for idx in diffs[:6]:
            print('   ', idx, verts_std[idx], verts_acc[idx])
        print('  First 12 verts std:')
        for i in range(12): print('   ', i, verts_std[i])
        print('  First 12 verts acc:')
        for i in range(12): print('   ', i, verts_acc[i])
        # Print sample per-z r-values for z=0 for standard and accelerated wrapper
        import numpy as np
        from potfoundry.core.mesh import theta_grid_cached
        thetas, cos_th, sin_th = theta_grid_cached(168)
        # Compute r_values for first z row using style function directly
        r0_std = style_fn(thetas, 0.0, 50.0, 120, {})
        print('   sample first r values (first five): std:', np.asarray(r0_std)[:5])
        try:
            r0_acc = style_fn(thetas, 0.0, 50.0, 120, {})
            print('   acc style sample same call (first five):', np.asarray(r0_acc)[:5])
        except Exception as e:
            print('   acc style sample raised:', e)
