"""Tests for resplan_index.py.  Run:  python3 -m unittest discover -s scripts/resplan/tests"""

from __future__ import annotations

import io
import json
import os
import pickle
import subprocess
import sys
import tempfile
import unittest
import zipfile
from contextlib import redirect_stdout
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent))

import resplan_index  # noqa: E402

FIXTURE = HERE / "fixtures" / "resplan_sample.pkl"
SCRIPT = HERE.parent / "resplan_index.py"


class Evil:
    """Pickles as os.system(...): loading it with plain pickle would run a command."""

    def __init__(self, marker: str):
        self.marker = marker

    def __reduce__(self):
        return (os.system, (f"touch {self.marker}",))


class IndexerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, name: str, data: bytes) -> str:
        path = self.dir / name
        path.write_bytes(data)
        return str(path)

    def zip_with(self, members: dict[str, bytes], name: str = "ResPlan.zip") -> str:
        path = self.dir / name
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
            for member, data in members.items():
                z.writestr(member, data)
        return str(path)

    # --- happy paths -------------------------------------------------------

    def test_lists_every_plan_from_bare_pickle(self):
        index = resplan_index.build_index(str(FIXTURE), "ResPlan.pkl")
        self.assertEqual(index["source"], "ResPlan.pkl")
        self.assertEqual(index["planCount"], 4)
        self.assertEqual([p["index"] for p in index["plans"]], [0, 1, 2, 3])
        self.assertEqual([p["id"] for p in index["plans"]], [14433, 5410, 17054, 9791])

    def test_extracts_room_counts_and_metadata(self):
        first, second, third, fourth = resplan_index.build_index(str(FIXTURE))["plans"]
        self.assertEqual(first["rooms"], {"balcony": 2, "bathroom": 3, "bedroom": 3, "kitchen": 1, "living": 1})
        self.assertEqual(first["roomCount"], 10)
        self.assertAlmostEqual(first["area"], 120.774)
        self.assertAlmostEqual(first["netArea"], 95.66)  # numpy float64 scalar decoded
        self.assertAlmostEqual(first["wallDepth"], 4.503)
        self.assertEqual((first["width"], first["height"]), (244.0, 204.0))
        # Walls, doors, windows and site context are not rooms.
        for key in ("wall", "door", "window", "front_door", "inner", "land", "garden"):
            self.assertNotIn(key, first["rooms"])

        self.assertNotIn("netArea", second)  # stored as 0 = not recorded
        self.assertEqual(second["rooms"]["stair"], 1)
        self.assertAlmostEqual(third["area"], 88.5)  # tuple-valued area
        self.assertEqual(third["rooms"]["balcony"], 1)  # "balacony" typo normalised
        self.assertEqual(fourth["rooms"], {"bathroom": 1})

    def test_reads_kaggle_graph_with_cached_networkx_views(self):
        # Plan 0 carries plan["graph"] pickled with NodeView/EdgeView/AdjacencyView,
        # exactly as the Kaggle ResPlan.pkl does.
        first, second = resplan_index.build_index(str(FIXTURE))["plans"][:2]
        self.assertEqual(first["graphNodes"], 3)
        self.assertEqual(first["graphEdges"], 2)
        self.assertNotIn("graph", first["rooms"])
        self.assertNotIn("graphNodes", second)  # GitHub-style plans have no graph

    def test_still_refuses_other_networkx_globals(self):
        # Allowing the inert view classes must not open the door to the rest of networkx.
        for module, name in [
            ("networkx.readwrite.gml", "read_gml"),
            ("networkx.classes.reportviews", "nx"),
            ("networkx", "Graph"),
            ("builtins", "eval"),
        ]:
            data = (
                b"\x80\x04\x8c" + bytes([len(module)]) + module.encode()
                + b"\x8c" + bytes([len(name)]) + name.encode() + b"\x93."
            )
            with self.subTest(global_=f"{module}.{name}"):
                self.assert_rejected(self.write("g.pkl", data), "unexpected object type")

    def test_view_stub_cannot_construct_other_types(self):
        with self.assertRaises(pickle.UnpicklingError):
            resplan_index._new_object(dict)

    def test_drops_implausible_net_area(self):
        plan = {"id": 1, "area": 100.0, "net_area": 79140857694.652, "inner": resplan_index.Geometry(b"\x01\x06\x00\x00\x00\x00\x00\x00\x00")}
        summary = resplan_index.summarise_plan(0, plan, {})
        self.assertNotIn("netArea", summary)
        self.assertEqual(summary["area"], 100.0)

    def test_dataset_category_totals(self):
        index = resplan_index.build_index(str(FIXTURE))
        self.assertEqual(index["categories"]["bedroom"], 6)
        self.assertEqual(index["categories"]["bathroom"], 7)
        self.assertEqual(list(index["categories"])[0], "bathroom")  # most common first

    def test_reads_pickle_inside_zip_and_split_json(self):
        splits = {"train": [14433, 5410], "val": [17054], "test": [], "augmented": [9791]}
        path = self.zip_with({
            "ResPlan.pkl": FIXTURE.read_bytes(),
            "split.json": json.dumps(splits).encode(),
            "__MACOSX/._ResPlan.pkl": b"junk",
        })
        index = resplan_index.build_index(path, "ResPlan.zip")
        self.assertEqual(index["planCount"], 4)
        self.assertEqual([p.get("split") for p in index["plans"]], ["train", "train", "val", "augmented"])

    def test_cli_prints_json(self):
        out = subprocess.run([sys.executable, "-I", str(SCRIPT), str(FIXTURE), "x.pkl"], capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        self.assertEqual(json.loads(out.stdout)["planCount"], 4)

    # --- rejection paths ---------------------------------------------------

    def assert_rejected(self, path: str, fragment: str):
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = resplan_index.main([path])
        self.assertEqual(code, 2)
        message = json.loads(buf.getvalue())["error"]
        self.assertIn(fragment.lower(), message.lower())

    def test_refuses_pickle_with_unexpected_globals_without_running_it(self):
        marker = self.dir / "pwned"
        path = self.write("evil.pkl", pickle.dumps([Evil(str(marker))]))
        self.assert_rejected(path, "unexpected object type")
        self.assertFalse(marker.exists(), "malicious pickle was executed")

    def test_refuses_evil_pickle_inside_zip(self):
        marker = self.dir / "pwned"
        path = self.zip_with({"ResPlan.pkl": pickle.dumps([Evil(str(marker))])})
        self.assert_rejected(path, "unexpected object type")
        self.assertFalse(marker.exists())

    def test_rejects_non_dataset_files(self):
        self.assert_rejected(self.write("notes.zip", b"hello world"), "unrecognised file")
        self.assert_rejected(self.write("ResPlan.pkl", b"\x80\x04" + b"\x00" * 20), "could not be read")

    def test_rejects_zip_without_pickle(self):
        self.assert_rejected(self.zip_with({"readme.txt": b"hi"}), "no .pkl file")

    def test_rejects_damaged_zip(self):
        data = Path(self.zip_with({"ResPlan.pkl": FIXTURE.read_bytes()})).read_bytes()
        self.assert_rejected(self.write("cut.zip", data[: len(data) // 2]), "zip")

    def test_rejects_truncated_pickle(self):
        data = FIXTURE.read_bytes()
        self.assert_rejected(self.write("cut.pkl", data[: len(data) // 2]), "could not be read")

    def test_rejects_wrong_top_level_shape(self):
        self.assert_rejected(self.write("dict.pkl", pickle.dumps({"a": 1})), "list of plan dictionaries")
        self.assert_rejected(self.write("empty.pkl", pickle.dumps([])), "no floor plans")

    def test_missing_file(self):
        self.assert_rejected(str(self.dir / "nope.pkl"), "could not read")


if __name__ == "__main__":
    unittest.main()
