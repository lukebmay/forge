#!/usr/bin/env python3
"""Summarize meta-probe result JSON runs."""

from __future__ import annotations

import argparse
import json
import statistics
import sys
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
    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for t in doc.get("trials") or []:
        if t.get("skipped"):
            continue
        groups[(t.get("appId"), t.get("opId"))].append(t)

    rows = []
    for (app, op), trials in sorted(groups.items()):
        waits = []
        quiets = []
        rels = []
        oks = 0
        signal_totals: dict[str, list[int]] = defaultdict(list)
        for t in trials:
            if t.get("ok"):
                oks += 1
            s = t.get("settle") or {}
            if s.get("waitMs") is not None:
                waits.append(float(s["waitMs"]))
            if s.get("timeToQuietMs") is not None:
                quiets.append(float(s["timeToQuietMs"]))
            if s.get("relevantEventCount") is not None:
                rels.append(int(s["relevantEventCount"]))
            for sig, n in (s.get("countsBySignal") or {}).items():
                signal_totals[sig].append(int(n))

        rows.append(
            {
                "appId": app,
                "opId": op,
                "n": len(trials),
                "ok": oks,
                "waitMs": {
                    "mean": statistics.mean(waits) if waits else None,
                    "stdev": statistics.stdev(waits) if len(waits) > 1 else 0.0,
                    "p50": pct(waits, 50),
                    "p95": pct(waits, 95),
                    "max": max(waits) if waits else None,
                    "min": min(waits) if waits else None,
                },
                "timeToQuietMs": {
                    "p50": pct(quiets, 50),
                    "max": max(quiets) if quiets else None,
                },
                "relevantEvents": {
                    "mean": statistics.mean(rels) if rels else None,
                    "p50": pct([float(x) for x in rels], 50) if rels else None,
                    "max": max(rels) if rels else None,
                },
                "signalsMean": {
                    k: statistics.mean(v) for k, v in sorted(signal_totals.items())
                },
            }
        )
    ns = doc.get("namespace") or {}
    return {
        "host": doc.get("host"),
        "namespace": ns,
        "suite": doc.get("suite"),
        "phase": doc.get("phase"),
        "createdAt": doc.get("createdAt"),
        "trialCount": len(doc.get("trials") or []),
        "rows": rows,
    }


def print_table(summary: dict[str, Any]) -> None:
    host = (summary.get("host") or {}).get("host")
    ns = summary.get("namespace") or {}
    sess = ns.get("session") or (summary.get("host") or {}).get("sessionType")
    suite = summary.get("suite") or ns.get("suite")
    print(
        f"host={host} session={sess} suite={suite} "
        f"phase={summary.get('phase')} trials={summary.get('trialCount')}"
    )
    print(
        f"{'app':16} {'op':22} {'n':>3} {'ok':>3} "
        f"{'wait_p50':>9} {'quiet_p50':>9} {'wait_max':>9} "
        f"{'ev_p50':>7} {'ev_max':>7}"
    )
    for r in summary.get("rows") or []:
        w = r["waitMs"]
        q = r.get("timeToQuietMs") or {}
        e = r["relevantEvents"]

        def f(x):
            return f"{x:9.0f}" if x is not None else f"{'—':>9}"

        def fi(x):
            return f"{x:7.0f}" if x is not None else f"{'—':>7}"

        print(
            f"{r['appId'][:16]:16} {r['opId'][:22]:22} {r['n']:3} {r['ok']:3} "
            f"{f(w.get('p50'))} {f(q.get('p50'))} {f(w.get('max'))} "
            f"{fi(e.get('p50'))} {fi(e.get('max'))}"
        )


def main(argv: Optional[list[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Analyze meta-probe results")
    p.add_argument("path", type=Path, help="results JSON")
    p.add_argument("--json", action="store_true")
    p.add_argument("--compare", type=Path, default=None, help="second run JSON")
    args = p.parse_args(argv)

    doc = load(args.path)
    summary = summarize(doc)
    if args.json:
        print(json.dumps(summary, indent=2))
    else:
        print_table(summary)
        # top thrash signals
        print("\nMean signal counts (per app/op with data):")
        for r in summary.get("rows") or []:
            if r.get("signalsMean"):
                sigs = ", ".join(f"{k}={v:.1f}" for k, v in r["signalsMean"].items())
                print(f"  {r['appId']}/{r['opId']}: {sigs}")

    if args.compare:
        other = summarize(load(args.compare))
        print("\n--- compare ---")
        print_table(other)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
