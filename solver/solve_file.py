"""Run the solver on a file: the ResPlan dataset (.zip or .pkl, as uploaded
in the editor's "Import ResPlan Dataset"), or one plan's JSON from the editor.

Usage:
  .venv/bin/python solve_file.py FILE --id 2814 [--id 12070 ...]
  .venv/bin/python solve_file.py FILE --index 0 [--index 5 ...]   (position in the file)
  .venv/bin/python solve_file.py FILE --first 20 [--split test]
  .venv/bin/python solve_file.py FILE --all [--split test]
  .venv/bin/python solve_file.py plan.json                         (one plan from the editor)

Options:
  --out DIR     where to write results (default: out/runs/<file name>/)
  --editor      also copy each result into ../public/cable-plans/ so the
                editor's cable menu lists it
  --jobs N      solve N plans at once, one process each (default 1)

Writes per plan: submission/<id>.json (slide 8), report/<id>.json (status,
metrics, every rule check) and editor/<id>.json (what the editor draws).

  .venv/bin/python solve_file.py --serve
Reads one JSON request on stdin and writes the editor JSON to stdout; this is
how the dev server calls the solver (scripts/resplan/vitePlugin.ts):
  {"dataset": path, "index": N}  or  {"dataset": path, "id": ID}
  {"plan": <editor JSON>}                           solve / re-solve it
  {"plan": <editor JSON>, "move": {"hub_id", "x", "y"}}   move one hub
"""

import argparse
import json
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from cable_api import DatasetError, load_dataset, resolve_json, solve_to_editor
from export_editor import DEST
from step1 import OUT


def pick(plans, split_of, args):
    if args.split:
        plans = [p for p in plans if split_of.get(p["id"]) == args.split]
    if args.id:
        by_id = {int(p["id"]): p for p in plans}
        missing = [i for i in args.id if i not in by_id]
        if missing:
            sys.exit(f"no plan with id {missing} in this file")
        return [by_id[i] for i in args.id]
    if args.index:
        bad = [i for i in args.index if not 0 <= i < len(plans)]
        if bad:
            sys.exit(f"index {bad} out of range: the file has {len(plans)} plans (0-{len(plans) - 1})")
        return [plans[i] for i in args.index]
    if args.first:
        return plans[: args.first]
    if args.all or len(plans) == 1:
        return plans
    sys.exit(f"the file has {len(plans)} plans: choose some with --id, --index, --first N or --all")


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, separators=(",", ":")))


def add_to_editor(result):
    """Copy a result into the editor's cable menu (public/cable-plans/)."""
    pid = result["plan_id"]
    write(DEST / f"{pid}.json", result)
    index_path = DEST / "index.json"
    index = {e["plan_id"]: e for e in json.loads(index_path.read_text())} if index_path.exists() else {}
    index[pid] = {"plan_id": pid, "hubs": len(result["hubs"]), "rooms": len(result["rooms"]),
                  "J": result["metrics"].get("J")}
    index_path.write_text(json.dumps(sorted(index.values(), key=lambda e: e["plan_id"]), indent=1))


def serve():
    """One request on stdin -> one editor JSON (or {"error"}) on stdout."""
    try:
        req = json.load(sys.stdin)
        if "dataset" in req:
            plans, _ = load_dataset(req["dataset"])
            if "id" in req:
                found = [p for p in plans if int(p["id"]) == int(req["id"])]
                if not found:
                    raise DatasetError(f"no plan with id {req['id']}")
                plan = found[0]
            else:
                plan = plans[int(req["index"])]
            result = solve_to_editor(plan)
        else:
            result = resolve_json(req["plan"], req.get("move"))
    except (DatasetError, KeyError, IndexError, ValueError) as e:
        json.dump({"error": str(e) or type(e).__name__}, sys.stdout)
        return 2
    except OSError as e:
        json.dump({"error": f"could not read the file: {e.strerror or e}"}, sys.stdout)
        return 2
    except Exception as e:  # the editor shows this message instead of a stack trace
        json.dump({"error": f"the solver failed: {type(e).__name__}: {e}"}, sys.stdout)
        return 2
    json.dump(result, sys.stdout, separators=(",", ":"))
    return 0


def solve_job(job):
    """(result, seconds) for one (plan, editor JSON) job; never raises."""
    plan, data = job
    t = time.perf_counter()
    try:
        result = solve_to_editor(plan) if plan is not None else resolve_json(data)
    except Exception as e:  # one broken plan shouldn't stop a batch
        pid = plan["id"] if plan is not None else data.get("plan_id")
        result = {"plan_id": pid, "status": "error", "reason": f"{type(e).__name__}: {e}", "metrics": {}}
    return result, time.perf_counter() - t


def solved(jobs, workers):
    """solve_job over every job, in order; in parallel when workers > 1."""
    if workers <= 1 or len(jobs) <= 1:
        return map(solve_job, jobs)
    pool = ProcessPoolExecutor(workers)
    return pool.map(solve_job, jobs, chunksize=1)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file", nargs="?", type=Path)
    ap.add_argument("--id", type=int, action="append", default=[])
    ap.add_argument("--index", type=int, action="append", default=[])
    ap.add_argument("--first", type=int)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--split", choices=["train", "val", "test"])
    ap.add_argument("--out", type=Path)
    ap.add_argument("--editor", action="store_true")
    ap.add_argument("--serve", action="store_true")
    ap.add_argument("--jobs", type=int, default=1)
    args = ap.parse_args()

    if args.serve:
        return serve()
    if not args.file:
        ap.error("give a file (or --serve)")
    if not args.file.exists():
        sys.exit(f"{args.file}: no such file")
    out = args.out or OUT / "runs" / args.file.stem

    t0 = time.perf_counter()
    if args.file.suffix.lower() == ".json":
        jobs = [(None, json.loads(args.file.read_text()))]
    else:
        try:
            plans, split_of = load_dataset(args.file)
        except DatasetError as e:
            sys.exit(f"{args.file}: {e}")
        print(f"{args.file.name}: {len(plans)} plans, read in {time.perf_counter() - t0:.1f} s")
        jobs = [(p, None) for p in pick(plans, split_of, args)]

    print(f'{"plan":>6} {"status":>10} {"H":>2} {"J":>7} {"naive H/J":>9} {"greedy":>9} {"C-W":>9} '
          f'{"L":>7} {"X":>3} {"O":>6} {"B":>4} {"secs":>5}  checks')
    counts = {}
    for result, secs in solved(jobs, args.jobs):
        pid = result["plan_id"]
        status = result["status"]
        counts[status] = counts.get(status, 0) + 1

        write(out / "editor" / f"{pid}.json", result)
        report = {k: result.get(k) for k in ("plan_id", "status", "reason", "warning", "extended",
                                             "metrics", "checks")}
        report["alternatives"] = {k: {f: v.get(f) for f in ("status", "reason", "metrics", "valid")}
                                  for k, v in (result.get("alternatives") or {}).items()}
        write(out / "report" / f"{pid}.json", report)
        if result.get("submission"):
            write(out / "submission" / f"{pid}.json", result["submission"])
        if args.editor and result.get("rooms"):
            add_to_editor(result)

        alts = result.get("alternatives") or {}

        def other(key):
            """A baseline's hubs/J, e.g. '3/52.1', or '-' if it failed."""
            m = (alts.get(key) or {}).get("metrics") or {}
            return f'{m["H"]}/{m["J"]:.1f}' if m and alts[key]["valid"] else "-"

        if status == "solved":
            m = result["metrics"]
            failed = [c["name"] for c in result["checks"] if not c["passed"]]
            print(f'{pid:>6} {status:>10} {m["H"]:>2} {m["J"]:>7.1f} {other("naive"):>9} {other("greedy"):>9} '
                  f'{other("savings"):>9} {m["L"]:>7.1f} {m["X"]:>3} {m["O"]:>6.1f} {m["B"]:>4} {secs:>5.1f}  '
                  + ("ok" if not failed else "FAILED: " + "; ".join(failed))
                  + ("  [extended rules: " + "; ".join(result["extended"]) + "]" if result.get("extended") else ""))
        else:
            print(f'{pid:>6} {status:>10} {"":>2} {"":>7} {"":>9} {"":>9} {"":>9} {"":>7} {"":>3} {"":>6} {"":>4} '
                  f'{secs:>5.1f}  {result["reason"]}')

    print(f"\n{len(jobs)} plans in {time.perf_counter() - t0:.0f} s: "
          + ", ".join(f"{n} {s}" for s, n in sorted(counts.items()))
          + f" -> {out}" + (f" (and {DEST})" if args.editor else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
