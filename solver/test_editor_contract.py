"""Small end-to-end checks for generated ResPlan nodes and editor solutions."""

import unittest

from shapely.geometry import LineString, Polygon

from cable_api import resolve_json


def rectangle(x0, y0, x1, y1):
    return {"outer": [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], "holes": []}


def synthetic_plan(kinds):
    rooms = []
    outline = []
    for i, kind in enumerate(kinds):
        x0 = i * 5.0
        shape = rectangle(x0, 0.0, x0 + 4.0, 4.0)
        rooms.append({"kind": kind, "label": f"{kind.title()} {i + 1}", "shape": shape})
        outline.append(shape)
    return {
        "plan_id": 731,
        "units": "m",
        "units_per_metre": 20.0,
        "wall_depth_m": 0.1,
        "outline": outline,
        "rooms": rooms,
        "walls": [],
        "doors": [],
        "front_doors": [],
        "windows": [],
        "nodes": [],
        "hubs": [],
        "source": {"kind": "drawn"},
    }


class EditorDeviceContractTest(unittest.TestCase):
    def test_one_inside_node_per_eligible_room_and_valid_closed_panel_loop(self):
        result = resolve_json(synthetic_plan(["living", "bedroom", "kitchen", "storage", "bathroom", "balcony"]))

        self.assertEqual(result["status"], "solved", result.get("reason"))
        eligible_rooms = [r for r in result["rooms"] if r["kind"] in {"living", "bedroom", "kitchen", "storage"}]
        self.assertEqual(len(result["nodes"]), len(eligible_rooms))
        self.assertEqual(len(result["nodes"]), 4)
        self.assertEqual({r["kind"] for r in eligible_rooms}, {"living", "bedroom", "kitchen", "storage"})

        node_by_room = {node["room_id"]: node for node in result["nodes"]}
        assigned = [room_id for hub in result["hubs"] for room_id in hub["assigned_rooms"]]
        self.assertCountEqual(assigned, node_by_room)
        for node in result["nodes"]:
            room = next(r for r in eligible_rooms if r["room_id"] == node["room_id"])
            self.assertTrue(room["shape"]["outer"])
            x0, y0 = min(x for x, _ in room["shape"]["outer"]), min(y for _, y in room["shape"]["outer"])
            x1, y1 = max(x for x, _ in room["shape"]["outer"]), max(y for _, y in room["shape"]["outer"])
            self.assertTrue(x0 < node["x"] < x1 and y0 < node["y"] < y1)

        for hub in result["submission"]["hubs"]:
            self.assertLessEqual(len(hub["assigned_nodes"]), 5)
            self.assertLessEqual(sum(r["area_m2"] for r in result["rooms"] if r["room_id"] in hub["assigned_rooms"]), 100)
            self.assertEqual(hub["closed_sequence"][0], hub["hub_id"])
            self.assertEqual(hub["closed_sequence"][-1], hub["hub_id"])
            self.assertCountEqual(hub["closed_sequence"][1:-1], hub["assigned_nodes"])
            self.assertEqual(len(hub["closed_sequence"][1:-1]), len(set(hub["closed_sequence"][1:-1])))
            self.assertEqual(hub["route_segments"][0]["from"], hub["hub_id"])
            self.assertEqual(hub["route_segments"][-1]["to"], hub["hub_id"])
            for segment in hub["route_segments"]:
                for (x0, y0), (x1, y1) in zip(segment["polyline"], segment["polyline"][1:]):
                    self.assertTrue(abs(x0 - x1) < 1e-6 or abs(y0 - y1) < 1e-6)

        self.assertTrue(all(check["passed"] for check in result["checks"]))
        metrics = result["metrics"]
        self.assertAlmostEqual(metrics["J"], metrics["L"] + 5 * metrics["X"] + metrics["O"] + 0.5 * metrics["B"], places=5)
        self.assertEqual(len(result["nodes"]), len(result["submission"]["nodes"]))

    def test_connected_rooms_route_through_a_door_without_crossing_the_wall(self):
        shared_wall = rectangle(3.95, 0.0, 4.05, 4.0)
        door = rectangle(3.94, 1.5, 4.06, 2.5)
        result = resolve_json({
            "plan_id": 732,
            "units": "m",
            "units_per_metre": 20.0,
            "wall_depth_m": 0.1,
            "outline": [rectangle(0.0, 0.0, 8.0, 4.0)],
            "rooms": [
                {"kind": "living", "label": "Living", "shape": rectangle(0.0, 0.0, 4.0, 4.0)},
                {"kind": "kitchen", "label": "Kitchen", "shape": rectangle(4.0, 0.0, 8.0, 4.0)},
            ],
            "walls": [shared_wall],
            "doors": [door],
            "front_doors": [],
            "windows": [],
            "nodes": [],
            "hubs": [],
            "source": {"kind": "drawn"},
        })

        self.assertEqual(result["status"], "solved", result.get("reason"))
        self.assertEqual(len(result["nodes"]), 2)
        self.assertEqual(len(result["hubs"]), 1)
        hub = result["submission"]["hubs"][0]
        self.assertEqual(len(hub["assigned_rooms"]), 2)
        self.assertTrue(all(check["passed"] for check in result["checks"]))

        route_lines = [LineString(segment["polyline"]) for segment in hub["route_segments"]]
        self.assertTrue(any(line.intersects(Polygon(door["outer"])) for line in route_lines))
        wall = Polygon(shared_wall["outer"]).difference(Polygon(door["outer"]))
        self.assertTrue(all(line.intersection(wall).length < 0.001 for line in route_lines))

    def test_no_eligible_rooms_returns_no_fabricated_nodes(self):
        result = resolve_json(synthetic_plan(["bathroom", "balcony"]))
        self.assertNotEqual(result["status"], "solved")
        self.assertEqual(result["nodes"], [])
        self.assertEqual(result["hubs"], [])


if __name__ == "__main__":
    unittest.main()
