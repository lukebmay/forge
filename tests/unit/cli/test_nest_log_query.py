"""Unit tests for nest plog-query helper (no live gnome-shell)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from nest_log_query import (  # noqa: E402
    CTS_GREP,
    LogQueryError,
    assert_cts_logs,
    build_plog_query_argv,
    classify_records,
    is_tiles_float_mismatch,
    nest_forge_log_paths,
    plog_query_bin,
    query_records,
    record_key,
    records_since,
    snapshot_keys,
)


def test_nest_paths_from_config_home() -> None:
    log, jsonl = nest_forge_log_paths("/state/nested/forge/forge-config")
    assert log == Path("/state/nested/forge/forge.log")
    assert jsonl == Path("/state/nested/forge/forge.jsonl")


def test_nest_paths_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FORGE_CONFIG_HOME", "/tmp/nest/session/forge-config")
    monkeypatch.delenv("FORGE_LOG_FILE", raising=False)
    log, jsonl = nest_forge_log_paths()
    assert log == Path("/tmp/nest/session/forge.log")
    assert jsonl == Path("/tmp/nest/session/forge.jsonl")


def test_nest_paths_explicit_log_file(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FORGE_LOG_FILE", "/custom/hunt.log")
    log, jsonl = nest_forge_log_paths("/ignored/forge-config")
    assert log == Path("/custom/hunt.log")
    assert jsonl == Path("/custom/hunt.jsonl")


def test_plog_query_bin_vendored() -> None:
    bin_path = plog_query_bin()
    assert bin_path.is_file()
    assert bin_path.name == "plog-query"


def test_build_plog_query_argv_json_and_grep() -> None:
    jsonl = Path("/tmp/forge.jsonl")
    argv = build_plog_query_argv(jsonl, grep=CTS_GREP, last=0, json_out=True)
    assert str(jsonl) in argv
    assert "--json" in argv
    assert "--last" in argv
    assert "0" in argv
    assert "--grep" in argv
    assert CTS_GREP in argv
    assert "--color" in argv


def test_classify_fail_render_throw() -> None:
    recs = [
        {
            "text": "metric invariant render-throw from=window-entered-monitor "
            "TypeError: parentNode is null",
        }
    ]
    out = classify_records(recs)
    assert out["ok"] is False
    assert any("render-throw" in f or "parentNode is null" in f for f in out["fails"])


def test_classify_fail_tiles_float_mismatch() -> None:
    rec = {
        "text": "metric drift",
        "payload": {
            "kind": "float-mismatch",
            "reason": "entered-monitor",
            "id": "abc",
        },
    }
    assert is_tiles_float_mismatch(rec) is True
    out = classify_records([rec])
    assert out["ok"] is False
    assert "metric drift" in out["present"]


def test_classify_ok_agree_resync_phase() -> None:
    recs = [
        {"text": "metric agree", "payload": {"ok": True, "reason": "window-map"}},
        {"text": "metric resync", "payload": {"ok": True, "reason": "entered-monitor"}},
        {"text": "layout-apply phase=skeleton applyId=al-x"},
        {"text": "layout-apply-run forest-match ok slots=mon0,mon1"},
    ]
    # forest-match without "failed" is present, not fail
    out = classify_records(recs)
    assert out["ok"] is True
    assert "metric agree" in out["present"]
    assert "metric resync" in out["present"]
    assert "layout-apply phase=" in out["present"]
    assert "forest-match" in out["present"]


def test_classify_forest_match_failed() -> None:
    recs = [
        {
            "text": "layout-apply-run forest-match failed slots=mon0,mon1 "
            "(failsafe off; fix primary path)",
        }
    ]
    out = classify_records(recs)
    assert out["ok"] is False
    assert any("forest-match failed" in f for f in out["fails"])


def test_classify_jitter_is_notice_not_fail() -> None:
    recs = [{"text": "Settle jitter detected; check logs."}]
    out = classify_records(recs)
    assert out["ok"] is True
    assert out["notices"]


def test_records_since_and_snapshot_keys() -> None:
    a = {"id": "1", "text": "metric agree"}
    b = {"id": "2", "text": "metric drift"}
    keys = snapshot_keys([a])
    later = records_since(keys, [a, b])
    assert [record_key(r) for r in later] == [record_key(b)]


def test_query_records_missing_file(tmp_path: Path) -> None:
    missing = tmp_path / "nope.jsonl"
    assert query_records(jsonl=missing) == []


def test_query_records_via_plog_query(tmp_path: Path) -> None:
    jsonl = tmp_path / "forge.jsonl"
    rows = [
        {
            "ts": "2026-08-29T00:00:00Z",
            "level": "info",
            "text": "metric agree",
            "id": "a:1:1",
            "payload": {"ok": True, "reason": "window-map"},
        },
        {
            "ts": "2026-08-29T00:00:01Z",
            "level": "info",
            "text": "noise title-changed",
            "id": "a:1:2",
        },
        {
            "ts": "2026-08-29T00:00:02Z",
            "level": "error",
            "text": "metric invariant render-throw TypeError: parentNode is null",
            "id": "a:1:3",
        },
    ]
    jsonl.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
    recs = query_records(jsonl=jsonl, grep=CTS_GREP, last=0)
    texts = [str(r.get("text") or "") for r in recs]
    assert any("metric agree" in t for t in texts)
    assert any("render-throw" in t for t in texts)
    assert not any("title-changed" in t for t in texts)
    with pytest.raises(LogQueryError, match="log fail"):
        assert_cts_logs([], stage="unit", jsonl=jsonl)
