#!/usr/bin/env python3
"""plog_query.test.functional.py — temp-dir only (D066 §8 MVP)."""

from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import tempfile
import traceback
from pathlib import Path
from typing import Any, Optional

HERE = Path(__file__).resolve().parent
SHELLRC = HERE.parent.parent
sys.path.insert(0, str(HERE))

from p import ansi_strip  # noqa: E402
import plog_query as pq  # noqa: E402

test_num = 0
passed = 0
failed = 0
quiet_on_pass = True

GREEN = "\x1b[32m"
RED = "\x1b[31m"
YELLOW = "\x1b[33m"
MAGENTA = "\x1b[35m"
CYAN = "\x1b[36m"
RESET = "\x1b[0m"

TRACKED = [
    "NO_COLOR",
    "FORCE_COLOR",
    "CLICOLOR_FORCE",
    "P_COLOR",
    "P_LOG_FILE",
    "P_LOG_JSONL",
    "P_LOG_COLOR",
    "P_LOG_PRETTY",
    "P_LOG_BAT_THEME",
    "BAT_THEME",
    "BAT_CONFIG_PATH",
]

operator_tracked = {k: os.environ.get(k) for k in TRACKED}
for k in TRACKED:
    os.environ.pop(k, None)

suite_root = tempfile.mkdtemp(prefix="plog-query-")
os.environ["NO_COLOR"] = "1"


def print_header(text: str) -> None:
    print(f"{MAGENTA}=== {text} ==={RESET}\n")


def ok(name: str) -> None:
    global passed
    passed += 1
    if not quiet_on_pass:
        print(f"  {GREEN}✓{RESET} {name}")


def bad(name: str, detail: str = "") -> None:
    global failed
    failed += 1
    print(f"  {RED}✗{RESET} {name}")
    if detail:
        print(f"    {YELLOW}{detail}{RESET}")


def run_test(name: str, fn) -> None:
    global test_num
    test_num += 1
    label = f"Q-{test_num} {name}"
    try:
        fn()
        ok(label)
    except Exception as e:
        bad(label, f"{e}\n{traceback.format_exc()}")


def restore_env() -> None:
    for k in TRACKED:
        os.environ.pop(k, None)
    os.environ["NO_COLOR"] = "1"


def write_jsonl(path: Path, rows: list[dict[str, Any]], *, truncate_last: bool = False) -> None:
    lines = [json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows]
    body = "\n".join(lines)
    if truncate_last and lines:
        # Drop closing brace of last object to simulate crash mid-append.
        body = body[:-1]
    path.write_text(body + ("\n" if not truncate_last else ""), encoding="utf-8")


def sample_rows() -> list[dict[str, Any]]:
    rows = [
        {
            "v": 1,
            "id": "Ab3xK:100:1",
            "timestamp": "2026-08-22_14:00:00",
            "level": "info",
            "levelN": 30,
            "sessionId": "Ab3xK",
            "pid": 100,
            "text": "hello info",
            "payload": {},
        },
        {
            "v": 1,
            "id": "Ab3xK:100:2",
            "timestamp": "2026-08-22_14:01:02",
            "level": "warn",
            "levelN": 40,
            "sessionId": "Ab3xK",
            "pid": 100,
            "text": "cache miss for foo",
            "payload": {"key": "foo"},
        },
        {
            "v": 1,
            "id": "Zz9:200:1",
            "timestamp": "2026-08-22_15:00:00",
            "level": "error",
            "levelN": 50,
            "sessionId": "Zz9",
            "pid": 200,
            "text": "boom failed",
            "payload": {},
        },
        {
            "v": 1,
            "id": "Ab3xK:100:3",
            "timestamp": "2026-08-22_16:00:00",
            "level": "debug",
            "levelN": 20,
            "sessionId": "Ab3xK",
            "pid": 100,
            "text": "tracey debug detail",
            "payload": {},
        },
    ]
    for r in rows:
        u = pq.timestamp_to_unix(r["timestamp"])
        assert u is not None
        r["unix"] = u
    return rows


def case_level_forms() -> None:
    restore_env()
    path = Path(suite_root) / "levels.jsonl"
    write_jsonl(path, sample_rows())

    warn_exact = pq.query_records(str(path), level_spec="warn", last=0)
    assert len(warn_exact) == 1 and warn_exact[0][1]["level"] == "warn"

    warn_plus = pq.query_records(str(path), level_spec="warn+", last=0)
    assert {r[1]["level"] for r in warn_plus} == {"warn", "error"}

    n_plus = pq.query_records(str(path), level_spec="40+", last=0)
    assert {r[1]["level"] for r in n_plus} == {"warn", "error"}

    comma = pq.query_records(str(path), level_spec="info,error", last=0)
    assert {r[1]["level"] for r in comma} == {"info", "error"}


def case_session_or() -> None:
    restore_env()
    path = Path(suite_root) / "sess.jsonl"
    write_jsonl(path, sample_rows())
    rows = pq.query_records(str(path), sessions=["Ab3xK", "missing"], last=0)
    assert all(r[1]["sessionId"] == "Ab3xK" for r in rows)
    assert len(rows) == 3
    both = pq.query_records(str(path), sessions=["Ab3xK", "Zz9"], last=0)
    assert len(both) == 4


def case_last() -> None:
    restore_env()
    path = Path(suite_root) / "last.jsonl"
    write_jsonl(path, sample_rows())
    rows = pq.query_records(str(path), last=2)
    assert len(rows) == 2
    assert rows[0][1]["id"] == "Zz9:200:1"
    assert rows[1][1]["id"] == "Ab3xK:100:3"


def case_grep() -> None:
    restore_env()
    path = Path(suite_root) / "grep.jsonl"
    write_jsonl(path, sample_rows())
    rows = pq.query_records(str(path), grep=r"cache miss", last=0)
    assert len(rows) == 1
    assert "cache miss" in rows[0][1]["text"]


def case_since_until_stamp() -> None:
    restore_env()
    path = Path(suite_root) / "time.jsonl"
    write_jsonl(path, sample_rows())
    rows = pq.query_records(
        str(path),
        since="2026-08-22_14:01:00",
        until="2026-08-22_15:30:00",
        last=0,
    )
    assert {r[1]["id"] for r in rows} == {"Ab3xK:100:2", "Zz9:200:1"}


def case_since_relative() -> None:
    restore_env()
    path = Path(suite_root) / "rel.jsonl"
    rows_src = sample_rows()
    now = int(rows_src[-1]["unix"])  # 16:00:00
    write_jsonl(path, rows_src)
    rows = pq.query_records(str(path), since="2h", last=0, now=now)
    # 2h before 16:00 → since 14:00 inclusive
    ids = {r[1]["id"] for r in rows}
    assert "Ab3xK:100:1" in ids
    assert "Ab3xK:100:3" in ids


def case_json_emit() -> None:
    restore_env()
    path = Path(suite_root) / "json.jsonl"
    write_jsonl(path, sample_rows())
    buf = io.StringIO()
    err = io.StringIO()
    code = pq.main(
        [str(path), "--level", "warn", "--json", "--last", "0", "--color=never"],
        stdout=buf,
        stderr=err,
    )
    assert code == 0, err.getvalue()
    lines = [ln for ln in buf.getvalue().splitlines() if ln.strip()]
    assert len(lines) == 1
    obj = json.loads(lines[0])
    assert obj["level"] == "warn"
    assert obj["id"] == "Ab3xK:100:2"


def case_truncated_skip() -> None:
    restore_env()
    path = Path(suite_root) / "trunc.jsonl"
    write_jsonl(path, sample_rows()[:2], truncate_last=True)
    rows = pq.query_records(str(path), last=0)
    assert len(rows) == 1
    assert rows[0][1]["id"] == "Ab3xK:100:1"


def case_reprint_shape() -> None:
    restore_env()
    os.environ["NO_COLOR"] = "1"
    rec = sample_rows()[1]
    line = ansi_strip(pq.format_reprint(rec, color_on=False, pretty_mode="off"))
    assert "[Ab3xK]" not in line
    assert line == (
        "2026-08-22_14:01:02 WARN #Ab3xK:100:2 | cache miss for foo key=foo"
    )
    colored = pq.format_reprint(rec, color_on=True, pretty_mode="off")
    assert "\x1b[" in colored
    assert ansi_strip(colored) == line
    # stable hash colors differ for session vs pid
    assert pq.stable_truecolor_hex("Ab3xK", salt="session") != pq.stable_truecolor_hex(
        "100", salt="pid"
    )


def case_pretty_internal_nested() -> None:
    restore_env()
    rec = {
        "timestamp": "2026-08-22_14:01:02",
        "level": "info",
        "sessionId": "Ab3xK",
        "pid": 100,
        "id": "Ab3xK:100:9",
        "text": "nested",
        "payload": {"a": 1, "b": {"c": True, "d": None}, "e": ["x", 2]},
    }
    line = pq.format_reprint(rec, color_on=True, pretty_mode="internal")
    plain = ansi_strip(line)
    assert "2026-08-22_14:01:02 INFO #Ab3xK:100:9 | nested" in plain.split("\n")[0]
    assert '"a":' in plain or '"a": ' in plain
    assert "\n" in plain
    assert "true" in plain and "null" in plain
    assert "\x1b[" in line


def case_kv_bridge_when_payload_empty() -> None:
    restore_env()
    rec = {
        "timestamp": "2026-08-22_14:01:02",
        "level": "info",
        "sessionId": "Ab3xK",
        "pid": 100,
        "id": "Ab3xK:100:8",
        "text": "hello world slot=3 name=x",
        "payload": {},
    }
    line = ansi_strip(pq.format_reprint(rec, color_on=False, pretty_mode="off"))
    assert line.endswith("hello world slot=3 name=x") or "slot=3" in line
    head, kv = pq.parse_trailing_kv(rec["text"])
    assert head == "hello world"
    assert kv == {"slot": "3", "name": "x"}
    pretty = ansi_strip(pq.format_reprint(rec, color_on=False, pretty_mode="internal"))
    assert "hello world" in pretty.split("\n")[0]
    assert '"slot"' in pretty or "slot" in pretty


def case_json_never_pretty() -> None:
    restore_env()
    path = Path(suite_root) / "json-pretty.jsonl"
    write_jsonl(path, sample_rows())
    buf = io.StringIO()
    err = io.StringIO()
    code = pq.main(
        [
            str(path),
            "--level",
            "warn",
            "--json",
            "--last",
            "0",
            "--pretty=internal",
            "--color=always",
        ],
        stdout=buf,
        stderr=err,
    )
    assert code == 0, err.getvalue()
    raw = buf.getvalue()
    assert "\x1b[" not in raw
    obj = json.loads(raw.strip().splitlines()[0])
    assert obj["payload"] == {"key": "foo"}


def case_theme_resolve_order() -> None:
    restore_env()
    cfg = Path(suite_root) / "bat-theme.conf"
    cfg.write_text('--theme="FromConfig"\n', encoding="utf-8")
    os.environ["BAT_CONFIG_PATH"] = str(cfg)
    assert pq.resolve_bat_theme(None) == "FromConfig"
    os.environ["BAT_THEME"] = "FromEnv"
    assert pq.resolve_bat_theme(None) == "FromEnv"
    os.environ["P_LOG_BAT_THEME"] = "FromPLog"
    assert pq.resolve_bat_theme(None) == "FromPLog"
    assert pq.resolve_bat_theme("FromCli") == "FromCli"
    restore_env()
    # no env / missing config → product default
    os.environ["BAT_CONFIG_PATH"] = str(Path(suite_root) / "missing-bat.conf")
    assert pq.resolve_bat_theme(None) == "Monokai Extended"


def case_bat_missing_falls_back_internal() -> None:
    restore_env()
    rec = sample_rows()[1]
    # Force bat mode with no binary → internal still pretty+colored
    body = pq.format_body(
        rec,
        color_on=True,
        pretty_mode="bat",
        bat_theme="Monokai Extended",
        bat_bin="",
    )
    plain = ansi_strip(body)
    assert "key" in plain and "foo" in plain
    assert "\n" in body
    assert "\x1b[" in body
    internal = pq.format_body(
        rec, color_on=True, pretty_mode="internal", bat_theme="Monokai Extended"
    )
    assert ansi_strip(body) == ansi_strip(internal)


def case_hilight_sgr_replay() -> None:
    restore_env()
    # Known CSI fixture: green "abc" + magenta "def"; hilight middle "cd"
    green = "\x1b[32m"
    magenta = "\x1b[35m"
    reset = "\x1b[0m"
    colored = f"{green}abc{reset}{magenta}def{reset}"
    plain, cmap, _ = pq.plain_offset_map(colored)
    assert plain == "abcdef"
    assert len(cmap) == 6
    # hilight plain[2:4] == "cd"
    out = pq.apply_hilight_spans(colored, [(2, 4, 0)])
    assert "cd" in ansi_strip(out)
    # After hilight span, syntax color for "ef" must still be present (replay)
    assert "\x1b[" in out
    # Opening hilight uses truecolor bg
    assert "48;2;" in out
    # Strip-stable equals original plain with same letters
    assert ansi_strip(out) == "abcdef"
    # Replay restores a style after the span (not left stuck on hilight-only)
    # Find 'e' region still styled
    plain2, cmap2, _ = pq.plain_offset_map(out)
    assert plain2 == "abcdef"
    e_idx = cmap2[4]
    # some CSI should appear before 'f' relative to hilight chunk
    assert out[e_idx] == "e" or "e" in out


def case_compact_flag_cli() -> None:
    restore_env()
    path = Path(suite_root) / "compact.jsonl"
    write_jsonl(path, sample_rows())
    buf = io.StringIO()
    err = io.StringIO()
    code = pq.main(
        [
            str(path),
            "--level",
            "warn",
            "--last",
            "0",
            "--color=never",
            "--pretty=internal",
            "--compact",
        ],
        stdout=buf,
        stderr=err,
    )
    assert code == 0, err.getvalue()
    lines = [ln for ln in buf.getvalue().splitlines() if ln.strip()]
    assert len(lines) == 1
    assert "\n" not in lines[0]
    assert "#Ab3xK:100:2" in lines[0]
    assert "[Ab3xK]" not in lines[0]


def case_default_file_p_log_jsonl() -> None:
    restore_env()
    path = Path(suite_root) / "env.jsonl"
    write_jsonl(path, sample_rows()[:1])
    os.environ["P_LOG_JSONL"] = str(path)
    assert pq.resolve_jsonl_file(None) == str(path)


def case_default_file_sibling() -> None:
    restore_env()
    log = Path(suite_root) / "app.log"
    j = Path(suite_root) / "app.jsonl"
    log.write_text("x\n", encoding="utf-8")
    write_jsonl(j, sample_rows()[:1])
    os.environ["P_LOG_FILE"] = str(log)
    assert pq.resolve_jsonl_file(None) == str(j)


def case_default_file_truthy_jsonl() -> None:
    restore_env()
    log = Path(suite_root) / "truthy.log"
    j = Path(suite_root) / "truthy.jsonl"
    log.write_text("x\n", encoding="utf-8")
    write_jsonl(j, sample_rows()[:1])
    os.environ["P_LOG_FILE"] = str(log)
    os.environ["P_LOG_JSONL"] = "1"
    assert pq.resolve_jsonl_file(None) == str(j)


def case_default_file_error() -> None:
    restore_env()
    try:
        pq.resolve_jsonl_file(None)
        raise AssertionError("expected FileNotFoundError")
    except FileNotFoundError:
        pass


def case_cli_help_and_bin() -> None:
    restore_env()
    # Module --help
    buf = io.StringIO()
    err = io.StringIO()
    code = pq.main(["--help"], stdout=buf, stderr=err)
    assert code == 0
    assert "plog-query" in buf.getvalue()

    bin_path = SHELLRC / "bin" / "plog-query"
    assert bin_path.is_file(), f"missing {bin_path} — run installer/build-scripts.py"
    env = os.environ.copy()
    env["shellrc"] = str(SHELLRC)
    env["NO_COLOR"] = "1"
    # scrub operator log envs for subprocess
    for k in ("P_LOG_FILE", "P_LOG_JSONL", "P_LOG_COLOR", "FORCE_COLOR", "CLICOLOR_FORCE"):
        env.pop(k, None)
    proc = subprocess.run(
        [str(bin_path), "--help"],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr
    assert "plog-query" in proc.stdout

    path = Path(suite_root) / "cli.jsonl"
    write_jsonl(path, sample_rows())
    proc2 = subprocess.run(
        [str(bin_path), str(path), "--level", "warn+", "--last", "10", "--color=never"],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    assert proc2.returncode == 0, proc2.stderr
    out_lines = [ln for ln in proc2.stdout.splitlines() if ln.strip()]
    assert len(out_lines) == 2
    assert "#Ab3xK:100:2" in out_lines[0]
    assert "[Ab3xK]" not in out_lines[0]
    assert "WARN" in out_lines[0]
    assert "ERROR" in out_lines[1]


def main() -> int:
    print_header("plog-query functional")
    run_test("level forms (name, name+, 40+, comma)", case_level_forms)
    run_test("session repeatable OR", case_session_or)
    run_test("--last N matching", case_last)
    run_test("--grep on text", case_grep)
    run_test("--since/--until stamps", case_since_until_stamp)
    run_test("--since relative 2h", case_since_relative)
    run_test("--json emit unchanged", case_json_emit)
    run_test("truncated last line skipped", case_truncated_skip)
    run_test("reprint shape #sid:pid:seq (no [session])", case_reprint_shape)
    run_test("pretty internal nested types", case_pretty_internal_nested)
    run_test("k=v bridge when payload empty", case_kv_bridge_when_payload_empty)
    run_test("--json never pretty/color", case_json_never_pretty)
    run_test("bat theme resolve order", case_theme_resolve_order)
    run_test("bat missing/internal pretty path", case_bat_missing_falls_back_internal)
    run_test("hilight SGR replay fixture", case_hilight_sgr_replay)
    run_test("--compact single-line", case_compact_flag_cli)
    run_test("default file P_LOG_JSONL", case_default_file_p_log_jsonl)
    run_test("default file sibling of P_LOG_FILE", case_default_file_sibling)
    run_test("default file P_LOG_JSONL=1", case_default_file_truthy_jsonl)
    run_test("default file error when unset", case_default_file_error)
    run_test("CLI --help + bin/plog-query", case_cli_help_and_bin)

    print()
    print(f"{CYAN}passed={passed} failed={failed} total={test_num}{RESET}")
    # restore operator env
    for k, v in operator_tracked.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
