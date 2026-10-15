"""Builds tests/fixtures/resplan_sample.pkl: a 4-plan stand-in for ResPlan.pkl.

It reproduces the official file's pickle structure exactly (geometries pickled
as shapely.io.from_wkb(<wkb bytes>), some values as numpy float64 scalars, and,
as in the Kaggle build, a networkx Graph in plan["graph"] pickled together with
its cached NodeView / EdgeView / AdjacencyView) without needing shapely, numpy
or networkx installed: tiny fake modules with those names are registered just
while pickling.

    python3 scripts/resplan/tests/make_fixture.py
"""

from __future__ import annotations

import pickle
import struct
import sys
import types
from pathlib import Path

FIXTURE = Path(__file__).parent / "fixtures" / "resplan_sample.pkl"


# --- fake shapely / numpy so pickle writes the same globals as the real file ---

FAKE_MODULES = (
    "shapely", "shapely.io", "numpy", "numpy._core", "numpy._core.multiarray",
    "networkx", "networkx.classes", "networkx.classes.graph",
    "networkx.classes.reportviews", "networkx.classes.coreviews",
)


def _fake_class(module: types.ModuleType, name: str) -> type:
    cls = type(name, (), {})
    cls.__module__ = module.__name__
    cls.__qualname__ = name
    setattr(module, name, cls)
    return cls


def _install_fakes() -> tuple[type, type, type]:
    def from_wkb(wkb):  # pragma: no cover - never called, only referenced
        raise NotImplementedError

    shapely = types.ModuleType("shapely")
    shapely_io = types.ModuleType("shapely.io")
    from_wkb.__module__ = "shapely.io"
    from_wkb.__qualname__ = "from_wkb"
    shapely_io.from_wkb = from_wkb
    shapely.io = shapely_io

    def scalar(dtype, data):  # pragma: no cover
        raise NotImplementedError

    numpy = types.ModuleType("numpy")
    core = types.ModuleType("numpy._core")
    multiarray = types.ModuleType("numpy._core.multiarray")
    scalar.__module__ = "numpy._core.multiarray"
    scalar.__qualname__ = "scalar"
    multiarray.scalar = scalar

    class dtype:  # noqa: N801 - mirrors numpy.dtype
        def __init__(self, code):
            self.code = code

        def __reduce__(self):
            return (dtype, (self.code, False, True), (3, "<", None, None, None, -1, -1, 0))

    dtype.__module__ = "numpy"
    dtype.__qualname__ = "dtype"
    numpy.dtype = dtype
    numpy._core = core
    core.multiarray = multiarray

    nx_modules = {name: types.ModuleType(name) for name in FAKE_MODULES if name.startswith("networkx")}
    nx_graph = _fake_class(nx_modules["networkx.classes.graph"], "Graph")
    node_view = _fake_class(nx_modules["networkx.classes.reportviews"], "NodeView")
    edge_view = _fake_class(nx_modules["networkx.classes.reportviews"], "EdgeView")
    adjacency_view = _fake_class(nx_modules["networkx.classes.coreviews"], "AdjacencyView")

    sys.modules.update({
        "shapely": shapely, "shapely.io": shapely_io,
        "numpy": numpy, "numpy._core": core, "numpy._core.multiarray": multiarray,
        **nx_modules,
    })

    def make_graph(nodes: dict[str, dict], edges: list[tuple[str, str, str]]):
        """A Graph whose __dict__ matches networkx 3.x after .nodes/.edges/.adj were accessed.

        Default pickling then writes NEWOBJ + BUILD(state) for the graph and each view,
        the same opcodes found in the Kaggle ResPlan.pkl.
        """
        adj: dict[str, dict] = {n: {} for n in nodes}
        for u, v, kind in edges:
            adj[u][v] = adj[v][u] = {"type": kind}
        g = nx_graph()
        nv, ev, av = node_view(), edge_view(), adjacency_view()
        nv.__dict__.update(_nodes=nodes)
        ev.__dict__.update(_graph=g, _adjdict=adj)
        av.__dict__.update(_atlas=adj)
        g.__dict__.update(graph={}, _node=nodes, _adj=adj, __networkx_cache__={}, nodes=nv, edges=ev, adj=av)
        return g

    class Geom:
        def __init__(self, wkb: bytes):
            self.wkb = wkb

        def __reduce__(self):
            return (from_wkb, (self.wkb,))

    class Float64:
        def __init__(self, value: float):
            self.value = value

        def __reduce__(self):
            return (scalar, (dtype("f8"), struct.pack("<d", self.value)))

    return Geom, Float64, make_graph


# --- WKB writers ---

def rect(x0: float, y0: float, x1: float, y1: float) -> bytes:
    ring = [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]
    return struct.pack("<BII I", 1, 3, 1, len(ring)) + b"".join(struct.pack("<dd", *p) for p in ring)


def multi(*polygons: bytes) -> bytes:
    return struct.pack("<BII", 1, 6, len(polygons)) + b"".join(polygons)


def line(*points: tuple[float, float]) -> bytes:
    return struct.pack("<BII", 1, 2, len(points)) + b"".join(struct.pack("<dd", *p) for p in points)


EMPTY_MULTI = struct.pack("<BII", 1, 6, 0)


def build_plans(Geom, Float64, make_graph) -> list[dict]:
    def g(wkb: bytes):
        return Geom(wkb)

    base = {
        "garden": g(EMPTY_MULTI), "parking": g(EMPTY_MULTI), "pool": g(EMPTY_MULTI),
        "land": g(EMPTY_MULTI), "neighbor": (g(EMPTY_MULTI), g(EMPTY_MULTI)),
    }
    return [
        {  # 3-bedroom flat, like the real first plan
            **base, "id": 14433,
            "balcony": g(multi(rect(0, 0, 20, 10), rect(200, 0, 220, 10))),
            "bathroom": g(multi(rect(10, 10, 40, 40), rect(40, 10, 70, 40), rect(70, 10, 100, 40))),
            "bedroom": g(multi(rect(0, 40, 80, 120), rect(80, 40, 160, 120), rect(160, 40, 240, 120))),
            "kitchen": g(rect(100, 10, 160, 40)),
            "living": g(rect(0, 120, 240, 200)),
            "door": g(multi(rect(50, 38, 60, 42))),
            "window": g(multi(rect(0, 60, 2, 80))),
            "front_door": g(rect(100, 198, 120, 202)),
            "inner": g(multi(rect(0, 0, 240, 200))),
            "wall": g(multi(rect(-2, -2, 242, 2), rect(-2, 198, 242, 202))),
            "area": 120.7739, "net_area": Float64(95.66), "wall_depth": 4.50299826766757,
            # Kaggle builds add the room-connectivity graph.
            "graph": make_graph(
                {
                    "living_0": {"geometry": g(rect(0, 120, 240, 200)), "type": "living", "area": 19200.0},
                    "kitchen_0": {"geometry": g(rect(100, 10, 160, 40)), "type": "kitchen", "area": 1800.0},
                    "bedroom_0": {"geometry": g(rect(0, 40, 80, 120)), "type": "bedroom", "area": 6400.0},
                },
                [("living_0", "kitchen_0", "via_door"), ("living_0", "bedroom_0", "adjacency")],
            ),
        },
        {  # 1-bedroom, net_area stored as int 0 ("not recorded"), with stairs
            **base, "id": 5410,
            "bathroom": g(rect(0, 0, 30, 30)),
            "bedroom": g(rect(30, 0, 100, 60)),
            "kitchen": g(rect(0, 30, 30, 60)),
            "living": g(rect(0, 60, 100, 120)),
            "stair": g(rect(100, 0, 120, 40)),
            "door": g(EMPTY_MULTI), "window": None,
            "inner": g(rect(0, 0, 120, 120)), "wall": g(line((0, 0), (120, 0))),
            "area": 54.2, "net_area": 0, "wall_depth": 3.9,
        },
        {  # 2-bedroom whose area is a tuple (as in 336 real plans), "balacony" typo
            **base, "id": 17054,
            "balacony": g(rect(0, 0, 10, 10)),
            "bathroom": g(multi(rect(0, 10, 20, 30), rect(20, 10, 40, 30))),
            "bedroom": g(multi(rect(0, 30, 50, 80), rect(50, 30, 100, 80))),
            "kitchen": g(rect(40, 10, 70, 30)),
            "living": g(rect(0, 80, 100, 140)),
            "door": g(EMPTY_MULTI), "window": g(EMPTY_MULTI),
            "inner": g(rect(0, 0, 100, 140)), "wall": g(rect(-1, -1, 101, 141)),
            "area": (88.5, "sqm"), "net_area": Float64(70.25), "wall_depth": 4.1,
            "storage": g(rect(70, 10, 80, 20)),
        },
        {  # sparse plan: no bedroom/kitchen keys at all, living is None
            **base, "id": 9791, "living": None,
            "bathroom": g(rect(0, 0, 10, 10)),
            "door": g(EMPTY_MULTI), "inner": g(rect(0, 0, 50, 50)), "wall": g(rect(0, 0, 50, 50)),
            "area": 25.0, "net_area": Float64(20.0), "wall_depth": 2.0,
        },
    ]


def write_fixture(path: Path = FIXTURE) -> Path:
    Geom, Float64, make_graph = _install_fakes()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as fh:
            pickle.dump(build_plans(Geom, Float64, make_graph), fh, protocol=4)
    finally:
        for name in FAKE_MODULES:
            sys.modules.pop(name, None)
    return path


if __name__ == "__main__":
    print(write_fixture())
