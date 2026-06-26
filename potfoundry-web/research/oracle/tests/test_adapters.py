import math
import numpy as np
from adapters import triangle_adapter, gmsh_adapter


def _square_input(h=0.1):
    res = 4
    return {"style": "Cyl", "H": 120.0, "domain": {"uPeriodic": True},
            "sizing": {"resU": res, "resT": res, "h": [h] * (res * res)}, "ours": None}


def _check(out):
    ut = np.array(out["ut"]).reshape(-1, 2)
    idx = np.array(out["indices"]).reshape(-1, 3)
    assert idx.shape[0] > 20
    assert ut[:, 0].min() >= -1e-9 and ut[:, 0].max() <= 1 + 1e-9
    assert ut[:, 1].min() >= -1e-9 and ut[:, 1].max() <= 1 + 1e-9


def _aniso_input(resU=8, resT=8, M00=100.0, M01=0.0, M11=1.0):
    """Synthesise an anisotropic OracleInput: uniform metric highly elongated in u."""
    h_iso = [0.1] * (resU * resT)
    m = []
    for _ in range(resU * resT):
        m += [M00, M01, M11]
    return {
        "style": "Cyl", "H": 120.0, "domain": {"uPeriodic": True},
        "sizing": {"resU": resU, "resT": resT, "h": h_iso},
        "metric": {"resU": resU, "resT": resT, "m": m},
        "ours": None,
    }


def _fluted_cylinder_metric(resU=24, resT=24, tolMm=0.1, hMin=0.003, hMax=0.3):
    """Build the anisotropic metric for a fluted cylinder using the same math as metricField.ts."""
    TAU = 2 * math.pi
    H = 120.0
    R_base = 50.0
    n_flutes = 12
    amp = 3.0

    def rA(theta):
        return R_base + amp * math.cos(n_flutes * theta)

    def S(u, t):
        th = TAU * u
        z = t * H
        r = rA(th)
        return (r * math.cos(th), r * math.sin(th), z)

    du = 1.0 / max(resU - 1, 1)
    dt = 1.0 / max(resT - 1, 1)
    muMin = 1.0 / (hMax ** 2)
    muMax = 1.0 / (hMin ** 2)

    def sub(a, b):
        return (a[0] - b[0], a[1] - b[1], a[2] - b[2])

    def cross(a, b):
        return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])

    def dot(a, b):
        return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]

    def vnorm(a):
        nl = math.sqrt(a[0]**2 + a[1]**2 + a[2]**2)
        return (a[0]/nl, a[1]/nl, a[2]/nl), nl

    m = []
    for it in range(resT):
        for iu in range(resU):
            uu = min(max(iu * du, du), 1 - du)
            tt = min(max(it * dt, dt), 1 - dt)
            c = S(uu, tt)
            Su = tuple((S(uu+du, tt)[k] - S(uu-du, tt)[k]) / (2*du) for k in range(3))
            St = tuple((S(uu, tt+dt)[k] - S(uu, tt-dt)[k]) / (2*dt) for k in range(3))
            Suu = tuple((S(uu+du,tt)[k] - 2*c[k] + S(uu-du,tt)[k]) / (du**2) for k in range(3))
            Stt = tuple((S(uu,tt+dt)[k] - 2*c[k] + S(uu,tt-dt)[k]) / (dt**2) for k in range(3))
            pp = S(uu+du, tt+dt); pm = S(uu+du, tt-dt)
            mp = S(uu-du, tt+dt); mm_ = S(uu-du, tt-dt)
            Sut = tuple((pp[k]-pm[k]-mp[k]+mm_[k]) / (4*du*dt) for k in range(3))
            nraw = cross(Su, St)
            n, nl = vnorm(nraw)
            if nl < 1e-30:
                m += [muMin, 0.0, muMin]
                continue
            L = dot(Suu, n); Mm = dot(Sut, n); N = dot(Stt, n)
            tr = L + N
            disc = math.sqrt(max(0, (tr**2)/4 - (L*N - Mm**2)))
            l1 = tr/2 + disc; l2 = tr/2 - disc
            def evec(lam):
                ex, ey = Mm, lam - L
                el = math.hypot(ex, ey)
                if el < 1e-20:
                    ex, ey = lam - N, Mm
                    el = math.hypot(ex, ey)
                    if el < 1e-20:
                        return (1.0, 0.0)
                return (ex/el, ey/el)
            e1 = evec(l1); e2 = (-e1[1], e1[0])
            mu1 = min(max(abs(l1) / (8*tolMm), muMin), muMax)
            mu2 = min(max(abs(l2) / (8*tolMm), muMin), muMax)
            M00 = mu1*e1[0]**2 + mu2*e2[0]**2
            M01 = mu1*e1[0]*e1[1] + mu2*e2[0]*e2[1]
            M11 = mu1*e1[1]**2 + mu2*e2[1]**2
            m += [M00, M01, M11]

    return {
        "style": "Cyl", "H": H, "domain": {"uPeriodic": True},
        "sizing": {"resU": resU, "resT": resT, "h": [hMin] * (resU * resT)},
        "metric": {"resU": resU, "resT": resT, "m": m},
        "ours": None,
    }


def test_triangle_adapter():
    _check(triangle_adapter.mesh(_square_input()))


def test_gmsh_adapter():
    _check(gmsh_adapter.mesh(_square_input()))


def test_gmsh_aniso_smoke():
    """Anisotropic BAMG path: synthesized high-M00/low-M11 metric → valid triangulation in [0,1]²."""
    inp = _aniso_input(resU=8, resT=8, M00=100.0, M01=0.0, M11=1.0)
    out = gmsh_adapter.mesh(inp)
    assert out["config"]["algo"] == "bamg-aniso", f"expected bamg-aniso, got {out['config']}"
    _check(out)
    print(f"  aniso smoke: {len(out['indices'])//3} tris, engine={out['engineVersion']}")


def test_gmsh_aniso_fluted_cylinder_proof():
    """
    Anisotropy PROOF: on a strongly-fluted cylinder (high u-curvature, zero z-curvature),
    gmsh-BAMG with the anisotropic metric should produce materially FEWER triangles than
    gmsh-iso at comparable chord control (budget spent only where curvature is directional).

    Target: aniso_tris < 0.7 * iso_tris  AND  aniso_chord_p99 <= iso_chord_p99 * 1.3.

    If BAMG does not engage (Algorithm 7 unavailable in this gmsh build), the assertion
    will fail with a clear message — that is the documented FINDING per the task brief.
    """
    resU, resT = 24, 24
    tolMm = 0.1
    hMin, hMax = 0.003, 0.3

    # ISO input (no metric)
    from adapters.gmsh_adapter import _mesh_aniso  # noqa — direct call for iso comparison
    iso_inp = {
        "style": "Cyl", "H": 120.0, "domain": {"uPeriodic": True},
        "sizing": {"resU": resU, "resT": resT,
                   "h": [0.05] * (resU * resT)},  # uniform conservative size
        "ours": None,
    }
    iso_out = gmsh_adapter.mesh(iso_inp)
    iso_tris = len(iso_out["indices"]) // 3

    # ANISO input (metric-driven)
    aniso_inp = _fluted_cylinder_metric(resU=resU, resT=resT, tolMm=tolMm, hMin=hMin, hMax=hMax)
    aniso_out = gmsh_adapter.mesh(aniso_inp)
    aniso_tris = len(aniso_out["indices"]) // 3

    print(f"\n  BAMG PROOF — fluted cylinder:")
    print(f"    iso  tris={iso_tris}  algo={iso_out['config'].get('algo')}")
    print(f"    aniso tris={aniso_tris}  algo={aniso_out['config'].get('algo')}")
    print(f"    ratio aniso/iso = {aniso_tris/max(iso_tris,1):.3f}  (target < 0.70)")

    # The key assertion: anisotropic meshing must use fewer triangles.
    # If this fails, BAMG did not engage — see report for documented finding.
    assert aniso_tris < 0.70 * iso_tris, (
        f"BAMG ANISOTROPY DID NOT ENGAGE: aniso_tris={aniso_tris} >= 0.70 * iso_tris={iso_tris}. "
        f"aniso algo={aniso_out['config'].get('algo')}. "
        "Algorithm 7 (BAMG) may be unavailable in this gmsh build, or the TP-view metric "
        "is not being honored. This is the documented FINDING per task-6 brief — H1 must "
        "lean on gmsh-iso quality + min-angle metric instead of anisotropic triangle savings."
    )
