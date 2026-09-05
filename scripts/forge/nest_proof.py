#!/usr/bin/env python3
"""Nest proof-regression loop + share oracles.

Story catalog is nest_stories.py. proof-loop --suite core|rc|regression|chaos
loops that tree (always-stop per case). Host/wake rows are not nest --rc.

See agents/plans/forge-design-e2e.md and forge-proof-regression-loop.md.
"""

from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Optional, Sequence

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

VERSION = "1"
CAP_NEST = "nest"
CAP_APPROX = "nest-approx"
CAP_HOST = "host-only"
SUITE_CORE = "core"
SUITE_RC = "rc"
SUITE_REGRESSION = "regression"
SUITE_CHAOS = "chaos"
SUITE_WAKE = "wake-approx"
SUITE_HOST = "host"
SUITES = frozenset(
    {
        SUITE_CORE,
        SUITE_RC,
        SUITE_REGRESSION,
        SUITE_CHAOS,
        SUITE_WAKE,
        SUITE_HOST,
    }
)
UNTIL_FAIL = "fail"
UNTIL_KEEP = "keep-going"
# Stuck-at-1/3 band vs fill-half (landscape 1920 dummy). Gaps ~8–16px.
THIRD_LO = 0.28
THIRD_HI = 0.38
HALF_LO = 0.42
HALF_HI = 0.58
FULL_LO = 0.85


@dataclass(frozen=True)
class ProofCase:
    """One nest (or host-only) proof case."""

    id: str
    title: str
    smoke: str
    monitors: int
    capability: str
    suites: tuple[str, ...]
    manual_checks: tuple[str, ...] = ()
    layout_chaos: bool = False
    notes: str = ""
    story_id: str = ""

    def tags(self) -> frozenset[str]:
        return frozenset(
            {
                self.id,
                self.smoke,
                self.capability,
                self.story_id,
                *self.suites,
                *self.manual_checks,
            }
        )


def _layout_tabbed_edge_argv() -> list[str]:
    from nest_layout_tabbed_edge_smoke import smoke_script_argv

    return smoke_script_argv()


def _geom_epsilon_argv() -> list[str]:
    from nest_geom_epsilon_campaign import smoke_script_argv

    return smoke_script_argv()


def _nest_apps_argv() -> list[str]:
    from nest_apps_smoke import smoke_script_argv

    return smoke_script_argv()


_SMOKE_ARGV = {
    "smoke-layout-tabbed-edge": _layout_tabbed_edge_argv,
    "smoke-geom-epsilon": _geom_epsilon_argv,
    "smoke-nest-apps": _nest_apps_argv,
}

# Deprecated CLI names → story ids (not the spec).
STORY_ALIASES: dict[str, str] = {
    "N.close-reflow": "trunk.close.three-equal-one-gone",
    "smoke-close-reflow": "trunk.close.three-equal-one-gone",
    "N.join-right": "trunk.mark2.join-enter",
    "smoke-mark2": "trunk.mark2.join-enter",
    "N.toggle-tab": "branch.tabs.stacked-same-slot",
    "smoke-toggle-tab": "branch.tabs.stacked-same-slot",
    "N.layout-ws": "branch.layout.ws2-no-mutate-ws1",
    "smoke-layout-ws": "branch.layout.ws2-no-mutate-ws1",
    "N.layout-occupied": "branch.layout.missing-roles-open",
    "smoke-layout-occupied": "branch.layout.missing-roles-open",
    "N.layout-dnd": "leaf.mark2.move-empty-monitor",
    "smoke-layout-dnd": "leaf.mark2.move-empty-monitor",
}


def smoke_argv(smoke: str) -> list[str]:
    name = str(smoke or "").strip()
    alias = STORY_ALIASES.get(name)
    if alias:
        from nest_story_bodies import campaign_argv

        return campaign_argv([alias])
    fn = _SMOKE_ARGV.get(name)
    if fn is None:
        raise ValueError(f"unknown nest smoke {smoke!r}")
    return list(fn())


def loop_argv(case: ProofCase) -> list[str]:
    if case.story_id:
        from nest_story_bodies import campaign_argv

        return campaign_argv([case.story_id])
    if case.smoke:
        return smoke_argv(case.smoke)
    raise ValueError(f"case {case.id} is not nest-runnable")


HOST_CASES: tuple[ProofCase, ...] = (
    ProofCase(
        id="H.borders",
        title="Only focused border; tab groups green",
        smoke="",
        monitors=0,
        capability=CAP_HOST,
        suites=(SUITE_HOST,),
        manual_checks=("borders",),
        notes="Pixel/St chrome. No nest CTS.",
    ),
    ProofCase(
        id="H.idle-dpms",
        title="Idle auto-lock + DPMS wake (host physics)",
        smoke="",
        monitors=0,
        capability=CAP_HOST,
        suites=(SUITE_HOST,),
        manual_checks=("wake",),
        notes="scripts/forge/trigger-idle-lock.zsh --idle-and-dpms",
    ),
    ProofCase(
        id="H.dual-4k",
        title="Physical dual-4K chrome open-leaf RC",
        smoke="",
        monitors=0,
        capability=CAP_HOST,
        suites=(SUITE_HOST,),
        manual_checks=("open-leaf",),
        notes="LIVE_CASES L1; dummy nest mons are 1920×1080 @1.",
    ),
)
WAKE_CASES: tuple[ProofCase, ...] = (
    ProofCase(
        id="N.wake-approx",
        title="Workareas-pulse inject (not real DPMS)",
        smoke="",
        monitors=2,
        capability=CAP_APPROX,
        suites=(SUITE_WAKE,),
        manual_checks=("wake",),
        notes="P4 hook not shipped. Loop skips until smoke exists.",
    ),
)
TOOL_CASES: tuple[ProofCase, ...] = (
    ProofCase(
        id="N.nest-apps",
        title="Nautilus / Ghostty / editor / Chrome map in-nest",
        smoke="smoke-nest-apps",
        monitors=1,
        capability=CAP_NEST,
        suites=(),
        manual_checks=("apps-map",),
        notes="Isolation tool, not a story. Not in --suite core/rc.",
    ),
    ProofCase(
        id="N.geom-epsilon",
        title="D095 sent↔observed geom ε",
        smoke="smoke-geom-epsilon",
        monitors=2,
        capability=CAP_NEST,
        suites=(),
        manual_checks=("geom",),
        notes="Measurement tool, not a story. Not in --suite core/rc.",
    ),
    ProofCase(
        id="N.tabbed-edge",
        title="TABBED × LEFT/RIGHT/TOP/BOTTOM edge drops",
        smoke="smoke-layout-tabbed-edge",
        monitors=2,
        capability=CAP_NEST,
        suites=(),
        manual_checks=("group", "move"),
        notes="Join-invent tool, not an RC trunk.",
    ),
)
# Host/wake/tools only. Nest spec is nest_stories.STORIES.
PROOF_CASES: tuple[ProofCase, ...] = HOST_CASES + WAKE_CASES + TOOL_CASES


def parse_suite(raw: Optional[str]) -> str:
    s = str(raw or SUITE_CORE).strip().lower() or SUITE_CORE
    if s == "smoke":
        s = SUITE_CORE
    if s not in SUITES:
        raise ValueError(f"unknown suite {raw!r} (try: {', '.join(sorted(SUITES))})")
    return s


def parse_until(raw: Optional[str]) -> str:
    u = str(raw or UNTIL_FAIL).strip().lower() or UNTIL_FAIL
    if u not in (UNTIL_FAIL, UNTIL_KEEP):
        raise ValueError(f"unknown --until {raw!r} (fail|keep-going)")
    return u


def parse_case_ids(raw: Optional[str]) -> tuple[str, ...]:
    if not raw:
        return ()
    out: list[str] = []
    for part in str(raw).split(","):
        tok = part.strip()
        if tok:
            out.append(tok)
    return tuple(out)


def resolve_case_token(tok: str) -> str:
    raw = str(tok or "").strip()
    return STORY_ALIASES.get(raw, raw)


def _story_to_case(story: Any) -> ProofCase:
    if story.level == "trunk":
        suites = (SUITE_CORE, SUITE_REGRESSION, SUITE_CHAOS, SUITE_RC)
    else:
        suites = (SUITE_RC,)
    return ProofCase(
        id=story.id,
        title=story.id,
        smoke="",
        monitors=int(story.monitors),
        capability=CAP_NEST,
        suites=suites,
        story_id=story.id,
        notes=story.level,
    )


def _lookup_static_case(tok: str) -> Optional[ProofCase]:
    for c in PROOF_CASES:
        if c.id == tok or c.smoke == tok:
            return c
    return None


def select_proof_cases(
    *,
    suite: str = SUITE_CORE,
    case_ids: Sequence[str] = (),
    include_unshipped: bool = False,
) -> list[ProofCase]:
    """Resolve suite / explicit ids. Nest suites are the story tree."""
    from nest_stories import STORY_BY_ID, STORIES, skip_in_default_rc, trunks

    suite_s = parse_suite(suite)
    wanted = [resolve_case_token(x) for x in case_ids if str(x).strip()]
    if wanted:
        out: list[ProofCase] = []
        seen: set[str] = set()
        for tok in wanted:
            if tok in seen:
                continue
            story = STORY_BY_ID.get(tok)
            if story is not None:
                out.append(_story_to_case(story))
                seen.add(tok)
                continue
            hit = _lookup_static_case(tok)
            if hit is None:
                raise ValueError(f"no proof cases matched {tok!r}")
            out.append(hit)
            seen.add(tok)
        return out
    if suite_s == SUITE_HOST:
        return list(HOST_CASES)
    if suite_s == SUITE_WAKE:
        if include_unshipped:
            return list(WAKE_CASES)
        return [c for c in WAKE_CASES if c.smoke]
    if suite_s == SUITE_RC:
        return [
            _story_to_case(s)
            for s in STORIES
            if not skip_in_default_rc(s)
        ]
    return [_story_to_case(s) for s in trunks()]


def case_plan_row(c: ProofCase) -> dict[str, Any]:
    row: dict[str, Any] = {
        "id": c.id,
        "title": c.title,
        "smoke": c.smoke,
        "monitors": c.monitors,
        "capability": c.capability,
        "suites": list(c.suites),
        "manualChecks": list(c.manual_checks),
        "layoutChaos": c.layout_chaos,
        "notes": c.notes,
        "storyId": c.story_id or None,
    }
    if c.story_id:
        from nest_stories import STORY_BY_ID, story_plan_row

        story = STORY_BY_ID.get(c.story_id)
        if story is not None:
            row.update(story_plan_row(story))
    return row


def window_rect(win: Mapping[str, Any]) -> dict[str, float]:
    rect = win.get("rect") if isinstance(win.get("rect"), dict) else {}
    out = {"x": 0.0, "y": 0.0, "width": 0.0, "height": 0.0}
    for k in out:
        try:
            out[k] = float(rect.get(k) or 0)
        except (TypeError, ValueError):
            out[k] = 0.0
    return out


def monitor_rect(forest: Mapping[str, Any], mon_i: int = 0) -> dict[str, float]:
    roots = forest.get("monitors") or []
    if not isinstance(roots, list) or mon_i < 0 or mon_i >= len(roots):
        return {"x": 0.0, "y": 0.0, "width": 0.0, "height": 0.0}
    mon = roots[mon_i]
    if not isinstance(mon, dict):
        return {"x": 0.0, "y": 0.0, "width": 0.0, "height": 0.0}
    r = window_rect(mon)
    if r["width"] > 0 and r["height"] > 0:
        return r
    return r


def width_ratio(win: Mapping[str, Any], mon: Mapping[str, float]) -> float:
    mw = float(mon.get("width") or 0)
    if mw <= 0:
        return 0.0
    return window_rect(win)["width"] / mw


def height_ratio(win: Mapping[str, Any], mon: Mapping[str, float]) -> float:
    mh = float(mon.get("height") or 0)
    if mh <= 0:
        return 0.0
    return window_rect(win)["height"] / mh


def in_band(value: float, lo: float, hi: float) -> bool:
    return lo <= float(value) <= hi


def node_percent(node: Mapping[str, Any]) -> float:
    try:
        return float(node.get("percent") or 0)
    except (TypeError, ValueError):
        return 0.0


def stuck_third_windows(
    wins: Sequence[Mapping[str, Any]],
    mon: Mapping[str, float],
) -> list[str]:
    """Window ids whose width is in the stuck-1/3 band of the monitor."""
    bad: list[str] = []
    for w in wins:
        wr = width_ratio(w, mon)
        if in_band(wr, THIRD_LO, THIRD_HI):
            bad.append(str(w.get("windowId") or ""))
    return bad


def placeholder_nodes(forest: Mapping[str, Any]) -> list[dict[str, Any]]:
    """WINDOW nodes that are layout placeholders or forge-ph leftovers."""
    bad: list[dict[str, Any]] = []

    def walk(node: Any) -> None:
        if not isinstance(node, dict):
            return
        nt = str(node.get("nodeType") or node.get("kind") or "").upper()
        if nt == "WINDOW":
            title = str(node.get("title") or "")
            wid = str(node.get("windowId") or "")
            wm = str(node.get("wmClass") or "").lower()
            if (
                node.get("placeholder") is True
                or wm == "forge-placeholder"
                or "forge-ph" in title
                or wid.startswith("forge-ph")
            ):
                bad.append(node)
        kids = node.get("children") or node.get("childNodes") or []
        if isinstance(kids, list):
            for c in kids:
                walk(c)

    roots = forest.get("monitors") or []
    if isinstance(roots, list):
        for mon in roots:
            walk(mon)
    return bad


class ShareError(ValueError):
    """CTS share/geom failure."""


def assert_no_placeholders(forest: Mapping[str, Any], *, stage: str) -> None:
    hits = placeholder_nodes(forest)
    if not hits:
        return
    ids = [str(w.get("windowId") or w.get("title") or "?") for w in hits]
    raise ShareError(f"{stage}: leftover forge-ph / placeholder ids={ids}")


def assert_seed_three(
    wins: Sequence[Mapping[str, Any]],
    mon: Mapping[str, float],
    *,
    stage: str,
) -> dict[str, Any]:
    """CTS0: three TILE kids. Width ~1/3 is recorded, not a hard fail."""
    ids = [str(w.get("windowId") or "") for w in wins]
    if len(wins) != 3:
        raise ShareError(f"{stage}: want 3 TILEs (have {len(wins)} ids={ids})")
    wr = [width_ratio(w, mon) for w in wins]
    ps = [node_percent(w) for w in wins]
    thirds = all(in_band(x, THIRD_LO, THIRD_HI) for x in wr)
    pct_sum = sum(ps)
    return {
        "ids": ids,
        "widthRatios": wr,
        "percents": ps,
        "thirds": thirds,
        "percentSum": pct_sum,
    }


def assert_sibling_percents_half(
    wins: Sequence[Mapping[str, Any]],
    *,
    stage: str,
) -> dict[str, Any]:
    """When GetTree percents are set, remaining pair must be ~0.5 not ~1/3."""
    ps = [node_percent(w) for w in wins]
    ids = [
        str(w.get("windowId") or w.get("id") or w.get("layout") or "")
        for w in wins
    ]
    if not all(p > 0 for p in ps):
        return {"skipped": True, "percents": ps, "ids": ids}
    stuck = [
        wid
        for wid, p in zip(ids, ps)
        if in_band(p, THIRD_LO, THIRD_HI)
    ]
    if stuck:
        raise ShareError(
            f"{stage}: stuck ~1/3 percent ids={stuck} percents={ps}"
        )
    if not all(in_band(p, HALF_LO, HALF_HI) for p in ps):
        raise ShareError(
            f"{stage}: sibling percents not ~0.5 percents={ps} ids={ids}"
        )
    if abs(sum(ps) - 1.0) > 0.08:
        raise ShareError(
            f"{stage}: sibling percents sum {sum(ps):.3f} != 1 ids={ids}"
        )
    return {"skipped": False, "percents": ps, "ids": ids}


def iter_hv_splits(
    forest: Mapping[str, Any],
) -> list[tuple[dict[str, Any], list[dict[str, Any]]]]:
    """HSPLIT/VSPLIT nodes with their direct children (MONITOR or CON)."""
    splits: list[tuple[dict[str, Any], list[dict[str, Any]]]] = []

    def walk(node: Any) -> None:
        if not isinstance(node, dict):
            return
        lay = str(node.get("layout") or "").upper()
        kids = node.get("children") or node.get("childNodes") or []
        if not isinstance(kids, list):
            kids = []
        real = [c for c in kids if isinstance(c, dict)]
        if lay in ("HSPLIT", "VSPLIT") and len(real) >= 2:
            splits.append((node, real))
        for c in real:
            walk(c)

    roots = forest.get("monitors") or []
    if isinstance(roots, list):
        for mon in roots:
            walk(mon)
    return splits


def assert_split_percents_half(
    forest: Mapping[str, Any],
    *,
    stage: str,
) -> dict[str, Any]:
    """Percent≈0.5 on the 2-child H/V split (not inner WINDOW fill=1)."""
    pairs = [(p, kids) for p, kids in iter_hv_splits(forest) if len(kids) == 2]
    if not pairs:
        return {"skipped": True, "reason": "no 2-child H/V split"}
    parent, kids = pairs[0]
    out = assert_sibling_percents_half(kids, stage=stage)
    out["parent"] = str(parent.get("nodeType") or parent.get("kind") or "")
    out["layout"] = str(parent.get("layout") or "")
    return out


def assert_siblings_fill_half(
    wins: Sequence[Mapping[str, Any]],
    mon: Mapping[str, float],
    *,
    stage: str,
    closed_id: Optional[str] = None,
) -> dict[str, Any]:
    """Two remaining TILEs must fill ~1/2 (HSPLIT width or VSPLIT height).

    Fails the stuck-1/3 width band even if percents sum to 1.0.
    """
    ids = [str(w.get("windowId") or "") for w in wins]
    if closed_id and str(closed_id) in ids:
        raise ShareError(f"{stage}: closed id still present: {closed_id}")
    if len(wins) != 2:
        raise ShareError(f"{stage}: want 2 TILEs after close (have {len(wins)} ids={ids})")
    stuck = stuck_third_windows(wins, mon)
    if stuck:
        ratios = [round(width_ratio(w, mon), 3) for w in wins]
        raise ShareError(
            f"{stage}: stuck ~1/3 width ids={stuck} width_ratios={ratios}"
        )
    wr = [width_ratio(w, mon) for w in wins]
    hr = [height_ratio(w, mon) for w in wins]
    hsplit = all(in_band(x, HALF_LO, HALF_HI) for x in wr)
    vsplit = all(x >= FULL_LO for x in wr) and all(
        in_band(y, HALF_LO, HALF_HI) for y in hr
    )
    if not hsplit and not vsplit:
        raise ShareError(
            f"{stage}: siblings did not fill ~1/2 "
            f"width_ratios={[round(x, 3) for x in wr]} "
            f"height_ratios={[round(y, 3) for y in hr]}"
        )
    return {
        "axis": "hsplit" if hsplit else "vsplit",
        "widthRatios": wr,
        "heightRatios": hr,
        "ids": ids,
    }


def assert_slot_half_width(
    win: Mapping[str, Any],
    mon: Mapping[str, float],
    *,
    stage: str,
) -> float:
    wr = width_ratio(win, mon)
    if in_band(wr, THIRD_LO, THIRD_HI):
        raise ShareError(
            f"{stage}: tab slot stuck ~1/3 width_ratio={wr:.3f} "
            f"id={win.get('windowId')}"
        )
    if not in_band(wr, HALF_LO, HALF_HI):
        raise ShareError(
            f"{stage}: tab slot not ~1/2 width_ratio={wr:.3f} "
            f"id={win.get('windowId')}"
        )
    return wr


def assert_slot_not_third(
    win: Mapping[str, Any],
    mon: Mapping[str, float],
    *,
    stage: str,
    min_ratio: float = HALF_LO,
) -> float:
    """Tab Meta/rect must not be stuck ~1/3. Full-width bag after joining two 1/2s is ok."""
    wr = width_ratio(win, mon)
    if in_band(wr, THIRD_LO, THIRD_HI):
        raise ShareError(
            f"{stage}: tab slot stuck ~1/3 width_ratio={wr:.3f} "
            f"id={win.get('windowId')}"
        )
    if wr + 1e-9 < float(min_ratio):
        raise ShareError(
            f"{stage}: tab slot too narrow width_ratio={wr:.3f} "
            f"id={win.get('windowId')}"
        )
    return wr


def assert_revealed_matches_bag(
    win: Mapping[str, Any],
    bag: Mapping[str, Any],
    mon: Mapping[str, float],
    *,
    stage: str,
) -> dict[str, float]:
    """Open tab Meta/rect must match the TABBED bag slot, not a stale 1/3."""
    wr_win = width_ratio(win, mon)
    wr_bag = width_ratio(bag, mon)
    if wr_bag <= 0:
        wr_bag = wr_win
    if in_band(wr_win, THIRD_LO, THIRD_HI) and in_band(wr_bag, HALF_LO, HALF_HI):
        raise ShareError(
            f"{stage}: revealed ~1/3 while bag slot ~1/2 "
            f"revealed={wr_win:.3f} bag={wr_bag:.3f} id={win.get('windowId')}"
        )
    if in_band(wr_win, THIRD_LO, THIRD_HI) and wr_bag <= 0:
        raise ShareError(
            f"{stage}: revealed stuck ~1/3 width_ratio={wr_win:.3f} "
            f"id={win.get('windowId')}"
        )
    if abs(wr_win - wr_bag) > 0.08 and wr_bag > 0:
        raise ShareError(
            f"{stage}: revealed width {wr_win:.3f} != bag slot {wr_bag:.3f} "
            f"id={win.get('windowId')}"
        )
    return {"revealed": wr_win, "bag": wr_bag}


def proof_loop_dir(state_dir: Path) -> Path:
    return Path(state_dir) / "proof-loop"


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _append_jsonl(path: Path, row: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, default=str) + "\n")


def repro_cmd(case: ProofCase) -> str:
    if case.story_id:
        from nest_stories import STORY_BY_ID

        story = STORY_BY_ID.get(case.story_id)
        flag = "--trunk" if story is not None and story.level == "trunk" else "--branch"
        m = int(case.monitors or 1)
        extra = f" --monitors={m}" if m != 1 else ""
        return f"./scripts/forge/forge-test nested {flag} {case.story_id}{extra}"
    m = int(case.monitors or 1)
    return (
        f"./scripts/forge/forge-test nested {case.smoke}"
        + (f" --monitors={m}" if m != 1 else "")
    )


def format_plan(cases: Sequence[ProofCase], *, suite: str) -> str:
    from nest_stories import STORY_BY_ID, story_status

    lines = [
        f"suite: {suite}",
        f"cases: {len(cases)}",
    ]
    for c in cases:
        if c.story_id:
            story = STORY_BY_ID.get(c.story_id)
            if story is not None:
                ef = "yes" if story.expected_fail else "no"
                lines.append(
                    f"  {c.id}  level={story.level}  mons={c.monitors}  "
                    f"expected-fail: {ef}  status={story_status(story)}"
                )
                continue
        lines.append(
            f"  {c.id:<22} mons={c.monitors} {c.smoke or c.capability:<24} "
            f"{','.join(c.manual_checks)}"
        )
    return "\n".join(lines) + "\n"


def cmd_proof_loop(args: Any, name: str) -> int:
    """``forge-test nested proof-loop`` — hours/iterations of nest CTS."""
    from nest_stories import cmd_story_campaign, story_flags_set
    from nested_wayland import (
        NestedError,
        NestedUnsupported,
        can_nested_on_host,
        run_campaign,
        session_dir,
        stop,
    )

    if story_flags_set(args):
        if getattr(args, "suite", None):
            print(
                "forge-test nested: cannot combine --suite with "
                "--trunk / --branch / --rc",
                file=sys.stderr,
            )
            return 2
        return cmd_story_campaign(args, name)

    try:
        suite = parse_suite(getattr(args, "suite", None) or SUITE_CORE)
        until = parse_until(getattr(args, "until", None))
        case_ids = parse_case_ids(getattr(args, "cases", None))
        cases = select_proof_cases(suite=suite, case_ids=case_ids)
    except ValueError as e:
        print(f"forge-test nested proof-loop: {e}", file=sys.stderr)
        return 2

    dry = bool(getattr(args, "dry_run", False))
    json_out = bool(getattr(args, "json", False))
    hours = getattr(args, "hours", None)
    iterations = getattr(args, "iterations", None)
    seed = int(getattr(args, "seed", None) or 1)
    chaos = bool(getattr(args, "chaos", False)) or suite == SUITE_CHAOS
    keep = bool(getattr(args, "keep", False))
    keep_on_fail = bool(getattr(args, "keep_on_fail", False))
    if bool(getattr(args, "fail_fast", False)) or keep_on_fail:
        until = UNTIL_FAIL
    monitors_override = getattr(args, "monitors", None)

    if hours is None and iterations is None:
        iterations = 1
    if hours is not None:
        try:
            hours = float(hours)
        except (TypeError, ValueError):
            print("forge-test nested proof-loop: --hours must be a number", file=sys.stderr)
            return 2
        if hours <= 0:
            print("forge-test nested proof-loop: --hours must be > 0", file=sys.stderr)
            return 2
    if iterations is not None:
        try:
            iterations = int(iterations)
        except (TypeError, ValueError):
            print(
                "forge-test nested proof-loop: --iterations must be an int",
                file=sys.stderr,
            )
            return 2
        if iterations <= 0:
            print(
                "forge-test nested proof-loop: --iterations must be > 0",
                file=sys.stderr,
            )
            return 2

    plan = {
        "suite": suite,
        "until": until,
        "hours": hours,
        "iterations": iterations,
        "seed": seed,
        "chaos": chaos,
        "cases": [case_plan_row(c) for c in cases],
    }
    from nest_stories import (
        OUTCOME_FAIL,
        OUTCOME_PASS,
        OUTCOME_XFAIL,
        STORY_BY_ID,
        UNIMPLEMENTED_RC,
        classify_story_outcome,
        format_story_outcome_line,
        story_status,
    )

    unimplemented = [
        c
        for c in cases
        if c.story_id
        and (
            c.story_id not in STORY_BY_ID
            or story_status(STORY_BY_ID[c.story_id]) == "unimplemented"
        )
    ]
    runnable = [c for c in cases if c.smoke or c.story_id]
    if suite == SUITE_HOST:
        if json_out:
            print(json.dumps(plan, indent=2))
        else:
            sys.stdout.write(format_plan(cases, suite=suite))
            print(
                "forge-test nested proof-loop: host-only cases are not nest-runnable",
                file=sys.stderr,
            )
        return 0 if dry else 2
    if not runnable:
        print(
            f"forge-test nested proof-loop: suite {suite!r} selected 0 runnable cases",
            file=sys.stderr,
        )
        if suite == SUITE_WAKE:
            print(
                "  N.wake-approx is P4 (inject hook not shipped).",
                file=sys.stderr,
            )
        if json_out:
            print(json.dumps(plan, indent=2))
        return 0 if dry else 2
    cases = runnable

    if dry:
        if json_out:
            print(json.dumps(plan, indent=2))
        else:
            sys.stdout.write(format_plan(cases, suite=suite))
        return 0

    if unimplemented:
        n = len(unimplemented)
        print(
            f"forge-test nested proof-loop: {n} unimplemented stor"
            f"{'y' if n == 1 else 'ies'} (not a pass)",
            file=sys.stderr,
        )
        for c in unimplemented:
            print(f"  {c.id}", file=sys.stderr)
        return int(UNIMPLEMENTED_RC)

    if not can_nested_on_host() and not bool(getattr(args, "allow_x11", False)):
        print(
            "forge-test nested proof-loop: host cannot nest "
            "(need Wayland + nested doctor tools)",
            file=sys.stderr,
        )
        print("  ./scripts/forge/forge-test nested doctor", file=sys.stderr)
        return 2

    state = Path(session_dir(name))
    loop_dir = proof_loop_dir(state)
    stamp = utc_stamp()
    jsonl = loop_dir / f"{stamp}.jsonl"
    fail_path = loop_dir / "failures.jsonl"
    record_queue = getattr(args, "record_queue", None)
    if record_queue:
        fail_path = Path(str(record_queue))

    start_mono = time.monotonic()
    iter_i = 0
    failures: list[dict[str, Any]] = []
    xfails: list[dict[str, Any]] = []
    results: list[dict[str, Any]] = []
    rc_out = 0
    allow_x11 = bool(getattr(args, "allow_x11", False))
    unsafe = not bool(getattr(args, "safe_mode", False))
    enable_forge = not bool(getattr(args, "no_enable", False))
    size = getattr(args, "size", None)
    scale = str(getattr(args, "scale", None) or "1")
    display = getattr(args, "display", None)

    print(
        f"forge-test nested proof-loop: suite={suite} cases={len(cases)} "
        f"seed={seed} until={until} log={jsonl}",
        file=sys.stderr,
    )
    leave_nest = bool(keep)
    try:
        while True:
            iter_i += 1
            for case in cases:
                env_extra: dict[str, str] = {}
                layout_chaos = bool(case.layout_chaos)
                if case.story_id:
                    story = STORY_BY_ID.get(case.story_id)
                    if story is not None and "layout" in story.covers:
                        layout_chaos = True
                if chaos and layout_chaos:
                    env_extra["FORGE_LAYOUT_CHAOS"] = "1"
                    env_extra["FORGE_LAYOUT_CHAOS_SEED"] = str(seed)
                old_env = {k: os.environ.get(k) for k in env_extra}
                t0 = time.monotonic()
                case_rc = 1
                err = ""
                argv: list[str] = []
                nmon = (
                    int(monitors_override)
                    if monitors_override is not None else int(case.monitors or 1)
                )
                case_keep = bool(keep or keep_on_fail)
                try:
                    for k, v in env_extra.items():
                        os.environ[k] = v
                    argv = loop_argv(case)
                    case_rc = run_campaign(
                        argv,
                        name=name,
                        keep=case_keep,
                        display=display,
                        size=size,
                        scale=scale,
                        num_monitors=nmon,
                        unsafe_mode=unsafe,
                        allow_x11=allow_x11,
                        enable_forge=enable_forge,
                    )
                    if case_keep and int(case_rc) == 0 and keep_on_fail and not keep:
                        try:
                            stop(name=name, force=True)
                        except Exception:
                            pass
                except (NestedError, NestedUnsupported, ValueError) as e:
                    case_rc = int(getattr(e, "exit_code", 1) or 1)
                    err = str(e)
                finally:
                    for k, prev in old_env.items():
                        if prev is None:
                            os.environ.pop(k, None)
                        else:
                            os.environ[k] = prev
                wall_ms = int((time.monotonic() - t0) * 1000)
                story = STORY_BY_ID.get(case.story_id) if case.story_id else None
                if story is not None:
                    outcome = classify_story_outcome(
                        story, status="ready", rc=case_rc
                    )
                else:
                    outcome = (
                        OUTCOME_PASS if int(case_rc) == 0 else OUTCOME_FAIL
                    )
                row = {
                    "utc": datetime.now(timezone.utc).isoformat(),
                    "iter": iter_i,
                    "seed": seed,
                    "id": case.id,
                    "smoke": case.smoke,
                    "storyId": case.story_id or None,
                    "monitors": nmon,
                    "rc": int(case_rc),
                    "outcome": outcome,
                    "expectedFail": bool(story.expected_fail) if story else False,
                    "wallMs": wall_ms,
                    "error": err,
                    "repro": repro_cmd(case),
                    "cmd": " ".join(str(x) for x in argv),
                    "chaos": bool(env_extra),
                }
                results.append(row)
                _append_jsonl(jsonl, row)
                print(
                    f"  iter={iter_i} {case.id} rc={case_rc} {wall_ms}ms",
                    file=sys.stderr,
                )
                if outcome == OUTCOME_XFAIL and story is not None:
                    print(
                        format_story_outcome_line(story, outcome, rc=case_rc),
                        file=sys.stderr,
                    )
                    xfails.append(row)
                    if keep_on_fail and not keep:
                        try:
                            stop(name=name, force=True)
                        except Exception:
                            pass
                elif int(case_rc) != 0:
                    print(
                        f"    cmd: {row.get('repro')}  exit={case_rc}",
                        file=sys.stderr,
                    )
                    failures.append(row)
                    _append_jsonl(fail_path, row)
                    rc_out = 1
                    if keep_on_fail:
                        leave_nest = True
                    if until == UNTIL_FAIL:
                        raise _StopLoop()
            if iterations is not None and iter_i >= iterations:
                break
            if hours is not None and (time.monotonic() - start_mono) >= hours * 3600.0:
                break
    except _StopLoop:
        pass
    except KeyboardInterrupt:
        rc_out = 130
        leave_nest = False
        print("forge-test nested proof-loop: interrupted", file=sys.stderr)
    finally:
        if not leave_nest:
            try:
                stop(name=name, force=bool(getattr(args, "force", False)))
            except Exception:
                pass

    summary = {
        "ok": rc_out == 0,
        "suite": suite,
        "iters": iter_i,
        "cases": len(cases),
        "runs": len(results),
        "failures": len(failures),
        "xfails": len(xfails),
        "log": str(jsonl),
        "failLog": str(fail_path) if failures else None,
        "wallMs": int((time.monotonic() - start_mono) * 1000),
    }
    if json_out:
        print(
            json.dumps(
                {"summary": summary, "failures": failures, "xfails": xfails},
                indent=2,
            )
        )
    else:
        print(
            f"forge-test nested proof-loop: "
            f"{'PASS' if rc_out == 0 else 'FAIL'} "
            f"iters={iter_i} runs={len(results)} fail={len(failures)} "
            f"xfail={len(xfails)}",
            file=sys.stderr,
        )
        if failures:
            print(f"  failures: {fail_path}", file=sys.stderr)
            print(f"  repro: {failures[0].get('repro')}", file=sys.stderr)
    return rc_out


class _StopLoop(Exception):
    """Internal: --until fail."""
