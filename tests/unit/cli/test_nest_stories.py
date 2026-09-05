"""L0: nest story catalog, --trunk/--branch/--rc select, dry-run (no nest)."""

from __future__ import annotations

import io
import json
import subprocess
import sys
from argparse import Namespace
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
_FORGE_TEST = _FORGE_CLI / "forge-test"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from nest_stories import (  # noqa: E402
    BVHNV_ID,
    OUTCOME_FAIL,
    OUTCOME_PASS,
    OUTCOME_UNIMPLEMENTED,
    OUTCOME_XFAIL,
    SKIP_RC_ID,
    STORY_RUNNERS,
    STORIES,
    STORIES_MD,
    Story,
    UNIMPLEMENTED_RC,
    campaign_rc_from_outcomes,
    campaign_rc_from_results,
    classify_story_outcome,
    cmd_story_campaign,
    format_story_outcome_line,
    format_story_plan,
    main as stories_main,
    parse_story_ids_from_md,
    select_stories,
    story_flags_set,
    story_plan_row,
    story_status,
)
from nest_story_bodies import REWRITE_IDS, TRUNK_IDS, campaign_argv  # noqa: E402


def _args(**kwargs: object) -> Namespace:
    base: dict[str, object] = dict(
        story_trunk=None,
        story_branch=None,
        story_rc=False,
        dry_run=False,
        json=False,
        suite=None,
        nested_name="forge",
        monitors=None,
        keep=False,
        keep_on_fail=False,
        nested_cmd=[],
    )
    base.update(kwargs)
    return Namespace(**base)


def test_catalog_matches_stories_md_headings() -> None:
    md_ids = parse_story_ids_from_md(STORIES_MD)
    cat_ids = tuple(s.id for s in STORIES)
    assert md_ids
    assert all(i.startswith(("trunk.", "branch.", "leaf.")) for i in md_ids)
    assert cat_ids == md_ids
    assert BVHNV_ID in cat_ids
    assert SKIP_RC_ID in cat_ids
    assert len(cat_ids) == 33
    assert "leaf.layout.apply-inkscape-ws2" in cat_ids
    assert "leaf.settle.jitter-same-dest" in cat_ids
    assert "leaf.mark2.move-empty-monitor-reverse" in cat_ids
    assert "leaf.mark2.join-empty-monitor" in cat_ids


def test_expected_fail_cleared_on_launch_into_2slot() -> None:
    ef = [s.id for s in STORIES if s.expected_fail]
    assert ef == []
    bvh = next(s for s in STORIES if s.id == BVHNV_ID)
    assert bvh.expected_fail is False
    assert story_status(bvh) == "ready"


def test_trunk_runners_registered() -> None:
    for sid in TRUNK_IDS:
        assert sid in STORY_RUNNERS, sid
        story = next(s for s in STORIES if s.id == sid)
        assert story_status(story) == "ready"
    for sid in REWRITE_IDS:
        assert sid in STORY_RUNNERS, sid
        assert story_status(next(s for s in STORIES if s.id == sid)) == "ready"
    assert story_status(
        next(s for s in STORIES if s.id == "branch.open.second-on-empty")
    ) == "ready"
    assert story_status(
        next(s for s in STORIES if s.id == "branch.open.empty-head-dock")
    ) == "ready"
    assert story_status(
        next(s for s in STORIES if s.id == "branch.open.launch-into-tab")
    ) == "ready"
    assert story_status(
        next(s for s in STORIES if s.id == "branch.layout.extras-policy")
    ) == "ready"
    assert story_status(
        next(s for s in STORIES if s.id == "branch.float.retile-into-tiles")
    ) == "ready"
    assert story_status(
        next(s for s in STORIES if s.id == "branch.settle.buried-peer-background")
    ) == "ready"
    assert story_status(
        next(s for s in STORIES if s.id == SKIP_RC_ID)
    ) == "unimplemented"


def test_trunk_prefix_unique_open() -> None:
    got = select_stories(trunk="trunk.open")
    assert [s.id for s in got] == [BVHNV_ID]
    got = select_stories(trunk=BVHNV_ID)
    assert [s.id for s in got] == [BVHNV_ID]


def test_trunk_is_that_trunk_only() -> None:
    got = select_stories(trunk="trunk.open")
    assert got[0].children  # has branches, but select does not walk
    assert all(s.level == "trunk" for s in got)
    assert [s.id for s in got] == [BVHNV_ID]


def test_inkscape_ws2_leaf_requests_two_monitors() -> None:
    story = next(s for s in STORIES if s.id == "leaf.layout.apply-inkscape-ws2")
    assert story.level == "leaf"
    assert story.monitors == 2
    assert story.parent == "trunk.layout.apply-one-ws"
    assert story.expected_fail is False
    assert story_status(story) == "ready"


def test_branch_walks_descendant_leaves() -> None:
    got = select_stories(branch="branch.open.launch-into-tab")
    assert [s.id for s in got] == [
        "branch.open.launch-into-tab",
        "leaf.open.launch-next-to-tab-con",
    ]
    one = select_stories(branch="branch.layout.ws2-no-mutate-ws1")
    assert [s.id for s in one] == ["branch.layout.ws2-no-mutate-ws1"]


def test_branch_rejects_trunk() -> None:
    with pytest.raises(ValueError, match="does not select trunks"):
        select_stories(branch=BVHNV_ID)


def test_trunk_rejects_branch_id() -> None:
    with pytest.raises(ValueError, match="unknown trunk"):
        select_stories(trunk="branch.layout.ws2-no-mutate-ws1")


def test_ambiguous_and_unknown() -> None:
    with pytest.raises(ValueError, match="ambiguous"):
        select_stories(trunk="trunk")
    with pytest.raises(ValueError, match="unknown"):
        select_stories(trunk="nope.not-a-story")
    with pytest.raises(ValueError, match="need --trunk"):
        select_stories()
    with pytest.raises(ValueError, match="only one"):
        select_stories(trunk="trunk.open", rc=True)


def test_rc_includes_bvh_excludes_fail_safe() -> None:
    got = select_stories(rc=True)
    ids = [s.id for s in got]
    assert BVHNV_ID in ids
    assert SKIP_RC_ID not in ids
    assert "trunk.settle.visible-group-ready" in ids
    assert "branch.layout.ws2-no-mutate-ws1" in ids
    assert ids == [s.id for s in STORIES if not s.skip_default_rc]
    with_skip = select_stories(rc=True, include_skip_rc=True)
    assert SKIP_RC_ID in [s.id for s in with_skip]


def test_dry_run_prints_resolved_ids_and_expected_fail() -> None:
    buf = io.StringIO()
    old = sys.stdout
    sys.stdout = buf
    try:
        rc = cmd_story_campaign(
            _args(story_trunk="trunk.open", dry_run=True, json=True),
            "forge",
        )
    finally:
        sys.stdout = old
    assert rc == 0
    payload = json.loads(buf.getvalue())
    assert payload["select"] == "--trunk trunk.open"
    ids = [s["id"] for s in payload["stories"]]
    assert ids == [BVHNV_ID]
    row = payload["stories"][0]
    assert row["expectedFail"] is False
    assert row["status"] == "ready"
    assert row["level"] == "trunk"

    text_buf = io.StringIO()
    sys.stdout = text_buf
    try:
        rc = cmd_story_campaign(
            _args(story_trunk="trunk.open", dry_run=True, json=False),
            "forge",
        )
    finally:
        sys.stdout = old
    assert rc == 0
    text = text_buf.getvalue()
    assert BVHNV_ID in text
    assert "expected-fail: no" in text
    assert "status=ready" in text


def test_dry_run_rc_includes_bvh() -> None:
    buf = io.StringIO()
    old = sys.stdout
    sys.stdout = buf
    try:
        rc = cmd_story_campaign(_args(story_rc=True, dry_run=True, json=True), "forge")
    finally:
        sys.stdout = old
    assert rc == 0
    payload = json.loads(buf.getvalue())
    ids = [s["id"] for s in payload["stories"]]
    assert BVHNV_ID in ids
    assert SKIP_RC_ID not in ids
    assert payload["select"] == "--rc"


def test_unimplemented_branch_nonzero_no_nest() -> None:
    buf = io.StringIO()
    err = io.StringIO()
    old, olderr = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = buf, err
    try:
        rc = cmd_story_campaign(
            _args(story_branch=SKIP_RC_ID, dry_run=False),
            "forge",
        )
    finally:
        sys.stdout, sys.stderr = old, olderr
    assert rc == UNIMPLEMENTED_RC
    assert SKIP_RC_ID in err.getvalue()
    assert "unimplemented" in err.getvalue()


def test_live_trunk_uses_cli_run_always_stop(monkeypatch: pytest.MonkeyPatch) -> None:
    import nested_wayland as nw

    seen: dict[str, object] = {}

    def fake_cli_run(args: Namespace, name: str) -> int:
        seen["name"] = name
        seen["cmd"] = list(args.nested_cmd)
        seen["monitors"] = args.monitors
        seen["keep"] = bool(getattr(args, "keep", False))
        return 0

    monkeypatch.setattr(nw, "_cli_run", fake_cli_run)
    rc = cmd_story_campaign(_args(story_trunk="trunk.open", dry_run=False), "forge")
    assert rc == 0
    assert seen["name"] == "forge"
    assert seen["monitors"] == 1
    assert seen["keep"] is False
    cmd = " ".join(str(x) for x in seen["cmd"])  # type: ignore[arg-type]
    assert "nest_story_bodies.py" in cmd
    assert BVHNV_ID in cmd
    argv = campaign_argv([BVHNV_ID])
    assert argv[-1] == BVHNV_ID


def test_live_settle_trunk_requests_two_monitors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import nested_wayland as nw

    seen: dict[str, object] = {}

    def fake_cli_run(args: Namespace, name: str) -> int:
        seen["monitors"] = args.monitors
        seen["cmd"] = list(args.nested_cmd)
        return 0

    monkeypatch.setattr(nw, "_cli_run", fake_cli_run)
    rc = cmd_story_campaign(
        _args(story_trunk="trunk.settle.visible-group-ready", dry_run=False),
        "forge",
    )
    assert rc == 0
    assert seen["monitors"] == 2
    cmd = " ".join(str(x) for x in seen["cmd"])  # type: ignore[arg-type]
    assert "trunk.settle.visible-group-ready" in cmd


def test_live_keep_on_fail_keeps_nest(monkeypatch: pytest.MonkeyPatch) -> None:
    import nested_wayland as nw

    seen: dict[str, object] = {}
    stops: list[str] = []

    def fake_cli_run(args: Namespace, name: str) -> int:
        seen["keep"] = bool(getattr(args, "keep", False))
        return 7

    monkeypatch.setattr(nw, "_cli_run", fake_cli_run)
    monkeypatch.setattr(
        nw, "stop", lambda **kw: stops.append(str(kw.get("name") or "")) or True
    )
    rc = cmd_story_campaign(
        _args(story_trunk="trunk.open", dry_run=False, keep_on_fail=True),
        "forge",
    )
    assert rc == 7
    assert seen["keep"] is True
    assert stops == []


def test_live_keep_on_fail_stops_after_pass(monkeypatch: pytest.MonkeyPatch) -> None:
    import nested_wayland as nw

    stops: list[str] = []

    monkeypatch.setattr(nw, "_cli_run", lambda args, name: 0)
    monkeypatch.setattr(
        nw, "stop", lambda **kw: stops.append(str(kw.get("name") or "")) or True
    )
    rc = cmd_story_campaign(
        _args(story_trunk="trunk.open", dry_run=False, keep_on_fail=True),
        "forge",
    )
    assert rc == 0
    assert stops == ["forge"]


def test_suite_plus_story_flags_errors() -> None:
    err = io.StringIO()
    old = sys.stderr
    sys.stderr = err
    try:
        rc = cmd_story_campaign(
            _args(story_rc=True, suite="core", dry_run=True),
            "forge",
        )
    finally:
        sys.stderr = old
    assert rc == 2
    assert "--suite" in err.getvalue()


def test_story_flags_set() -> None:
    assert story_flags_set(_args(story_trunk="trunk.open")) is True
    assert story_flags_set(_args(story_rc=True)) is True
    assert story_flags_set(_args()) is False


def test_format_plan_and_row() -> None:
    stories = select_stories(trunk="trunk.open")
    text = format_story_plan(stories, select="--trunk trunk.open")
    assert "expected-fail: no" in text
    row = story_plan_row(stories[0])
    assert row["id"] == BVHNV_ID
    assert row["expectedFail"] is False


def test_parser_accepts_trunk_branch_rc() -> None:
    import test_cli

    parser = test_cli.build_parser()
    args = parser.parse_args(["nested", "--trunk", "trunk.open", "--dry-run"])
    assert args.nested_action == "status"
    assert args.story_trunk == "trunk.open"
    assert args.dry_run is True
    assert args.story_rc is False
    args = parser.parse_args(
        ["nested", "--branch", "branch.layout.ws2-no-mutate-ws1"]
    )
    assert args.story_branch == "branch.layout.ws2-no-mutate-ws1"
    args = parser.parse_args(["nested", "--rc", "--json"])
    assert args.story_rc is True
    args = parser.parse_args(
        ["nested", "--trunk", BVHNV_ID, "--dry-run", "proof-loop"]
    )
    assert args.nested_action == "proof-loop"
    assert args.story_trunk == BVHNV_ID
    with pytest.raises(SystemExit):
        parser.parse_args(["nested", "--trunk", "trunk.open", "--rc"])


def test_hoist_story_flags_after_proof_loop() -> None:
    from test_cli import _NESTED_ACTIONS
    from test_cli import hoist_nested_action_flags as hoist

    assert "proof-loop" in _NESTED_ACTIONS
    hoisted = hoist(
        ["nested", "proof-loop", "--trunk", "trunk.open", "--dry-run"]
    )
    assert hoisted[0] == "nested"
    assert "--trunk" in hoisted
    assert "trunk.open" in hoisted
    assert "--dry-run" in hoisted
    assert hoisted.index("proof-loop") > hoisted.index("--trunk")
    hoisted_rc = hoist(["nested", "proof-loop", "--rc", "--dry-run"])
    assert "--rc" in hoisted_rc
    assert hoisted_rc.index("proof-loop") > hoisted_rc.index("--rc")


def test_nested_help_documents_story_flags() -> None:
    proc = subprocess.run(
        [sys.executable, str(_FORGE_TEST), "nested", "--help"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0
    text = proc.stdout
    assert "--trunk" in text
    assert "--branch" in text
    assert "--rc" in text
    assert "--dry-run" in text
    assert "trunk.open" in text
    assert "XFAIL" in text


def test_overview_help_mentions_trunk() -> None:
    import cli_ansi
    import test_cli

    cli_ansi.set_color_mode("never")
    buf = io.StringIO()
    test_cli.print_forge_test_help(stream=buf)
    text = buf.getvalue()
    assert "--trunk" in text
    assert "--rc" in text


def test_cmd_nested_routes_story_flags() -> None:
    import nested_wayland as nw

    buf = io.StringIO()
    old = sys.stdout
    sys.stdout = buf
    try:
        rc = nw.cmd_nested(
            None,
            _args(story_trunk="trunk.open", dry_run=True, json=True),
        )
    finally:
        sys.stdout = old
    assert rc == 0
    payload = json.loads(buf.getvalue())
    assert payload["stories"][0]["id"] == BVHNV_ID


def test_smoke_close_reflow_alias_routes_to_close_trunk(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import nested_wayland as nw
    import nest_stories as ns

    seen: dict[str, object] = {}

    def fake_campaign(args: Namespace, name: str) -> int:
        seen["name"] = name
        seen["trunk"] = getattr(args, "story_trunk", None)
        seen["branch"] = getattr(args, "story_branch", None)
        return 0

    monkeypatch.setattr(ns, "cmd_story_campaign", fake_campaign)
    rc = nw.cmd_nested(
        None,
        _args(nested_action="smoke-close-reflow"),
    )
    assert rc == 0
    assert seen["trunk"] == "trunk.close.three-equal-one-gone"
    assert seen["branch"] is None


def test_cmd_nested_rejects_story_flags_with_smoke() -> None:
    import nested_wayland as nw

    err = io.StringIO()
    old = sys.stderr
    sys.stderr = err
    try:
        rc = nw.cmd_nested(
            None,
            _args(
                nested_action="smoke-close-reflow",
                story_trunk="trunk.open",
            ),
        )
    finally:
        sys.stderr = old
    assert rc == 2
    assert "cannot combine" in err.getvalue()


def test_proof_loop_story_flags_not_legacy_suite() -> None:
    from nest_proof import cmd_proof_loop

    buf = io.StringIO()
    old = sys.stdout
    sys.stdout = buf
    try:
        rc = cmd_proof_loop(
            _args(story_rc=True, dry_run=True, json=True),
            "forge",
        )
    finally:
        sys.stdout = old
    assert rc == 0
    payload = json.loads(buf.getvalue())
    ids = [s["id"] for s in payload["stories"]]
    assert BVHNV_ID in ids
    assert "N.close-reflow" not in ids
    assert "N.join-right" not in ids


def _hook_story(sid: str, *, expected_fail: bool) -> Story:
    return Story(
        id=sid,
        level="leaf",
        covers=("open",),
        expected_fail=expected_fail,
    )


def test_classify_xfail_vs_unimplemented_vs_fail() -> None:
    xfail = _hook_story("leaf.test.xfail-hook", expected_fail=True)
    unimp = _hook_story("leaf.test.unimp-hook", expected_fail=True)
    boom = _hook_story("leaf.test.unexpected-fail-hook", expected_fail=False)
    assert classify_story_outcome(xfail, status="ready", rc=3) == OUTCOME_XFAIL
    assert classify_story_outcome(unimp, status="unimplemented", rc=3) == (
        OUTCOME_UNIMPLEMENTED
    )
    assert classify_story_outcome(boom, status="ready", rc=3) == OUTCOME_FAIL
    assert classify_story_outcome(xfail, status="ready", rc=0) == OUTCOME_PASS
    assert campaign_rc_from_outcomes([OUTCOME_XFAIL, OUTCOME_PASS]) == 0
    assert campaign_rc_from_outcomes([OUTCOME_XFAIL, OUTCOME_FAIL]) != 0
    assert (
        campaign_rc_from_outcomes([OUTCOME_UNIMPLEMENTED, OUTCOME_PASS])
        == UNIMPLEMENTED_RC
    )
    assert (
        campaign_rc_from_results(
            [
                {"outcome": OUTCOME_XFAIL, "rc": 3},
                {"outcome": OUTCOME_PASS, "rc": 0},
            ]
        )
        == 0
    )
    assert (
        campaign_rc_from_results(
            [
                {"outcome": OUTCOME_FAIL, "rc": 4},
                {"outcome": OUTCOME_PASS, "rc": 0},
            ]
        )
        == 4
    )
    line = format_story_outcome_line(xfail, OUTCOME_XFAIL, rc=3)
    assert "XFAIL" in line
    assert "expected-fail" in line
    assert xfail.id in line


def test_campaign_xfail_plus_pass_is_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    import nest_stories as ns

    dummy = _hook_story("leaf.test.xfail-hook", expected_fail=True)
    other = next(s for s in STORIES if s.id == BVHNV_ID)
    rcs = {dummy.id: 3, other.id: 0}
    ran: list[str] = []

    monkeypatch.setattr(ns, "select_stories_from_args", lambda args: [dummy, other])
    monkeypatch.setattr(ns, "story_status", lambda s: "ready")

    def fake_run(stories: list[Story], args: Namespace, name: str) -> int:
        assert len(stories) == 1
        ran.append(stories[0].id)
        return rcs[stories[0].id]

    monkeypatch.setattr(ns, "_run_live_stories", fake_run)
    buf = io.StringIO()
    err = io.StringIO()
    old, olderr = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = buf, err
    try:
        rc = cmd_story_campaign(_args(story_rc=True, json=True), "forge")
    finally:
        sys.stdout, sys.stderr = old, olderr
    assert rc == 0
    assert ran == [dummy.id, other.id]
    err_text = err.getvalue()
    assert "XFAIL" in err_text
    assert dummy.id in err_text
    assert "expected-fail" in err_text
    payload = json.loads(buf.getvalue())
    assert payload["ok"] is True
    outcomes = {r["id"]: r["outcome"] for r in payload["results"]}
    assert outcomes[dummy.id] == OUTCOME_XFAIL
    assert outcomes[other.id] == OUTCOME_PASS


def test_campaign_unexpected_fail_is_nonzero(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import nest_stories as ns

    dummy = _hook_story("leaf.test.unexpected-fail-hook", expected_fail=False)
    other = next(s for s in STORIES if s.id == BVHNV_ID)
    rcs = {dummy.id: 4, other.id: 0}

    monkeypatch.setattr(ns, "select_stories_from_args", lambda args: [dummy, other])
    monkeypatch.setattr(ns, "story_status", lambda s: "ready")
    monkeypatch.setattr(
        ns,
        "_run_live_stories",
        lambda stories, args, name: rcs[stories[0].id],
    )
    buf = io.StringIO()
    err = io.StringIO()
    old, olderr = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = buf, err
    try:
        rc = cmd_story_campaign(_args(story_rc=True, json=True), "forge")
    finally:
        sys.stdout, sys.stderr = old, olderr
    assert rc == 4
    assert "XFAIL" not in err.getvalue()
    assert dummy.id in err.getvalue()
    payload = json.loads(buf.getvalue())
    assert payload["ok"] is False
    outcomes = {r["id"]: r["outcome"] for r in payload["results"]}
    assert outcomes[dummy.id] == OUTCOME_FAIL
    assert outcomes[other.id] == OUTCOME_PASS


def test_campaign_unimplemented_not_xfail(monkeypatch: pytest.MonkeyPatch) -> None:
    import nest_stories as ns

    dummy = _hook_story("leaf.test.unimp-hook", expected_fail=True)
    other = next(s for s in STORIES if s.id == BVHNV_ID)
    ran: list[str] = []

    monkeypatch.setattr(ns, "select_stories_from_args", lambda args: [dummy, other])

    def status(story: Story) -> str:
        return "unimplemented" if story.id == dummy.id else "ready"

    monkeypatch.setattr(ns, "story_status", status)
    monkeypatch.setattr(
        ns,
        "_run_live_stories",
        lambda stories, args, name: ran.append(stories[0].id) or 0,
    )
    buf = io.StringIO()
    err = io.StringIO()
    old, olderr = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = buf, err
    try:
        rc = cmd_story_campaign(_args(story_rc=True, json=True), "forge")
    finally:
        sys.stdout, sys.stderr = old, olderr
    assert rc == UNIMPLEMENTED_RC
    assert ran == []
    err_text = err.getvalue()
    assert "unimplemented" in err_text
    assert dummy.id in err_text
    assert "XFAIL" not in err_text
    payload = json.loads(buf.getvalue())
    assert payload["ok"] is False
    assert dummy.id in payload["unimplemented"]


def test_module_cli_help_version_and_dry_run() -> None:
    script = _FORGE_CLI / "nest_stories.py"
    help_p = subprocess.run(
        [sys.executable, str(script), "--help"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert help_p.returncode == 0
    assert "--trunk" in help_p.stdout
    ver = subprocess.run(
        [sys.executable, str(script), "--version"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert ver.returncode == 0
    buf = io.StringIO()
    old = sys.stdout
    sys.stdout = buf
    try:
        rc = stories_main(["--trunk", "trunk.open", "--json"])
    finally:
        sys.stdout = old
    assert rc == 0
    payload = json.loads(buf.getvalue())
    assert payload["stories"][0]["id"] == BVHNV_ID
