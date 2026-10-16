"""Checks on real plans (skipped when the dataset isn't present).

Usage:  .venv/bin/python -m unittest test_solver
"""

import unittest

from step1 import DATA

HAVE_DATA = (DATA / "ResPlan.pkl").exists()


@unittest.skipUnless(HAVE_DATA, "dataset not present")
class SolverTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from cable_api import solve_to_editor
        from step1 import load_plans

        plans = {int(p["id"]): p for p in load_plans(DATA / "ResPlan.pkl", DATA / "split.json")}
        cls.plans = plans
        cls.out = {pid: solve_to_editor(plans[pid], baselines=False) for pid in (2814, 12070)}

    def test_nodes_sit_on_cell_centres(self):
        from io_format import make_input
        from routing import CELL

        plan = self.plans[2814]
        inp = make_input(plan)
        s = inp["units_per_metre"]
        x0, y0 = plan["inner"].bounds[0] - CELL, plan["inner"].bounds[1] - CELL
        for n in inp["nodes"]:
            for v, o in ((n["x"] * s, x0), (n["y"] * s, y0)):
                self.assertAlmostEqual(((v - o) / CELL) % 1, 0.5, places=4)

    def test_valid_and_explained(self):
        for pid, out in self.out.items():
            self.assertEqual(out["status"], "solved", pid)
            self.assertTrue(all(c["passed"] for c in out["checks"]), pid)
            ex = out["explain"]
            self.assertEqual(set(ex["hubs"]), {h["hub_id"] for h in out["hubs"]})
            self.assertEqual(ex["hub_count"]["H"], len(out["hubs"]))

    def test_lower_bound_is_below_j(self):
        for pid, out in self.out.items():
            self.assertLessEqual(out["explain"]["lower_bound"]["J"], out["metrics"]["J"] + 1e-6, pid)

    def test_hub_count_reason(self):
        # 12070: five rooms open only onto an 87 m² living room, so 6 hubs.
        ex = self.out[12070]["explain"]
        self.assertEqual(ex["hub_count"]["by_area"], 3)
        self.assertEqual(len(ex["hub_count"]["alone"]), 6)
        self.assertIn("connect only to Living", ex["summary"][0])

    def test_hub_move_keeps_zones_and_says_so(self):
        from cable_api import resolve_json

        out = self.out[2814]
        h1 = next(h for h in out["hubs"] if h["hub_id"] == "H1")
        moved = resolve_json(out, {"hub_id": "H1", "x": h1["x"] + 1.0, "y": h1["y"]})
        self.assertEqual(moved["status"], "solved")
        self.assertEqual([h["assigned_rooms"] for h in moved["hubs"]], [h["assigned_rooms"] for h in out["hubs"]])
        self.assertIn("you set", moved["explain"]["summary"][0])


if __name__ == "__main__":
    unittest.main()
