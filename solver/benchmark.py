"""Our solver against the baselines on a sample of the test split.

Every 16th test plan (about 100, the same ones each run). Each is solved by
ours, by greedy and by Clarke–Wright (baselines.py), and with our zones and
orders but each leg routed alone ("naive"), all judged by the same checker
and the deck's ranking: fewer hubs first, then lower J, then the smaller
assigned-area gap.

Usage:  .venv/bin/python benchmark.py [every] [jobs]   (default every 16th, 1 process)
Output: out/benchmark.txt (the table) and out/benchmark.json (per plan)
"""

import json
import sys
import time
from collections import Counter
from concurrent.futures import ProcessPoolExecutor

from cable_api import solve_to_editor
from step1 import DATA, OUT, load_plans

METHODS = {"ours": "Ours", "naive": "Naive routing", "greedy": "Greedy", "savings": "Clarke–Wright"}
TOL = 1e-6


def rank_key(m):
    """The deck's ranking as a sort key (smaller is better)."""
    return (m["H"], round(m["J"], 4), round(m.get("area_gap_m2", 0.0), 4))


def compare(a, b):
    """-1 if a ranks better than b, 0 if tied, 1 if worse. None = didn't solve validly."""
    if a is None and b is None:
        return 0
    if a is None:
        return 1
    if b is None:
        return -1
    ka, kb = rank_key(a), rank_key(b)
    return (ka > kb) - (ka < kb)


def measure(plan):
    """One plan's metrics per method (None where it didn't solve validly)."""
    t = time.perf_counter()
    out = solve_to_editor(plan)
    res = {"plan_id": int(plan["id"]), "extended": bool(out.get("extended")), "secs": time.perf_counter() - t}
    ok = out["status"] == "solved" and all(c["passed"] for c in out.get("checks", []))
    res["ours"] = out["metrics"] if ok else None
    for key, alt in (out.get("alternatives") or {}).items():
        res[key] = alt["metrics"] if alt["status"] == "solved" and alt["valid"] else None
    res["lower_bound"] = (out.get("explain") or {}).get("lower_bound")
    return res


def main():
    every = int(sys.argv[1]) if len(sys.argv) > 1 else 16
    jobs = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    plans = load_plans(DATA / "ResPlan.pkl", DATA / "split.json")[::every]
    rows, t0 = [], time.perf_counter()
    results = ProcessPoolExecutor(jobs).map(measure, plans, chunksize=1) if jobs > 1 else map(measure, plans)
    for k, res in enumerate(results, 1):
        rows.append(res)
        print(f"{k}/{len(plans)} plan {res['plan_id']}: " + "  ".join(
            f"{key} {res[key]['H']}/{res[key]['J']:.1f}" if res.get(key) else f"{key} -" for key in METHODS),
            flush=True)

    lines = [f"{len(rows)} test plans (every {every}th), {time.perf_counter() - t0:.0f} s; "
             f"{sum(r['extended'] for r in rows)} needed a room over 100 m² split (extended rules)", ""]
    both = [r for r in rows if all(r.get(k) for k in METHODS)]
    lines.append(f"{'method':<15} {'valid':>6} {'avg H':>6} {'avg J':>7} {'avg L':>7} {'avg X':>6} {'avg O':>6} "
                 f"{'avg B':>6}   vs ours: better / tied / worse")
    for key, label in METHODS.items():
        valid = sum(1 for r in rows if r.get(key))
        avg = lambda f: sum(r[key][f] for r in both) / len(both) if both else float("nan")
        wins = Counter(compare(r.get(key), r.get("ours")) for r in rows) if key != "ours" else None
        vs = f"{wins[-1]:>4} / {wins[0]:>4} / {wins[1]:>4}" if wins else "   -"
        lines.append(f"{label:<15} {valid:>6} {avg('H'):>6.2f} {avg('J'):>7.2f} {avg('L'):>7.2f} {avg('X'):>6.2f} "
                     f"{avg('O'):>6.2f} {avg('B'):>6.2f}   {vs}")
    lines.append("")
    lines.append(f"Averages are over the {len(both)} plans every method solved validly. 'Better' means the "
                 "method ranks above ours on that plan (fewer hubs, or equal hubs and lower J).")
    bounded = [r for r in rows if r.get("ours") and r.get("lower_bound")]
    if bounded:
        gaps = sorted(r["lower_bound"]["gap_pct"] for r in bounded)
        lb = sum(r["lower_bound"]["J"] for r in bounded) / len(bounded)
        jo = sum(r["ours"]["J"] for r in bounded) / len(bounded)
        lines.append(f"Lower bound on J (no design with the same hubs can cost less on the 5 cm grid): "
                     f"avg {lb:.2f} vs ours {jo:.2f}, i.e. ours is {(jo - lb) / lb * 100:.1f}% above on "
                     f"average; median plan {gaps[len(gaps) // 2]:.1f}% above, {len(bounded)} plans.")
        under = [r["plan_id"] for r in bounded if r["ours"]["J"] < r["lower_bound"]["J"] - 1e-6]
        if under:
            lines.append(f"BOUND VIOLATED (a bug): {under}")
    beaten = [(r["plan_id"], key) for r in rows for key in METHODS if key != "ours"
              and compare(r.get(key), r.get("ours")) < 0]
    if beaten:
        lines.append("Plans where a baseline beat ours: " + ", ".join(f"{p} ({METHODS[k]})" for p, k in beaten))

    text = "\n".join(lines)
    print("\n" + text)
    (OUT / "benchmark.txt").write_text(text + "\n")
    (OUT / "benchmark.json").write_text(json.dumps(rows, indent=1))


if __name__ == "__main__":
    main()
