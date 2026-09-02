#!/usr/bin/env python3
"""Query nest forge.jsonl via vendored plog-query (FORGE_CONFIG_HOME sibling).

Do not open the tape with read_file / cat / rg. Campaigns call this helper.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional, Sequence

_SCRIPT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPT_DIR.parents[1]
PLOG_QUERY = _REPO_ROOT / "third_party" / "plog-query" / "plog-query"

# CTS hunt tokens (when present). Fail-loud subset is separate.
CTS_GREP = (
    r"metric (agree|drift|resync)|layout-apply phase=|forest-match|"
    r"render-throw|parentNode is null|disposed|jitter|float-mismatch"
)
FAIL_SUBSTR = (
    "render-throw",
    "parentNode is null",
    "disposed",
    "forest-match failed",
    "required TILE slot(s) not in-slot",
)
JITTER_SUBSTR = (
    "Settle jitter",
    "settle-jitter",
    "jitter notice",
    "jitter detected",
)
TILES_DRIFT_REASONS = (
    "entered-monitor",
    "window-map",
    "window-added",
    "window-entered-monitor",
)


class LogQueryError(RuntimeError):
    """plog-query / nest tape resolution failure."""

    def __init__(self, message: str, *, exit_code: int = 1) -> None:
        super().__init__(message)
        self.exit_code = exit_code


def nest_forge_log_paths(
    config_home: Optional[str] = None,
    *,
    env: Optional[Mapping[str, str]] = None,
) -> tuple[Optional[Path], Optional[Path]]:
    """Resolve nest ``forge.log`` + sibling ``forge.jsonl``.

    Nest Shell sets ``FORGE_CONFIG_HOME=<session>/forge-config``; plog writes
    the hunt tapes as siblings of that dir (``<session>/forge.log``).
    """
    e = env if env is not None else os.environ
    explicit = str(e.get("FORGE_LOG_FILE") or "").strip()
    if explicit:
        log = Path(explicit)
        return log, log.with_suffix(".jsonl")
    raw = (
        config_home
        if config_home is not None
        else str(e.get("FORGE_CONFIG_HOME") or "")
    ).strip()
    if raw:
        log = Path(raw).parent / "forge.log"
        return log, log.with_suffix(".jsonl")
    xdg = str(e.get("XDG_STATE_HOME") or "").strip()
    base = Path(xdg) if xdg else Path.home() / ".local" / "state"
    log = base / "forge" / "forge.log"
    return log, log.with_suffix(".jsonl")


def plog_query_bin() -> Path:
    if PLOG_QUERY.is_file():
        return PLOG_QUERY
    which = shutil.which("plog-query")
    if which:
        return Path(which)
    raise LogQueryError(
        "missing plog-query "
        f"(expected {PLOG_QUERY} or PATH; vendor: third_party/plog-query)",
        exit_code=127,
    )


def build_plog_query_argv(
    jsonl: Path,
    *,
    grep: Optional[str] = None,
    last: int = 0,
    json_out: bool = True,
    level: Optional[str] = None,
) -> list[str]:
    argv = [str(plog_query_bin()), str(jsonl), "--last", str(int(last))]
    if json_out:
        argv.append("--json")
        argv.extend(["--color", "never"])
    if grep:
        argv.extend(["--grep", str(grep)])
    if level:
        argv.extend(["--level", str(level)])
    return argv


def run_cli_query(
    jsonl: Path,
    *,
    grep: Optional[str] = None,
    last: int = 80,
    level: Optional[str] = None,
    json_out: bool = False,
) -> int:
    """Subprocess plog-query onto stdout. Missing tape → LogQueryError (exit 1)."""
    if not jsonl.is_file():
        raise LogQueryError(f"no nest hunt JSONL at {jsonl}", exit_code=1)
    argv = build_plog_query_argv(
        jsonl,
        grep=grep,
        last=last,
        json_out=json_out,
        level=level,
    )
    try:
        proc = subprocess.run(argv, check=False)
    except OSError as e:
        raise LogQueryError(f"plog-query spawn failed: {e}", exit_code=127) from e
    return int(proc.returncode)


def _payload(rec: Mapping[str, Any]) -> dict[str, Any]:
    for key in ("payload", "fields"):
        bag = rec.get(key)
        if isinstance(bag, dict):
            return bag
    return {}


def record_key(rec: Mapping[str, Any]) -> str:
    rid = rec.get("id")
    ts = rec.get("ts") or rec.get("time")
    text = rec.get("text")
    return f"{rid or ''}|{ts or ''}|{text or ''}"


def query_records(
    *,
    jsonl: Optional[Path] = None,
    grep: Optional[str] = None,
    last: int = 0,
    env: Optional[Mapping[str, str]] = None,
    config_home: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Run plog-query --json. Missing tape → empty list (not an error)."""
    path = jsonl
    if path is None:
        _log, path = nest_forge_log_paths(config_home, env=env)
    if path is None or not path.is_file():
        return []
    argv = build_plog_query_argv(path, grep=grep, last=last, json_out=True)
    try:
        proc = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            check=False,
            env=dict(env) if env is not None else None,
        )
    except OSError as e:
        raise LogQueryError(f"plog-query spawn failed: {e}", exit_code=127) from e
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        if "not found" in err.lower() or "JSONL not found" in err:
            return []
        raise LogQueryError(
            f"plog-query exit {proc.returncode}: {err[-800:]}"
        )
    out: list[dict[str, Any]] = []
    for line in (proc.stdout or "").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            out.append(obj)
    return out


def query_cts_records(
    *,
    jsonl: Optional[Path] = None,
    env: Optional[Mapping[str, str]] = None,
    config_home: Optional[str] = None,
) -> list[dict[str, Any]]:
    return query_records(
        jsonl=jsonl,
        grep=CTS_GREP,
        last=0,
        env=env,
        config_home=config_home,
    )


def snapshot_keys(
    recs: Optional[Sequence[Mapping[str, Any]]] = None,
    **query_kw: Any,
) -> list[str]:
    rows = list(recs) if recs is not None else query_cts_records(**query_kw)
    return [record_key(r) for r in rows]


def records_since(
    before_keys: Sequence[str],
    recs: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    seen = set(before_keys)
    out: list[dict[str, Any]] = []
    for r in recs:
        if not isinstance(r, dict):
            continue
        if record_key(r) in seen:
            continue
        out.append(r)
    return out


def record_blob(rec: Mapping[str, Any]) -> str:
    text = str(rec.get("text") or "")
    bag = _payload(rec)
    extra = " ".join(f"{k}={bag[k]}" for k in bag if bag[k] is not None)
    return f"{text} {extra}".strip()


def is_tiles_float_mismatch(rec: Mapping[str, Any]) -> bool:
    """True when metric drift kind=float-mismatch for map/entered-monitor."""
    blob = record_blob(rec)
    bag = _payload(rec)
    kind = str(bag.get("kind") or "")
    reason = str(bag.get("reason") or "")
    if "metric drift" not in blob and "float-mismatch" not in blob:
        return False
    if kind != "float-mismatch" and "float-mismatch" not in blob:
        return False
    hay = f"{reason} {blob}"
    return any(tok in hay for tok in TILES_DRIFT_REASONS)


def classify_records(recs: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Split CTS tokens into fail / notices / present."""
    fails: list[str] = []
    notices: list[str] = []
    present: list[str] = []
    blobs = [record_blob(r) for r in recs]

    def _hit(token: str) -> bool:
        return any(token in b for b in blobs)

    for tok in (
        "metric agree",
        "metric drift",
        "metric resync",
        "layout-apply phase=",
        "forest-match",
    ):
        if _hit(tok):
            present.append(tok)

    for rec, blob in zip(recs, blobs):
        for tok in FAIL_SUBSTR:
            if tok in blob:
                fails.append(blob[:240])
                break
        else:
            if is_tiles_float_mismatch(rec):
                fails.append(blob[:240])
        for tok in JITTER_SUBSTR:
            if tok in blob:
                notices.append(blob[:240])
                break

    # Unique while preserving order
    def _uniq(rows: Iterable[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for r in rows:
            if r in seen:
                continue
            seen.add(r)
            out.append(r)
        return out

    return {
        "ok": not fails,
        "fails": _uniq(fails),
        "notices": _uniq(notices),
        "present": present,
        "n": len(recs),
    }


def assert_cts_logs(
    before_keys: Sequence[str],
    *,
    stage: str,
    jsonl: Optional[Path] = None,
    env: Optional[Mapping[str, str]] = None,
    config_home: Optional[str] = None,
) -> dict[str, Any]:
    recs = records_since(
        before_keys,
        query_cts_records(jsonl=jsonl, env=env, config_home=config_home),
    )
    classified = classify_records(recs)
    classified["stage"] = stage
    if classified["fails"]:
        detail = "; ".join(classified["fails"][:6])
        raise LogQueryError(f"{stage}: log fail: {detail}")
    return classified


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = list(argv) if argv is not None else sys.argv[1:]
    grep = CTS_GREP
    last = 0
    i = 0
    while i < len(args):
        a = args[i]
        if a in ("-h", "--help"):
            print(
                "nest_log_query.py [--grep PAT] [--last N]\n"
                "Query nest forge.jsonl via plog-query. "
                "Uses FORGE_CONFIG_HOME sibling (or FORGE_LOG_FILE)."
            )
            return 0
        if a == "--grep" and i + 1 < len(args):
            grep = args[i + 1]
            i += 2
            continue
        if a.startswith("--grep="):
            grep = a.split("=", 1)[1]
            i += 1
            continue
        if a == "--last" and i + 1 < len(args):
            last = int(args[i + 1])
            i += 2
            continue
        if a.startswith("--last="):
            last = int(a.split("=", 1)[1])
            i += 1
            continue
        print(f"nest_log_query: unknown arg {a!r}", file=sys.stderr)
        return 2
    try:
        recs = query_records(grep=grep, last=last)
    except LogQueryError as e:
        print(f"nest_log_query: {e}", file=sys.stderr)
        return int(getattr(e, "exit_code", 1) or 1)
    for rec in recs:
        print(json.dumps(rec, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
