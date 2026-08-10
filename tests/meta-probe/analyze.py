#!/usr/bin/env python3
"""Summarize meta-probe result JSON runs (agreement model)."""

from __future__ import annotations

import argparse
import json
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any, Optional


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def pct(xs: list[float], p: float) -> Optional[float]:
    if not xs:
        return None
    ys = sorted(xs)
    if len(ys) == 1:
        return ys[0]
    k = (len(ys) - 1) * p / 100.0
    f = int(k)
    c = min(f + 1, len(ys) - 1)
    if f == c:
        return ys[f]
    return ys[f] + (ys[c] - ys[f]) * (k - f)


def summarize(doc: dict[str, Any]) -> dict[str, Any]:
    groups: dict[tuple[str, str, str], list[dict[str,
                                                 Any]]] = defaultdict(list)
    for t in doc.get("trials") or []:
        if t.get("skipped"):
            continue
        role = t.get("role") or "full"
        groups[(t.get("appId"), t.get("opId"), role)].append(t)

    rows = []
    for (app, op, role), trials in sorted(groups.items()):
        waits = []
        hard = []
        soft = []
        oks = 0
        for t in trials:
            if t.get("ok"):
                oks += 1
            s = t.get("settle") or {}
            if s.get("waitMs") is not None:
                waits.append(float(s["waitMs"]))
            if s.get("hardResetCount") is not None:
                hard.append(int(s["hardResetCount"]))
            if s.get("softCount") is not None:
                soft.append(int(s["softCount"]))
        rows.append({
            "appId": app,
            "opId": op,
            "role": role,
            "n": len(trials),
            "ok": oks,
            "waitMs": {
                "p50": pct(waits, 50),
                "max": max(waits) if waits else None,
                "mean": statistics.mean(waits) if waits else None,
            },
            "hardResets": {
                "p50": pct([float(x) for x in hard], 50) if hard else None,
                "max": max(hard) if hard else None,
            },
            "soft": {
                "p50": pct([float(x) for x in soft], 50) if soft else None,
                "max": max(soft) if soft else None,
            },
        })
    return {
        "host": doc.get("host"),
        "namespace": doc.get("namespace"),
        "suite": doc.get("suite"),
        "phase": doc.get("phase"),
        "derivedKnobs": doc.get("derivedKnobs"),
        "agreementContract": doc.get("agreementContract"),
        "createdAt": doc.get("createdAt"),
        "trialCount": len(doc.get("trials") or []),
        "rows": rows,
    }


def print_table(summary: dict[str, Any]) -> None:
    host = (summary.get("host") or {}).get("host")
    ns = summary.get("namespace") or {}
    print(
        f"host={host} session={ns.get('session')} suite={summary.get('suite')} "
        f"phase={summary.get('phase')} trials={summary.get('trialCount')}")
    if summary.get("derivedKnobs"):
        print(f"derivedKnobs={summary['derivedKnobs']}")
    print(f"{'app':14} {'op':20} {'role':10} {'n':>3} {'ok':>3} "
          f"{'wait_p50':>9} {'wait_max':>9} {'hard_p50':>8} {'soft_p50':>8}")
    for r in summary.get("rows") or []:
        w = r["waitMs"]
        h = r["hardResets"]
        s = r["soft"]

        def f(x):
            return f"{x:9.0f}" if x is not None else f"{'—':>9}"

        def fi(x):
            return f"{x:8.0f}" if x is not None else f"{'—':>8}"

        print(f"{str(r['appId'])[:14]:14} {str(r['opId'])[:20]:20} "
              f"{str(r['role'])[:10]:10} {r['n']:3} {r['ok']:3} "
              f"{f(w.get('p50'))} {f(w.get('max'))} "
              f"{fi(h.get('p50'))} {fi(s.get('p50'))}")


def main(argv: Optional[list[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Analyze meta-probe results")
    p.add_argument("path", type=Path, help="results JSON")
    p.add_argument("--json", action="store_true")
    p.add_argument("--compare", type=Path, default=None)
    args = p.parse_args(argv)

    doc = load(args.path)
    summary = summarize(doc)
    if args.json:
        print(json.dumps(summary, indent=2))
    else:
        print_table(summary)
        cat = doc.get("disagreementCatalog") or {}
        auto = {k: v for k, v in cat.items() if v.get("auto")}
        if auto:
            print(f"\nAuto-named disagreements ({len(auto)}):")
            for k, v in sorted(auto.items()):
                print(f"  {k}: {v}")

    if args.compare:
        print("\n--- compare ---")
        print_table(summarize(load(args.compare)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
