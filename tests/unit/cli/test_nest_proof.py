"""Unit tests for nest proof catalog / share oracles (no live gnome-shell)."""

from __future__ import annotations

import io
import json
import sys
from argparse import Namespace
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from nest_proof import (  # noqa: E402
    CAP_HOST,
    CAP_NEST,
    HOST_CASES,
    PROOF_CASES,
    STORY_ALIASES,
    SUITE_CORE,
    SUITE_HOST,
    SUITE_RC,
    SUITE_REGRESSION,
    ShareError,
    assert_no_placeholders,
    assert_revealed_matches_bag,
    assert_seed_three,
    assert_sibling_percents_half,
    assert_siblings_fill_half,
    assert_slot_half_width,
    assert_slot_not_third,
    assert_split_percents_half,
    case_plan_row,
    cmd_proof_loop,
    format_plan,
    parse_case_ids,
    parse_suite,
    placeholder_nodes,
    repro_cmd,
    select_proof_cases,
    stuck_third_windows,
    width_ratio,
)
from nest_stories import BVHNV_ID, OUTCOME_XFAIL, Story  # noqa: E402
from nest_story_bodies import TRUNK_IDS  # noqa: E402


def _win(
    wid: object,
    width: float,
    *,
    x: float = 0.0,
    height: float = 1080.0,
    percent: float | None = None,
) -> dict:
    out = {
        "windowId": wid,
        "nodeType": "WINDOW",
        "mode": "TILE",
        "rect": {"x": x, "y": 0, "width": width, "height": height},
    }
    if percent is not None:
        out["percent"] = percent
    return out


MON = {"x": 0.0, "y": 0.0, "width": 1920.0, "height": 1080.0}


def test_parse_suite_and_ids() -> None:
    assert parse_suite(None) == SUITE_CORE
    assert parse_suite("REGRESSION") == SUITE_REGRESSION
    assert parse_suite("smoke") == SUITE_CORE
    assert parse_suite("SMOKE") == SUITE_CORE
    assert parse_suite("rc") == SUITE_RC
    with pytest.raises(ValueError, match="unknown suite"):
        parse_suite("nope")
    assert parse_case_ids("N.close-reflow, smoke-mark2") == (
        "N.close-reflow",
        "smoke-mark2",
    )
    assert parse_case_ids("") == ()


def test_select_core_is_seven_trunks() -> None:
    core = select_proof_cases(suite="core")
    ids = [c.id for c in core]
    assert ids == list(TRUNK_IDS)
    assert BVHNV_ID in ids
    assert "N.close-reflow" not in ids
    assert "N.join-right" not in ids
    assert "N.nest-apps" not in ids
    assert "H.borders" not in ids
    assert "N.wake-approx" not in ids
    assert all(c.capability == CAP_NEST and c.story_id for c in core)
    assert all(case_plan_row(c)["status"] == "ready" for c in core)
    assert all(case_plan_row(c)["expectedFail"] is False for c in core)


def test_select_regression_loops_core_trunks() -> None:
    reg = select_proof_cases(suite="regression")
    chaos = select_proof_cases(suite="chaos")
    core = select_proof_cases(suite="core")
    assert [c.id for c in reg] == [c.id for c in core]
    assert [c.id for c in chaos] == [c.id for c in core]
    assert any(c.monitors == 2 for c in reg)
    assert "H.dual-4k" not in {c.id for c in reg}


def test_select_rc_is_full_tree_minus_fail_safe() -> None:
    from nest_stories import SKIP_RC_ID, STORIES

    rc = select_proof_cases(suite="rc")
    ids = [c.id for c in rc]
    assert BVHNV_ID in ids
    assert SKIP_RC_ID not in ids
    assert "branch.layout.ws2-no-mutate-ws1" in ids
    assert "branch.open.second-on-empty" in ids
    want = [s.id for s in STORIES if not s.skip_default_rc]
    assert ids == want
    unimplemented = [
        c["id"] for c in (case_plan_row(x) for x in rc) if c["status"] != "ready"
    ]
    assert unimplemented == []
    assert "branch.settle.buried-peer-background" in ids
    assert all(case_plan_row(c)["status"] == "ready" for c in rc)


def test_select_host_is_print_only() -> None:
    host = select_proof_cases(suite=SUITE_HOST)
    assert host
    assert all(c.capability == CAP_HOST for c in host)
    assert all(not c.smoke for c in host)
    assert host == list(HOST_CASES)


def test_select_explicit_ids() -> None:
    got = select_proof_cases(
        suite="core", case_ids=("trunk.close.three-equal-one-gone",)
    )
    assert [c.id for c in got] == ["trunk.close.three-equal-one-gone"]
    got = select_proof_cases(suite="core", case_ids=("smoke-mark2",))
    assert got and got[0].id == "trunk.mark2.join-enter"
    got = select_proof_cases(suite="core", case_ids=("N.close-reflow",))
    assert got and got[0].id == "trunk.close.three-equal-one-gone"
    with pytest.raises(ValueError, match="no proof cases"):
        select_proof_cases(suite="core", case_ids=("nope",))


def test_catalog_covers_manual_close_and_join() -> None:
    from nest_stories import STORY_BY_ID

    assert "trunk.close.three-equal-one-gone" in STORY_BY_ID
    assert "trunk.mark2.join-enter" in STORY_BY_ID
    assert STORY_ALIASES["N.close-reflow"] == "trunk.close.three-equal-one-gone"
    assert STORY_ALIASES["smoke-mark2"] == "trunk.mark2.join-enter"
    checks = {m for c in PROOF_CASES for m in c.manual_checks}
    assert "wake" in checks
    assert "borders" in checks
    assert not any(c.id.startswith("N.close") for c in PROOF_CASES)


def test_siblings_fill_half_hsplit() -> None:
    wins = [_win(1, 960), _win(2, 960, x=960)]
    out = assert_siblings_fill_half(wins, MON, stage="t", closed_id="3")
    assert out["axis"] == "hsplit"


def test_siblings_fill_half_vsplit() -> None:
    wins = [
        _win(1, 1920, height=540),
        _win(2, 1920, height=540),
    ]
    out = assert_siblings_fill_half(wins, MON, stage="t")
    assert out["axis"] == "vsplit"


def test_siblings_reject_stuck_third() -> None:
    wins = [_win(1, 640), _win(2, 1280, x=640)]
    assert stuck_third_windows(wins, MON) == ["1"]
    with pytest.raises(ShareError, match="1/3"):
        assert_siblings_fill_half(wins, MON, stage="close-reflow")


def test_siblings_reject_closed_still_present() -> None:
    wins = [_win(1, 960), _win("gone", 960, x=960)]
    with pytest.raises(ShareError, match="still present"):
        assert_siblings_fill_half(wins, MON, stage="t", closed_id="gone")


def test_sibling_percents_half_and_stuck() -> None:
    ok = [_win(1, 960, percent=0.5), _win(2, 960, x=960, percent=0.5)]
    out = assert_sibling_percents_half(ok, stage="t")
    assert out["skipped"] is False
    unset = [_win(1, 960), _win(2, 960, x=960)]
    assert assert_sibling_percents_half(unset, stage="t")["skipped"] is True
    stuck = [_win(1, 960, percent=0.33), _win(2, 960, x=960, percent=0.34)]
    with pytest.raises(ShareError, match="1/3 percent"):
        assert_sibling_percents_half(stuck, stage="close-reflow")


def test_fill_half_rect_ignores_inner_fill_percent() -> None:
    wins = [_win(1, 960, percent=0.5), _win(2, 960, x=960, percent=1.0)]
    out = assert_siblings_fill_half(wins, MON, stage="close-reflow")
    assert out["axis"] == "hsplit"


def test_split_percents_use_parent_kids_not_inner_window() -> None:
    forest = {
        "monitors": [
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "percent": 1,
                "children": [
                    {
                        "nodeType": "CON",
                        "layout": "HSPLIT",
                        "percent": 0.5,
                        "rect": {"x": 0, "y": 0, "width": 960, "height": 1080},
                        "children": [
                            _win(1, 960, percent=1.0),
                        ],
                    },
                    _win(2, 960, x=960, percent=0.5),
                ],
            }
        ]
    }
    out = assert_split_percents_half(forest, stage="close-reflow")
    assert out["skipped"] is False
    assert out["percents"] == [0.5, 0.5]
    stuck = {
        "monitors": [
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "children": [
                    _win(1, 640, percent=0.33),
                    _win(2, 1280, x=640, percent=0.67),
                ],
            }
        ]
    }
    with pytest.raises(ShareError, match="1/3 percent"):
        assert_split_percents_half(stuck, stage="close-reflow")


def test_seed_three_and_placeholders() -> None:
    wins = [
        _win(1, 640, percent=1 / 3),
        _win(2, 640, x=640, percent=1 / 3),
        _win(3, 640, x=1280, percent=1 / 3),
    ]
    seed = assert_seed_three(wins, MON, stage="seed-3")
    assert seed["thirds"] is True
    with pytest.raises(ShareError, match="want 3"):
        assert_seed_three(wins[:2], MON, stage="seed-3")
    forest = {
        "monitors": [
            {
                "nodeType": "MONITOR",
                "children": [
                    _win(1, 960, percent=0.5),
                    {
                        "windowId": "x",
                        "nodeType": "WINDOW",
                        "title": "forge-ph:0:ghostty",
                        "rect": {"x": 960, "y": 0, "width": 960, "height": 1080},
                    },
                ],
            }
        ]
    }
    assert placeholder_nodes(forest)
    with pytest.raises(ShareError, match="forge-ph"):
        assert_no_placeholders(forest, stage="after-close")
    assert_no_placeholders(
        {"monitors": [{"nodeType": "MONITOR", "children": wins[:2]}]},
        stage="after-close",
    )


def test_tab_slot_half_and_mismatch() -> None:
    bag = {
        "layout": "TABBED",
        "nodeType": "CON",
        "rect": {"x": 0, "y": 0, "width": 960, "height": 1080},
    }
    ok = _win("a", 960)
    bad = _win("a", 640)
    assert_slot_half_width(ok, MON, stage="t")
    with pytest.raises(ShareError, match="1/3"):
        assert_slot_half_width(bad, MON, stage="t")
    ratios = assert_revealed_matches_bag(ok, bag, MON, stage="t")
    assert ratios["revealed"] == pytest.approx(0.5, abs=0.01)
    with pytest.raises(ShareError, match="1/3"):
        assert_revealed_matches_bag(bad, bag, MON, stage="tab-click")
    assert width_ratio(bad, MON) == pytest.approx(640 / 1920, abs=0.001)
    assert assert_slot_not_third(_win("full", 1920), MON, stage="t") == pytest.approx(
        1.0, abs=0.01
    )
    with pytest.raises(ShareError, match="1/3"):
        assert_slot_not_third(bad, MON, stage="tab-click")


def test_repro_and_plan_text() -> None:
    core = select_proof_cases(suite="core")
    settle = next(c for c in core if c.id == "trunk.settle.visible-group-ready")
    assert "--trunk" in repro_cmd(settle)
    assert "trunk.settle.visible-group-ready" in repro_cmd(settle)
    assert "--monitors=2" in repro_cmd(settle)
    text = format_plan(core, suite="core")
    assert "trunk.close.three-equal-one-gone" in text
    assert "status=ready" in text
    assert BVHNV_ID in text
    assert "expected-fail: no" in text
    row = case_plan_row(settle)
    assert row["id"] == "trunk.settle.visible-group-ready"
    assert row["monitors"] == 2
    assert row["status"] == "ready"


def test_proof_loop_dry_run_json() -> None:
    args = Namespace(
        suite="core",
        until="fail",
        cases=None,
        dry_run=True,
        json=True,
        hours=None,
        iterations=None,
        seed=1,
        chaos=False,
        keep=False,
        allow_x11=False,
        safe_mode=False,
        no_enable=False,
        size=None,
        scale=None,
        display=None,
        force=False,
        record_queue=None,
    )
    buf = io.StringIO()
    old = sys.stdout
    sys.stdout = buf
    try:
        rc = cmd_proof_loop(args, "forge")
    finally:
        sys.stdout = old
    assert rc == 0
    payload = json.loads(buf.getvalue())
    assert payload["suite"] == "core"
    ids = [c["id"] for c in payload["cases"]]
    assert ids == list(TRUNK_IDS)
    assert all(c.get("status") == "ready" for c in payload["cases"])
    assert all(c.get("expectedFail") is False for c in payload["cases"])
    assert "H.borders" not in ids
    assert "N.close-reflow" not in ids


def test_proof_loop_host_dry_run_exit() -> None:
    args = Namespace(
        suite="host",
        until="fail",
        cases=None,
        dry_run=True,
        json=True,
        hours=None,
        iterations=1,
        seed=1,
        chaos=False,
        keep=False,
        allow_x11=False,
        safe_mode=False,
        no_enable=False,
        size=None,
        scale=None,
        display=None,
        force=False,
        record_queue=None,
    )
    buf = io.StringIO()
    old = sys.stdout
    sys.stdout = buf
    try:
        rc = cmd_proof_loop(args, "forge")
    finally:
        sys.stdout = old
    assert rc == 0
    payload = json.loads(buf.getvalue())
    assert payload["cases"]
    assert all(c["capability"] == CAP_HOST for c in payload["cases"])


def test_hoist_proof_loop_flags() -> None:
    from test_cli import _NESTED_ACTIONS
    from test_cli import hoist_nested_action_flags as hoist

    assert "proof-loop" in _NESTED_ACTIONS
    assert "smoke-close-reflow" in _NESTED_ACTIONS
    argv = [
        "nested",
        "proof-loop",
        "--suite",
        "regression",
        "--hours",
        "8",
        "--dry-run",
    ]
    hoisted = hoist(argv)
    assert hoisted[0] == "nested"
    assert "proof-loop" in hoisted
    assert "--suite" in hoisted
    assert "--hours" in hoisted
    assert "--dry-run" in hoisted
    assert hoisted.index("proof-loop") > hoisted.index("--suite")


def test_forge_test_help_mentions_proof_loop() -> None:
    import cli_ansi
    import test_cli

    cli_ansi.set_color_mode("never")
    buf = io.StringIO()
    test_cli.print_forge_test_help(stream=buf)
    text = buf.getvalue()
    assert "proof-loop" in text
    assert "smoke-close-reflow" in text


def test_parser_accepts_proof_loop() -> None:
    import test_cli

    parser = test_cli.build_parser()
    args = parser.parse_args(
        ["nested", "--suite", "core", "--dry-run", "--iterations", "2", "proof-loop"]
    )
    assert args.nested_action == "proof-loop"
    assert args.suite == "core"
    assert args.dry_run is True
    assert args.iterations == 2


def test_parser_smoke_alias_keep_on_fail_monitors() -> None:
    import test_cli

    parser = test_cli.build_parser()
    args = parser.parse_args(
        [
            "nested",
            "proof-loop",
            "--suite",
            "smoke",
            "--iterations",
            "1",
            "--monitors=2",
            "--keep-on-fail",
            "--fail-fast",
            "--dry-run",
        ]
    )
    assert args.nested_action == "proof-loop"
    assert args.suite == "smoke"
    assert parse_suite(args.suite) == SUITE_CORE
    assert args.iterations == 1
    assert args.monitors == 2
    assert args.keep_on_fail is True
    assert args.fail_fast is True
    assert args.dry_run is True


def _loop_args(**kwargs: object) -> Namespace:
    base = dict(
        suite="core",
        until="fail",
        cases=None,
        dry_run=False,
        json=True,
        hours=None,
        iterations=1,
        seed=1,
        chaos=False,
        keep=False,
        keep_on_fail=False,
        fail_fast=True,
        allow_x11=False,
        safe_mode=False,
        no_enable=False,
        size=None,
        scale=None,
        display=None,
        force=False,
        record_queue=None,
        monitors=2,
        story_trunk=None,
        story_branch=None,
        story_rc=False,
    )
    base.update(kwargs)
    return Namespace(**base)


def test_cmd_proof_loop_fail_records_queue_and_stops(
        monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    import nest_proof as np
    import nested_wayland as nw

    cases = [
        np.ProofCase(
            id="trunk.mark2.join-enter",
            title="join",
            smoke="",
            monitors=1,
            capability=np.CAP_NEST,
            suites=(np.SUITE_CORE, ),
            story_id="trunk.mark2.join-enter",
        ),
        np.ProofCase(
            id="trunk.float.not-under-monitor",
            title="float",
            smoke="",
            monitors=1,
            capability=np.CAP_NEST,
            suites=(np.SUITE_CORE, ),
            story_id="trunk.float.not-under-monitor",
        ),
    ]
    ran: list[str] = []
    stopped: list[str] = []
    keeps: list[bool] = []

    def fake_run(argv: list, **kwargs: object) -> int:
        ran.append(str(argv[0]))
        keeps.append(bool(kwargs.get("keep")))
        assert kwargs.get("num_monitors") == 2
        return 7

    monkeypatch.setattr(np, "select_proof_cases", lambda **k: cases)
    monkeypatch.setattr(np, "loop_argv", lambda c: [c.id])
    monkeypatch.setattr(nw, "can_nested_on_host", lambda *a, **k: True)
    monkeypatch.setattr(nw, "run_campaign", fake_run)
    monkeypatch.setattr(nw, "session_dir", lambda name: tmp_path)
    monkeypatch.setattr(
        nw, "stop", lambda **k: stopped.append(str(k.get("name") or "")))

    fail_path = tmp_path / "fail-queue.jsonl"
    args = _loop_args(record_queue=str(fail_path), keep_on_fail=False)
    buf = io.StringIO()
    err = io.StringIO()
    old, olderr = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = buf, err
    try:
        rc = cmd_proof_loop(args, "forge")
    finally:
        sys.stdout, sys.stderr = old, olderr
    assert rc == 1
    assert ran == ["trunk.mark2.join-enter"]
    assert keeps == [False]
    assert stopped == ["forge"]
    assert fail_path.is_file()
    row = json.loads(fail_path.read_text(encoding="utf-8").splitlines()[0])
    assert row["rc"] == 7
    assert row["id"] == "trunk.mark2.join-enter"
    assert row["monitors"] == 2
    assert row["repro"]
    payload = json.loads(buf.getvalue())
    assert payload["summary"]["failures"] == 1


def test_cmd_proof_loop_keep_on_fail_leaves_nest(
        monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    import nest_proof as np
    import nested_wayland as nw

    cases = [
        np.ProofCase(
            id="trunk.mark2.join-enter",
            title="join",
            smoke="",
            monitors=1,
            capability=np.CAP_NEST,
            suites=(np.SUITE_CORE, ),
            story_id="trunk.mark2.join-enter",
        ),
    ]
    stopped: list[str] = []
    keeps: list[bool] = []

    def fake_run(argv: list, **kwargs: object) -> int:
        keeps.append(bool(kwargs.get("keep")))
        return 3

    monkeypatch.setattr(np, "select_proof_cases", lambda **k: cases)
    monkeypatch.setattr(np, "loop_argv", lambda c: [c.id])
    monkeypatch.setattr(nw, "can_nested_on_host", lambda *a, **k: True)
    monkeypatch.setattr(nw, "run_campaign", fake_run)
    monkeypatch.setattr(nw, "session_dir", lambda name: tmp_path)
    monkeypatch.setattr(
        nw, "stop", lambda **k: stopped.append(str(k.get("name") or "")))

    args = _loop_args(keep_on_fail=True, fail_fast=False, until="keep-going")
    buf = io.StringIO()
    err = io.StringIO()
    old, olderr = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = buf, err
    try:
        rc = cmd_proof_loop(args, "forge")
    finally:
        sys.stdout, sys.stderr = old, olderr
    assert rc == 1
    assert keeps == [True]
    assert stopped == []


def test_proof_loop_rc_unimplemented_no_nest(
        monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    import nest_stories as ns
    import nested_wayland as nw

    nested_calls: list[str] = []
    orig_status = ns.story_status

    def fake_status(story: Story) -> str:
        if story.id == BVHNV_ID:
            return "unimplemented"
        return orig_status(story)

    monkeypatch.setattr(ns, "story_status", fake_status)
    monkeypatch.setattr(
        nw, "can_nested_on_host", lambda *a, **k: nested_calls.append("can") or True
    )
    monkeypatch.setattr(
        nw, "run_campaign", lambda *a, **k: nested_calls.append("run") or 0
    )
    args = _loop_args(suite="rc", dry_run=False, json=True, monitors=None)
    buf = io.StringIO()
    err = io.StringIO()
    old, olderr = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = buf, err
    try:
        rc = cmd_proof_loop(args, "forge")
    finally:
        sys.stdout, sys.stderr = old, olderr
    assert rc == 1
    assert nested_calls == []
    assert "unimplemented" in err.getvalue()
    assert BVHNV_ID in err.getvalue()


def test_proof_loop_xfail_not_hard_red(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    import nest_proof as np
    import nest_stories as ns
    import nested_wayland as nw

    dummy = Story(
        id="leaf.test.xfail-hook",
        level="leaf",
        covers=("open",),
        expected_fail=True,
    )
    other = ns.STORY_BY_ID[BVHNV_ID]
    monkeypatch.setitem(ns.STORY_BY_ID, dummy.id, dummy)
    monkeypatch.setitem(ns.STORY_RUNNERS, dummy.id, lambda *a, **k: 1)
    cases = [np._story_to_case(dummy), np._story_to_case(other)]
    ran: list[str] = []
    stopped: list[str] = []

    def fake_run(argv: list, **kwargs: object) -> int:
        ran.append(str(argv[0]))
        return 5 if argv[0] == dummy.id else 0

    monkeypatch.setattr(np, "select_proof_cases", lambda **k: cases)
    monkeypatch.setattr(np, "loop_argv", lambda c: [c.id])
    monkeypatch.setattr(nw, "can_nested_on_host", lambda *a, **k: True)
    monkeypatch.setattr(nw, "run_campaign", fake_run)
    monkeypatch.setattr(nw, "session_dir", lambda name: tmp_path)
    monkeypatch.setattr(
        nw, "stop", lambda **k: stopped.append(str(k.get("name") or ""))
    )

    args = _loop_args(fail_fast=True, until="fail", keep_on_fail=False)
    buf = io.StringIO()
    err = io.StringIO()
    old, olderr = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = buf, err
    try:
        rc = cmd_proof_loop(args, "forge")
    finally:
        sys.stdout, sys.stderr = old, olderr
    assert rc == 0
    assert ran == [dummy.id, other.id]
    err_text = err.getvalue()
    assert "XFAIL" in err_text
    assert dummy.id in err_text
    assert "expected-fail" in err_text
    payload = json.loads(buf.getvalue())
    assert payload["summary"]["ok"] is True
    assert payload["summary"]["failures"] == 0
    assert payload["summary"]["xfails"] == 1
    assert payload["xfails"][0]["outcome"] == OUTCOME_XFAIL
    assert stopped == ["forge"]


def test_proof_loop_unexpected_fail_still_red(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    import nest_proof as np
    import nest_stories as ns
    import nested_wayland as nw

    dummy = Story(
        id="leaf.test.unexpected-fail-hook",
        level="leaf",
        covers=("open",),
        expected_fail=False,
    )
    other = ns.STORY_BY_ID[BVHNV_ID]
    monkeypatch.setitem(ns.STORY_BY_ID, dummy.id, dummy)
    monkeypatch.setitem(ns.STORY_RUNNERS, dummy.id, lambda *a, **k: 1)
    cases = [np._story_to_case(dummy), np._story_to_case(other)]
    ran: list[str] = []

    def fake_run(argv: list, **kwargs: object) -> int:
        ran.append(str(argv[0]))
        return 6 if argv[0] == dummy.id else 0

    monkeypatch.setattr(np, "select_proof_cases", lambda **k: cases)
    monkeypatch.setattr(np, "loop_argv", lambda c: [c.id])
    monkeypatch.setattr(nw, "can_nested_on_host", lambda *a, **k: True)
    monkeypatch.setattr(nw, "run_campaign", fake_run)
    monkeypatch.setattr(nw, "session_dir", lambda name: tmp_path)
    monkeypatch.setattr(nw, "stop", lambda **k: None)

    args = _loop_args(fail_fast=True, until="fail")
    buf = io.StringIO()
    err = io.StringIO()
    old, olderr = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = buf, err
    try:
        rc = cmd_proof_loop(args, "forge")
    finally:
        sys.stdout, sys.stderr = old, olderr
    assert rc != 0
    assert ran == [dummy.id]
    assert "XFAIL" not in err.getvalue()
    payload = json.loads(buf.getvalue())
    assert payload["summary"]["ok"] is False
    assert payload["summary"]["failures"] == 1
    assert payload["summary"]["xfails"] == 0
