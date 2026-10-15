"""Index a ResPlan dataset file and print a JSON summary of its floor plans.

The official ResPlan release (https://github.com/m-agour/ResPlan) is a ZIP
holding one pickle, ResPlan.pkl: a list of plan dicts. Each plan maps a
category name (bedroom, kitchen, wall, door, ...) to a Shapely geometry, plus
scalar fields such as id, area, net_area and wall_depth.

Pickle can run arbitrary code when loaded, so this script never uses the plain
pickle.load. SafeUnpickler only resolves the handful of globals the official
file references, and maps each one to a harmless stand-in:

    shapely.io.from_wkb           -> Geometry (keeps the WKB bytes)
    numpy.dtype / numpy scalar    -> plain Python float/int
    networkx graph classes        -> GraphStub (Kaggle builds add plan["graph"])
    networkx node/edge/adj views  -> GraphViewStub (cached views pickled with
                                     each graph: NodeView, EdgeView, AdjacencyView)

Any other global makes loading fail with an error. Python's standard library
is enough, so shapely and numpy do not need to be installed.

Usage:
    python3 resplan_index.py <dataset.zip | ResPlan.pkl>

Prints {"source", "planCount", "categories", "plans": [...]} on success, or
{"error": "..."} with exit code 2 on failure.
"""

from __future__ import annotations

import io
import json
import pickle
import struct
import sys
import zipfile
from typing import Any, BinaryIO, Iterable

# A ZIP may claim any uncompressed size; refuse anything far beyond the
# official ~260 MB pickle so a crafted archive can't exhaust memory.
MAX_PICKLE_BYTES = 2 * 1024**3

# Keys that hold walls, openings or site context rather than rooms.
STRUCTURE_KEYS = {"wall", "door", "window", "front_door", "inner", "land", "neighbor", "graph"}
# Scalar fields copied as-is (when present) into the summary.
SCALAR_KEYS = {"id", "area", "net_area", "wall_depth", "unitType", "area_change_sqft"}
# The official file spells "balcony" as "balacony" in some releases.
KEY_ALIASES = {"balacony": "balcony"}


class DatasetError(Exception):
    """A problem with the uploaded file that the user can act on."""


class RefusedGlobal(pickle.UnpicklingError):
    """The pickle asked for a class or function outside the allowlist."""


# ---------------------------------------------------------------------------
# Safe stand-ins for the globals the pickle references
# ---------------------------------------------------------------------------


class Geometry:
    """A Shapely geometry kept as WKB bytes; parsed lazily for counts/bounds."""

    __slots__ = ("wkb",)

    def __init__(self, wkb: bytes, *_ignored: Any) -> None:
        if not isinstance(wkb, (bytes, bytearray)):
            raise pickle.UnpicklingError("Geometry payload is not WKB bytes.")
        self.wkb = bytes(wkb)


class DType:
    """Records numpy.dtype('<f8') etc. so scalar() can decode its bytes."""

    def __init__(self, code: Any = None, *_ignored: Any) -> None:
        self.code = code if isinstance(code, str) else ""
        self.byteorder = "<"

    def __setstate__(self, state: Any) -> None:
        if isinstance(state, tuple) and len(state) > 1 and state[1] in "<>|=":
            self.byteorder = ">" if state[1] == ">" else "<"


_SCALAR_FORMATS = {"f8": "d", "f4": "f", "i8": "q", "i4": "i", "i2": "h", "u8": "Q", "u4": "I", "u2": "H", "b1": "?"}


def numpy_scalar(dtype: Any, data: Any = None) -> Any:
    """numpy._core.multiarray.scalar(dtype, raw_bytes) -> Python number."""
    if not isinstance(dtype, DType) or not isinstance(data, (bytes, bytearray)):
        return None
    fmt = _SCALAR_FORMATS.get(dtype.code)
    if fmt is None or struct.calcsize(fmt) != len(data):
        return None
    return struct.unpack(dtype.byteorder + fmt, data)[0]


class GraphStub:
    """Holds a pickled networkx graph's state without importing networkx."""

    def __init__(self, *_args: Any, **_kwargs: Any) -> None:
        self.state: Any = None

    def __setstate__(self, state: Any) -> None:
        self.state = state

    def node_count(self) -> int | None:
        if isinstance(self.state, dict):
            nodes = self.state.get("_node")
            if isinstance(nodes, dict):
                return len(nodes)
        return None

    def edge_count(self) -> int | None:
        """Undirected edge count from the adjacency dict (each edge appears twice, self-loops once)."""
        if not isinstance(self.state, dict):
            return None
        adj = self.state.get("_adj")
        if not isinstance(adj, dict) or not all(isinstance(v, dict) for v in adj.values()):
            return None
        ends = sum(len(nbrs) for nbrs in adj.values())
        loops = sum(1 for u, nbrs in adj.items() if u in nbrs)
        return (ends + loops) // 2


class GraphViewStub:
    """Stands in for networkx's read-only views (NodeView, EdgeView, AdjacencyView...).

    networkx caches these on the graph, so they are pickled with it. Each is
    rebuilt as NEWOBJ (no arguments) followed by BUILD with a plain dict of
    references back into the graph; this stub just keeps that dict and is never used.
    """

    def __init__(self, *_args: Any, **_kwargs: Any) -> None:
        self.state: Any = None

    def __setstate__(self, state: Any) -> None:
        self.state = state


def _new_object(cls: Any, *args: Any) -> Any:
    # copyreg.__newobj__ / _reconstructor equivalent, limited to our stubs.
    if cls not in (GraphStub, GraphViewStub):
        raise pickle.UnpicklingError("Refusing to construct an unexpected type.")
    return cls(*args)


ALLOWED_GLOBALS: dict[tuple[str, str], Any] = {
    ("shapely.io", "from_wkb"): Geometry,
    ("shapely.wkb", "loads"): Geometry,
    ("shapely.wkb", "_loads"): Geometry,
    ("numpy", "dtype"): DType,
    ("numpy._core.multiarray", "scalar"): numpy_scalar,
    ("numpy.core.multiarray", "scalar"): numpy_scalar,
    ("copyreg", "__newobj__"): _new_object,
}
for _graph in ("Graph", "DiGraph", "MultiGraph", "MultiDiGraph"):
    _module = {"Graph": "graph", "DiGraph": "digraph", "MultiGraph": "multigraph", "MultiDiGraph": "multidigraph"}[_graph]
    ALLOWED_GLOBALS[(f"networkx.classes.{_module}", _graph)] = GraphStub
# The Kaggle file references NodeView, EdgeView and AdjacencyView; the other
# view types are allowed too since networkx caches whichever ones were accessed.
_VIEWS = {
    "networkx.classes.reportviews": (
        "NodeView", "NodeDataView", "EdgeView", "EdgeDataView", "OutEdgeView", "OutEdgeDataView",
        "InEdgeView", "InEdgeDataView", "MultiEdgeView", "MultiEdgeDataView", "OutMultiEdgeView",
        "OutMultiEdgeDataView", "InMultiEdgeView", "InMultiEdgeDataView", "DegreeView", "DiDegreeView",
        "InDegreeView", "OutDegreeView", "MultiDegreeView", "DiMultiDegreeView", "InMultiDegreeView",
        "OutMultiDegreeView",
    ),
    "networkx.classes.coreviews": (
        "AtlasView", "AdjacencyView", "MultiAdjacencyView", "UnionAtlas", "UnionAdjacency",
        "UnionMultiInner", "UnionMultiAdjacency",
    ),
}
for _module, _names in _VIEWS.items():
    for _name in _names:
        ALLOWED_GLOBALS[(_module, _name)] = GraphViewStub


class SafeUnpickler(pickle.Unpickler):
    def find_class(self, module: str, name: str) -> Any:
        try:
            return ALLOWED_GLOBALS[(module, name)]
        except KeyError:
            raise RefusedGlobal(
                f"Unexpected object type {module}.{name}: this does not look like the official ResPlan file."
            ) from None


# ---------------------------------------------------------------------------
# WKB reading (only what the summary needs: polygon count and bounds)
# ---------------------------------------------------------------------------


def _wkb_walk(data: bytes, offset: int, polygons: list[int], bounds: list[float]) -> int:
    """Walk one WKB geometry, counting polygons and growing bounds. Returns the next offset."""
    order = "<" if data[offset] == 1 else ">"
    (gtype,) = struct.unpack_from(order + "I", data, offset + 1)
    offset += 5
    if gtype & 0x20000000:  # EWKB SRID flag
        offset += 4
    has_z = bool(gtype & 0x80000000) or 1000 <= (gtype & 0xFFFF) < 3000
    base = gtype & 0xFFFF
    base = base % 1000 if base >= 1000 else base
    dims = 3 if has_z else 2
    point = struct.Struct(order + "d" * dims)

    def read_points(count: int, off: int) -> int:
        for _ in range(count):
            x, y = point.unpack_from(data, off)[:2]
            if x == x and y == y:  # skip NaN (empty points)
                bounds[0] = min(bounds[0], x)
                bounds[1] = min(bounds[1], y)
                bounds[2] = max(bounds[2], x)
                bounds[3] = max(bounds[3], y)
            off += point.size
        return off

    if base == 1:  # Point
        return read_points(1, offset)
    if base == 2:  # LineString
        (n,) = struct.unpack_from(order + "I", data, offset)
        return read_points(n, offset + 4)
    if base == 3:  # Polygon
        (rings,) = struct.unpack_from(order + "I", data, offset)
        offset += 4
        if rings:
            polygons[0] += 1
        for _ in range(rings):
            (n,) = struct.unpack_from(order + "I", data, offset)
            offset = read_points(n, offset + 4)
        return offset
    if base in (4, 5, 6, 7):  # Multi* / GeometryCollection
        (parts,) = struct.unpack_from(order + "I", data, offset)
        offset += 4
        for _ in range(parts):
            offset = _wkb_walk(data, offset, polygons, bounds)
        return offset
    raise DatasetError(f"Unsupported WKB geometry type {gtype}.")


def geometry_stats(geom: Geometry) -> tuple[int, list[float] | None]:
    """(number of polygons, [minx, miny, maxx, maxy] or None if empty)."""
    polygons = [0]
    bounds = [float("inf"), float("inf"), float("-inf"), float("-inf")]
    try:
        _wkb_walk(geom.wkb, 0, polygons, bounds)
    except (struct.error, IndexError) as exc:
        raise DatasetError(f"Malformed geometry in dataset: {exc}") from None
    return polygons[0], (bounds if bounds[0] <= bounds[2] else None)


# ---------------------------------------------------------------------------
# Loading and summarising
# ---------------------------------------------------------------------------


def _number(value: Any) -> float | int | None:
    if isinstance(value, tuple) and value:  # a few plans store (value, ...) tuples
        value = value[0]
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if value != value:  # NaN
        return None
    return round(value, 3) if isinstance(value, float) else value


def summarise_plan(index: int, plan: dict[str, Any], split_of: dict[int, str]) -> dict[str, Any]:
    rooms: dict[str, int] = {}
    bounds: list[float] | None = None
    for raw_key, value in plan.items():
        key = KEY_ALIASES.get(raw_key, raw_key)
        if key in SCALAR_KEYS:
            continue
        if not isinstance(value, Geometry):
            continue
        count, b = geometry_stats(value)
        if key in ("inner", "wall") and b is not None:
            bounds = b if bounds is None else [min(bounds[0], b[0]), min(bounds[1], b[1]), max(bounds[2], b[2]), max(bounds[3], b[3])]
        if key not in STRUCTURE_KEYS and count:
            rooms[key] = rooms.get(key, 0) + count

    summary: dict[str, Any] = {
        "index": index,
        "id": _number(plan.get("id")),
        "rooms": rooms,
        "roomCount": sum(rooms.values()),
    }
    for key, out in (("area", "area"), ("net_area", "netArea"), ("wall_depth", "wallDepth")):
        n = _number(plan.get(key))
        if n is not None and n > 0:  # 0 marks "not recorded" in the official file
            summary[out] = n
    # net_area is unreliable in the source: ~1,400 plans record a net area
    # larger than the gross area (some in the billions), so drop those.
    if "netArea" in summary and summary["netArea"] > summary.get("area", float("inf")):
        del summary["netArea"]
    if isinstance(plan.get("unitType"), str):
        summary["unitType"] = plan["unitType"]
    # Coordinates are in the dataset's drawing units, not metres (a typical
    # plan spans ~260 units while its recorded area is ~110 m²).
    if bounds is not None:
        summary["width"] = round(bounds[2] - bounds[0], 2)
        summary["height"] = round(bounds[3] - bounds[1], 2)
    graph = plan.get("graph")
    if isinstance(graph, GraphStub):
        if graph.node_count() is not None:
            summary["graphNodes"] = graph.node_count()
        if graph.edge_count() is not None:
            summary["graphEdges"] = graph.edge_count()
    if isinstance(summary["id"], int) and summary["id"] in split_of:
        summary["split"] = split_of[summary["id"]]
    return summary


def _load_plans(stream: BinaryIO) -> list[Any]:
    try:
        data = SafeUnpickler(stream).load()
    except RefusedGlobal as exc:
        raise DatasetError(str(exc)) from None
    except (pickle.UnpicklingError, EOFError, ValueError, struct.error, TypeError, AttributeError, IndexError, KeyError) as exc:
        raise DatasetError(f"The pickle could not be read ({type(exc).__name__}). Is the file complete?") from None
    if not isinstance(data, list) or not all(isinstance(p, dict) for p in data):
        raise DatasetError("Expected the pickle to hold a list of plan dictionaries, as ResPlan.pkl does.")
    if not data:
        raise DatasetError("The dataset contains no floor plans.")
    return data


def _read_split(raw: bytes) -> dict[int, str]:
    try:
        splits = json.loads(raw)
    except ValueError:
        return {}
    split_of: dict[int, str] = {}
    if isinstance(splits, dict):
        for name, ids in splits.items():
            if isinstance(ids, list):
                for plan_id in ids:
                    if isinstance(plan_id, int):
                        split_of.setdefault(plan_id, name)
    return split_of


def _is_pickle_name(name: str) -> bool:
    lower = name.lower()
    return lower.endswith((".pkl", ".pickle")) and not lower.startswith("__macosx/")


def load_dataset(path: str) -> tuple[str, list[Any], dict[int, str]]:
    """Returns (pickle name, list of plan dicts, plan id -> split name)."""
    with open(path, "rb") as fh:
        magic = fh.read(4)

    if magic.startswith(b"PK"):
        try:
            archive = zipfile.ZipFile(path)
        except zipfile.BadZipFile:
            raise DatasetError("The ZIP archive is damaged or incomplete.") from None
        with archive:
            entries = [i for i in archive.infolist() if _is_pickle_name(i.filename)]
            if not entries:
                raise DatasetError("No .pkl file found inside the ZIP. The official archive contains ResPlan.pkl.")
            entry = max(entries, key=lambda i: i.file_size)
            if entry.file_size > MAX_PICKLE_BYTES:
                raise DatasetError("The pickle inside the ZIP is larger than 2 GB, which is far beyond the official dataset.")
            split_of: dict[int, str] = {}
            for info in archive.infolist():
                if info.filename.lower().endswith("split.json") and info.file_size < 10 * 1024**2:
                    split_of = _read_split(archive.read(info))
            with archive.open(entry) as stream:
                plans = _load_plans(io.BufferedReader(stream))
            return entry.filename, plans, split_of

    if magic[:1] == b"\x80":  # pickle protocol 2+ header
        with open(path, "rb") as fh:
            return path, _load_plans(fh), {}

    raise DatasetError("Unrecognised file. Upload the ResPlan ZIP archive or the ResPlan.pkl file inside it.")


def build_index(path: str, source_name: str | None = None) -> dict[str, Any]:
    pickle_name, plans, split_of = load_dataset(path)
    summaries = [summarise_plan(i, p, split_of) for i, p in enumerate(plans)]
    categories: dict[str, int] = {}
    for s in summaries:
        for name, count in s["rooms"].items():
            categories[name] = categories.get(name, 0) + count
    return {
        "source": source_name or pickle_name,
        "planCount": len(summaries),
        "categories": dict(sorted(categories.items(), key=lambda kv: -kv[1])),
        "plans": summaries,
    }


def main(argv: Iterable[str]) -> int:
    args = list(argv)
    if len(args) not in (1, 2):
        print(json.dumps({"error": "usage: resplan_index.py <file> [display name]"}))
        return 2
    try:
        result = build_index(args[0], args[1] if len(args) == 2 else None)
    except DatasetError as exc:
        print(json.dumps({"error": str(exc)}))
        return 2
    except OSError as exc:
        print(json.dumps({"error": f"Could not read the uploaded file: {exc.strerror or exc}"}))
        return 2
    json.dump(result, sys.stdout, separators=(",", ":"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
