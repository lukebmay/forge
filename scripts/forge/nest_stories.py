#!/usr/bin/env python3
"""Design-sourced nest E2E story catalog + --trunk/--branch/--rc select.

Ids come from agents/plans/forge-design-e2e/stories.md.
proof-loop --suite core|rc|regression|chaos selects this tree, not N.* smokes.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Callable, Mapping, Optional, Sequence

VERSION = "1"
REPO_ROOT = Path(__file__).resolve().parents[2]
STORIES_MD = (
    REPO_ROOT / "agents" / "plans" / "forge-design-e2e" / "stories.md"
)
_HEADING_RE = re.compile(
    r"^### `(?P<id>(?:trunk|branch|leaf)\.[a-z0-9][a-z0-9.-]*)`\s*$",
    re.M,
)
LEVELS = frozenset({"trunk", "branch", "leaf"})
COVERS = frozenset(
    {"open", "layout", "close", "tabs", "mark2", "float", "settle"}
)
UNIMPLEMENTED_RC = 1
SELECT_ERROR_RC = 2
SKIP_RC_ID = "leaf.float.fail-safe-terminator"
BVHNV_ID = "trunk.open.launch-into-2slot"
OUTCOME_PASS = "pass"
OUTCOME_FAIL = "fail"
OUTCOME_XFAIL = "xfail"
OUTCOME_UNIMPLEMENTED = "unimplemented"


@dataclass(frozen=True)
class Story:
    """One nest E2E story (trunk / branch / leaf)."""

    id: str
    level: str
    covers: tuple[str, ...]
    monitors: int = 1
    expected_fail: bool = False
    parent: Optional[str] = None
    children: tuple[str, ...] = ()
    skip_default_rc: bool = False


StoryRunner = Callable[[Story, Any, str], int]
STORY_RUNNERS: dict[str, StoryRunner] = {}
_BODIES_LOADED = False


def story_runner(story_id: str) -> Callable[[StoryRunner], StoryRunner]:
    """T3 registers a live campaign body for ``story_id``."""

    def deco(fn: StoryRunner) -> StoryRunner:
        STORY_RUNNERS[str(story_id)] = fn
        return fn

    return deco


def _ensure_runners() -> None:
    """Import nest_story_bodies so STORY_RUNNERS is populated."""
    global _BODIES_LOADED
    if _BODIES_LOADED:
        return
    _BODIES_LOADED = True
    import nest_story_bodies as _nest_story_bodies  # noqa: F401


def story_status(story: Story) -> str:
    _ensure_runners()
    if story.id in STORY_RUNNERS:
        return "ready"
    return "unimplemented"


def classify_story_outcome(story: Story, *, status: str, rc: int) -> str:
    """Ready + expected_fail + non-zero → xfail. Unimplemented is never xfail."""
    if status == "unimplemented":
        return OUTCOME_UNIMPLEMENTED
    if int(rc) == 0:
        return OUTCOME_PASS
    if story.expected_fail:
        return OUTCOME_XFAIL
    return OUTCOME_FAIL


def campaign_rc_from_results(results: Sequence[Mapping[str, Any]]) -> int:
    """Hard red only for unimplemented or unexpected fail — not XFAIL alone."""
    unimplemented = False
    fail_rc: Optional[int] = None
    for row in results:
        outcome = str(row.get("outcome") or "")
        if outcome == OUTCOME_UNIMPLEMENTED:
            unimplemented = True
            continue
        if outcome != OUTCOME_FAIL or fail_rc is not None:
            continue
        try:
            fail_rc = int(row.get("rc") or 1)
        except (TypeError, ValueError):
            fail_rc = 1
        if fail_rc == 0:
            fail_rc = 1
    if unimplemented:
        return UNIMPLEMENTED_RC
    if fail_rc is not None:
        return fail_rc
    return 0


def campaign_rc_from_outcomes(outcomes: Sequence[str]) -> int:
    return campaign_rc_from_results(
        [{"outcome": o, "rc": 1} for o in outcomes]
    )


def format_story_outcome_line(story: Story, outcome: str, *, rc: int = 0) -> str:
    sid = story.id
    if outcome == OUTCOME_XFAIL:
        return f"XFAIL {sid}  expected-fail rc={rc}"
    if outcome == OUTCOME_FAIL:
        return f"FAIL {sid}  rc={rc}"
    if outcome == OUTCOME_PASS:
        extra = "  expected-fail: yes" if story.expected_fail else ""
        return f"PASS {sid}{extra}"
    extra = "  expected-fail: yes" if story.expected_fail else ""
    return f"UNIMPLEMENTED {sid}{extra}"


def fail_safe_fixture_exists() -> bool:
    """T3/T5 may flip this when a non-honor TILE fixture exists."""
    return False


def _row(
    sid: str,
    level: str,
    covers: str,
    *,
    monitors: int = 1,
    parent: Optional[str] = None,
    expected_fail: bool = False,
    skip_default_rc: bool = False,
) -> Story:
    cov = tuple(c for c in covers.split() if c)
    if level not in LEVELS:
        raise ValueError(f"bad level {level!r} for {sid}")
    bad = [c for c in cov if c not in COVERS]
    if bad:
        raise ValueError(f"bad covers {bad} for {sid}")
    if not re.match(r"^(trunk|branch|leaf)\.[a-z0-9][a-z0-9.-]*$", sid):
        raise ValueError(f"bad story id {sid!r}")
    return Story(
        id=sid,
        level=level,
        covers=cov,
        monitors=int(monitors),
        expected_fail=bool(expected_fail),
        parent=parent,
        skip_default_rc=bool(skip_default_rc),
    )


def _attach_children(rows: Sequence[Story]) -> tuple[Story, ...]:
    by = {s.id: s for s in rows}
    if len(by) != len(rows):
        raise ValueError("duplicate story id")
    kids: dict[str, list[str]] = {s.id: [] for s in rows}
    for s in rows:
        if not s.parent:
            continue
        if s.parent not in by:
            raise ValueError(f"{s.id} parent {s.parent!r} missing")
        kids[s.parent].append(s.id)
    return tuple(replace(s, children=tuple(kids[s.id])) for s in rows)


# Document order = stories.md ### headings. Do not invent ids.
STORIES: tuple[Story, ...] = _attach_children(
    (
        _row(
            BVHNV_ID,
            "trunk",
            "open",
        ),
        _row(
            "branch.open.launch-into-2slot-other-focus",
            "branch",
            "open",
            parent=BVHNV_ID,
        ),
        _row(
            "branch.open.second-on-empty",
            "branch",
            "open",
            parent=BVHNV_ID,
        ),
        _row(
            "branch.open.launch-into-tab",
            "branch",
            "open tabs",
            parent=BVHNV_ID,
        ),
        _row(
            "leaf.open.launch-next-to-tab-con",
            "leaf",
            "open tabs",
            parent="branch.open.launch-into-tab",
        ),
        _row(
            "branch.open.empty-head-dock",
            "branch",
            "open",
            monitors=2,
            parent=BVHNV_ID,
        ),
        _row(
            "leaf.open.pointer-on-tiled-stays-lft",
            "leaf",
            "open",
            monitors=2,
            parent="branch.open.empty-head-dock",
        ),
        _row(
            "trunk.close.three-equal-one-gone",
            "trunk",
            "close",
        ),
        _row(
            "branch.close.split-unit-peer",
            "branch",
            "close",
            parent="trunk.close.three-equal-one-gone",
        ),
        _row(
            "trunk.tabs.open-leaf-one-slot",
            "trunk",
            "tabs",
        ),
        _row(
            "branch.tabs.reveal-no-shrink",
            "branch",
            "tabs",
            parent="trunk.tabs.open-leaf-one-slot",
        ),
        _row(
            "branch.tabs.stacked-same-slot",
            "branch",
            "tabs",
            parent="trunk.tabs.open-leaf-one-slot",
        ),
        _row(
            "trunk.layout.apply-one-ws",
            "trunk",
            "layout",
        ),
        _row(
            "branch.layout.missing-roles-open",
            "branch",
            "layout open",
            parent="trunk.layout.apply-one-ws",
        ),
        _row(
            "branch.layout.extras-policy",
            "branch",
            "layout close",
            parent="trunk.layout.apply-one-ws",
        ),
        _row(
            "branch.layout.ws2-no-mutate-ws1",
            "branch",
            "layout",
            parent="trunk.layout.apply-one-ws",
        ),
        _row(
            "leaf.layout.apply-tab-open-leaf",
            "leaf",
            "layout tabs",
            parent="trunk.layout.apply-one-ws",
        ),
        _row(
            "leaf.layout.apply-inkscape-ws2",
            "leaf",
            "layout",
            monitors=2,
            parent="trunk.layout.apply-one-ws",
        ),
        _row(
            "trunk.mark2.join-enter",
            "trunk",
            "mark2 tabs",
        ),
        _row(
            "branch.mark2.join-flatten",
            "branch",
            "mark2",
            parent="trunk.mark2.join-enter",
        ),
        _row(
            "branch.mark2.move-swap",
            "branch",
            "mark2",
            parent="trunk.mark2.join-enter",
        ),
        _row(
            "branch.mark2.group-tab",
            "branch",
            "mark2 tabs",
            parent="trunk.mark2.join-enter",
        ),
        _row(
            "leaf.mark2.move-empty-monitor",
            "leaf",
            "mark2",
            monitors=2,
            parent="trunk.mark2.join-enter",
        ),
        _row(
            "leaf.mark2.move-empty-monitor-reverse",
            "leaf",
            "mark2",
            monitors=2,
            parent="trunk.mark2.join-enter",
        ),
        _row(
            "leaf.mark2.join-empty-monitor",
            "leaf",
            "mark2",
            monitors=2,
            parent="trunk.mark2.join-enter",
        ),
        _row(
            "leaf.mark2.pointer-center-group",
            "leaf",
            "mark2 tabs",
            parent="trunk.mark2.join-enter",
        ),
        _row(
            "trunk.float.not-under-monitor",
            "trunk",
            "float",
        ),
        _row(
            "branch.float.retile-into-tiles",
            "branch",
            "float mark2 open",
            parent="trunk.float.not-under-monitor",
        ),
        _row(
            SKIP_RC_ID,
            "leaf",
            "float settle",
            parent="trunk.float.not-under-monitor",
            skip_default_rc=True,
        ),
        _row(
            "trunk.settle.visible-group-ready",
            "trunk",
            "settle layout",
            monitors=2,
        ),
        _row(
            "leaf.settle.visible-first-open",
            "leaf",
            "settle layout tabs",
            parent="trunk.settle.visible-group-ready",
        ),
        _row(
            "branch.settle.buried-peer-background",
            "branch",
            "settle tabs",
            parent="trunk.settle.visible-group-ready",
        ),
        _row(
            "leaf.settle.jitter-same-dest",
            "leaf",
            "settle layout",
            parent="trunk.settle.visible-group-ready",
        ),
    )
)
STORY_BY_ID: dict[str, Story] = {s.id: s for s in STORIES}


def trunks() -> tuple[Story, ...]:
    """Day-to-day core suite: every trunk in stories.md order."""
    return tuple(s for s in STORIES if s.level == "trunk")


def parse_story_ids_from_md(path: Optional[Path] = None) -> tuple[str, ...]:
    text = Path(path or STORIES_MD).read_text(encoding="utf-8")
    return tuple(m.group("id") for m in _HEADING_RE.finditer(text))


def match_stories(token: str) -> list[Story]:
    tok = str(token or "").strip()
    if not tok:
        return []
    exact = [s for s in STORIES if s.id == tok]
    if exact:
        return exact
    prefix = tok + "."
    return [s for s in STORIES if s.id.startswith(prefix)]


def resolve_story_id(
    token: str,
    *,
    want_level: Optional[str] = None,
) -> Story:
    tok = str(token or "").strip()
    hits = match_stories(tok)
    if want_level:
        hits = [s for s in hits if s.level == want_level]
    if not hits:
        hint = want_level or "story"
        raise ValueError(f"unknown {hint} id {tok!r}")
    if len(hits) > 1:
        ids = ", ".join(s.id for s in hits)
        raise ValueError(f"ambiguous {tok!r} matches: {ids}")
    return hits[0]


def walk_down(root: Story) -> list[Story]:
    out = [root]
    stack = list(root.children)
    while stack:
        cid = stack.pop(0)
        child = STORY_BY_ID[cid]
        out.append(child)
        stack.extend(child.children)
    return out


def skip_in_default_rc(story: Story) -> bool:
    if not story.skip_default_rc:
        return False
    return not fail_safe_fixture_exists()


def select_stories(
    *,
    trunk: Optional[str] = None,
    branch: Optional[str] = None,
    rc: bool = False,
    include_skip_rc: bool = False,
) -> list[Story]:
    """Resolve --trunk / --branch / --rc. Exactly one selector."""
    n = sum(bool(x) for x in (trunk, branch, rc))
    if n == 0:
        raise ValueError(
            "need --trunk <id>, --branch <id>, or --rc "
            "(no implicit story default)"
        )
    if n > 1:
        raise ValueError("use only one of --trunk / --branch / --rc")
    if rc:
        out = [
            s
            for s in STORIES
            if include_skip_rc or not skip_in_default_rc(s)
        ]
        return out
    if trunk:
        story = resolve_story_id(trunk, want_level="trunk")
        if story.level != "trunk":
            raise ValueError(f"--trunk requires a trunk id (got {story.id})")
        return [story]
    assert branch is not None
    story = resolve_story_id(branch)
    if story.level == "trunk":
        raise ValueError(
            f"--branch does not select trunks (got {story.id}; use --trunk)"
        )
    return walk_down(story)


def story_flags_set(args: Any) -> bool:
    return bool(
        getattr(args, "story_trunk", None)
        or getattr(args, "story_branch", None)
        or getattr(args, "story_rc", False)
    )


def selection_label(args: Any) -> str:
    if getattr(args, "story_rc", False):
        return "--rc"
    t = getattr(args, "story_trunk", None)
    if t:
        return f"--trunk {t}"
    b = getattr(args, "story_branch", None)
    if b:
        return f"--branch {b}"
    return ""


def select_stories_from_args(args: Any) -> list[Story]:
    return select_stories(
        trunk=getattr(args, "story_trunk", None),
        branch=getattr(args, "story_branch", None),
        rc=bool(getattr(args, "story_rc", False)),
    )


def story_plan_row(story: Story) -> dict[str, Any]:
    return {
        "id": story.id,
        "level": story.level,
        "covers": list(story.covers),
        "monitors": story.monitors,
        "expectedFail": story.expected_fail,
        "parent": story.parent,
        "children": list(story.children),
        "skipDefaultRc": story.skip_default_rc,
        "status": story_status(story),
    }


def format_story_plan(
    stories: Sequence[Story],
    *,
    select: str,
) -> str:
    lines = [
        f"select: {select}",
        f"stories: {len(stories)}",
    ]
    for s in stories:
        ef = "yes" if s.expected_fail else "no"
        lines.append(
            f"  {s.id}  level={s.level}  mons={s.monitors}  "
            f"expected-fail: {ef}  status={story_status(s)}"
        )
    return "\n".join(lines) + "\n"


def _print_unimplemented(stories: Sequence[Story], plan: dict[str, Any], json_out: bool) -> int:
    unimplemented = [s for s in stories if story_status(s) == "unimplemented"]
    plan["unimplemented"] = [s.id for s in unimplemented]
    if json_out:
        print(json.dumps({**plan, "ok": False}, indent=2))
    else:
        sys.stdout.write(format_story_plan(stories, select=str(plan.get("select") or "")))
    n = len(unimplemented)
    trunks = [s.id for s in unimplemented if s.level == "trunk"]
    print(
        f"forge-test nested: {n} unimplemented stor"
        f"{'y' if n == 1 else 'ies'} (not a pass; remaining bodies unimplemented)",
        file=sys.stderr,
    )
    if trunks:
        print(
            "  required trunk(s): " + ", ".join(trunks),
            file=sys.stderr,
        )
    for s in unimplemented:
        ef = " expected-fail: yes" if s.expected_fail else ""
        print(f"  {s.id}  {s.level}{ef}", file=sys.stderr)
    return UNIMPLEMENTED_RC


def _run_live_stories(stories: Sequence[Story], args: Any, nest_name: str) -> int:
    """Start nest via ``_cli_run`` (always-stop unless --keep / --keep-on-fail)."""
    from nest_story_bodies import campaign_argv
    from nested_wayland import _cli_run, stop

    need = max(int(s.monitors) for s in stories)
    user = getattr(args, "monitors", None)
    if user is None:
        args.monitors = need
    else:
        args.monitors = max(int(user), need)
    args.nested_cmd = campaign_argv([s.id for s in stories])
    keep = bool(getattr(args, "keep", False))
    keep_on_fail = bool(getattr(args, "keep_on_fail", False))
    prev_keep = getattr(args, "keep", False)
    args.keep = keep or keep_on_fail
    try:
        rc = int(_cli_run(args, nest_name))
    finally:
        args.keep = prev_keep
    if keep_on_fail and not keep and rc == 0:
        try:
            stop(name=nest_name, force=True)
        except Exception:
            pass
    return rc


def _stop_nest(nest_name: str) -> None:
    from nested_wayland import stop

    try:
        stop(name=nest_name, force=True)
    except Exception:
        pass


def _run_ready_stories(
    ready: Sequence[Story],
    args: Any,
    nest_name: str,
    *,
    json_out: bool,
    plan: dict[str, Any],
) -> int:
    """Run each ready story; XFAIL is not overall red."""
    keep = bool(getattr(args, "keep", False))
    keep_on_fail = bool(getattr(args, "keep_on_fail", False))
    results: list[dict[str, Any]] = []
    for story in ready:
        case_rc = _run_live_stories([story], args, nest_name)
        outcome = classify_story_outcome(
            story, status=story_status(story), rc=case_rc
        )
        print(
            format_story_outcome_line(story, outcome, rc=case_rc),
            file=sys.stderr,
        )
        results.append(
            {
                "id": story.id,
                "outcome": outcome,
                "rc": int(case_rc),
                "expectedFail": story.expected_fail,
            }
        )
        if outcome == OUTCOME_XFAIL and keep_on_fail and not keep:
            _stop_nest(nest_name)
        if outcome == OUTCOME_FAIL and keep_on_fail:
            break
    rc_out = campaign_rc_from_results(results)
    if json_out:
        print(
            json.dumps(
                {**plan, "ok": rc_out == 0, "results": results},
                indent=2,
            )
        )
    return rc_out


def cmd_story_campaign(args: Any, name: str) -> int:
    """``forge-test nested --trunk|--branch|--rc`` (and proof-loop with those)."""
    nest_name = str(name or getattr(args, "nested_name", None) or "forge")
    _ensure_runners()
    try:
        if getattr(args, "suite", None) and story_flags_set(args):
            raise ValueError(
                "cannot combine --suite with --trunk / --branch / --rc"
            )
        stories = select_stories_from_args(args)
        label = selection_label(args)
    except ValueError as e:
        print(f"forge-test nested: {e}", file=sys.stderr)
        return SELECT_ERROR_RC

    dry = bool(getattr(args, "dry_run", False))
    json_out = bool(getattr(args, "json", False))
    plan = {
        "select": label,
        "stories": [story_plan_row(s) for s in stories],
    }
    if dry:
        if json_out:
            print(json.dumps(plan, indent=2))
        else:
            sys.stdout.write(format_story_plan(stories, select=label))
        return 0

    unimplemented = [s for s in stories if story_status(s) == "unimplemented"]
    ready = [s for s in stories if story_status(s) != "unimplemented"]
    if unimplemented:
        # Do not start nest while the selected set still has holes.
        return _print_unimplemented(stories, plan, json_out)
    if not ready:
        return _print_unimplemented(stories, plan, json_out)
    return _run_ready_stories(ready, args, nest_name, json_out=json_out, plan=plan)


def build_module_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="nest_stories.py",
        description=(
            "Nest E2E story catalog (select / dry-run). "
            "Prefer: forge-test nested --trunk|--branch|--rc"
        ),
    )
    p.add_argument(
        "--version",
        action="version",
        version=f"nest_stories.py {VERSION}",
    )
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--trunk", dest="story_trunk", default=None, metavar="ID")
    g.add_argument("--branch", dest="story_branch", default=None, metavar="ID")
    g.add_argument("--rc", dest="story_rc", action="store_true")
    p.add_argument(
        "--dry-run",
        dest="dry_run",
        action="store_true",
        help="Print resolved ids (module CLI always dry-runs)",
    )
    p.add_argument("--json", action="store_true")
    return p


def main(argv: Optional[Sequence[str]] = None) -> int:
    p = build_module_parser()
    args = p.parse_args(list(argv) if argv is not None else None)
    args.dry_run = True
    args.suite = None
    args.nested_name = "forge"
    return cmd_story_campaign(args, "forge")


if __name__ == "__main__":
    raise SystemExit(main())
