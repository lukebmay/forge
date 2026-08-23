#!/usr/bin/env python3
"""plog-query — filter / reprint plog JSONL tape (D066 §8).

Stdlib json + argparse; color via p/pstr + ansi_color.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from collections import deque
from datetime import datetime
from typing import Any, Callable, Deque, Iterable, Mapping, Optional, Sequence, TextIO

try:
    from ansi_color import color_enabled
    from p import ansi_strip, pstr
except ImportError:  # pragma: no cover — package-style import
    from .ansi_color import color_enabled
    from .p import ansi_strip, pstr

PLOG_QUERY_VERSION = "1.0.0"

LEVELS = {
    "trace": 10,
    "debug": 20,
    "info": 30,
    "warn": 40,
    "error": 50,
}

_LEVEL_STYLE = {
    "trace": "+a~",
    "debug": "+c",
    "info": "+n",
    "warn": "+y*",
    "error": "+r*",
}

_FALSEY = frozenset({"0", "false", "no", "off"})
_TRUTHY = frozenset({"1", "true", "yes", "on"})
_TS_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})_(\d{2}):(\d{2}):(\d{2})$")
_REL_RE = re.compile(r"^(\d+)\s*([smhdw])$", re.I)
_COLOR_TOOL_KEYS = ("P_LOG_COLOR", "P_COLOR")

FilterFn = Callable[[Mapping[str, Any]], bool]


def sibling_jsonl_path(file_path: str) -> str:
    """Replace final extension with .jsonl, else append .jsonl."""
    base = os.path.basename(file_path)
    directory = os.path.dirname(file_path)
    i = base.rfind(".")
    name = base[:i] + ".jsonl" if i > 0 else base + ".jsonl"
    return os.path.join(directory, name) if directory else name


def resolve_jsonl_file(explicit: Optional[str] = None) -> str:
    """Positional, else P_LOG_JSONL, else sibling of P_LOG_FILE if it exists."""
    if explicit:
        path = str(explicit)
        if not os.path.isfile(path):
            raise FileNotFoundError(f"plog-query: JSONL not found: {path}")
        return path

    env_j = os.environ.get("P_LOG_JSONL")
    if env_j is not None and str(env_j).strip() != "":
        s = str(env_j).strip()
        lower = s.lower()
        if lower not in _FALSEY:
            if lower in _TRUTHY:
                file_dest = os.environ.get("P_LOG_FILE")
                if not file_dest:
                    raise FileNotFoundError(
                        "plog-query: P_LOG_JSONL is truthy but P_LOG_FILE is unset"
                    )
                path = sibling_jsonl_path(str(file_dest))
            else:
                path = s
            if not os.path.isfile(path):
                raise FileNotFoundError(f"plog-query: JSONL not found: {path}")
            return path

    file_dest = os.environ.get("P_LOG_FILE")
    if file_dest:
        path = sibling_jsonl_path(str(file_dest))
        if os.path.isfile(path):
            return path

    raise FileNotFoundError(
        "plog-query: no JSONL file (pass a path, or set P_LOG_JSONL "
        "/ P_LOG_FILE with an existing sibling .jsonl)"
    )


def timestamp_to_unix(ts: Any) -> Optional[int]:
    m = _TS_RE.match(str(ts))
    if not m:
        return None
    try:
        d = datetime(
            int(m.group(1)),
            int(m.group(2)),
            int(m.group(3)),
            int(m.group(4)),
            int(m.group(5)),
            int(m.group(6)),
        )
        return int(d.timestamp())
    except (ValueError, OSError, OverflowError):
        return None


def parse_time_bound(raw: str, *, now: Optional[int] = None) -> int:
    """Relative (2h/30m/…) as ago from now, or YYYY-MM-DD_HH:MM:SS stamp."""
    s = str(raw).strip()
    m = _REL_RE.match(s)
    if m:
        n = int(m.group(1))
        unit = m.group(2).lower()
        mult = {"s": 1, "m": 60, "h": 3600, "d": 86400, "w": 604800}[unit]
        base = int(time.time()) if now is None else int(now)
        return base - n * mult
    unix = timestamp_to_unix(s)
    if unix is not None:
        return unix
    raise ValueError(
        f"plog-query: invalid time {raw!r} (use 2h/30m/1d or YYYY-MM-DD_HH:MM:SS)"
    )


def parse_level_spec(spec: str) -> FilterFn:
    """name | name+ | 40+ | comma list of names (exact)."""
    exact_names: set[str] = set()
    min_n: Optional[int] = None

    for tok in str(spec).split(","):
        tok = tok.strip().lower()
        if not tok:
            continue
        if tok.endswith("+"):
            base = tok[:-1].strip()
            if not base:
                raise ValueError(f"plog-query: invalid --level {spec!r}")
            if base.isdigit():
                n = int(base)
            elif base in LEVELS:
                n = LEVELS[base]
            else:
                raise ValueError(f"plog-query: unknown level {base!r}")
            min_n = n if min_n is None else min(min_n, n)
            continue
        if tok in LEVELS:
            exact_names.add(tok)
            continue
        if tok.isdigit():
            n = int(tok)
            for name, rank in LEVELS.items():
                if rank == n:
                    exact_names.add(name)
                    break
            else:
                raise ValueError(f"plog-query: unknown levelN {tok!r}")
            continue
        raise ValueError(f"plog-query: unknown level {tok!r}")

    if not exact_names and min_n is None:
        raise ValueError(f"plog-query: empty --level {spec!r}")

    def match(rec: Mapping[str, Any]) -> bool:
        name = str(rec.get("level") or "").strip().lower()
        try:
            level_n = int(rec["levelN"]) if "levelN" in rec and rec["levelN"] is not None else None
        except (TypeError, ValueError):
            level_n = None
        if level_n is None and name in LEVELS:
            level_n = LEVELS[name]
        if name and name in exact_names:
            return True
        if min_n is not None and level_n is not None and level_n >= min_n:
            return True
        return False

    return match


def record_unix(rec: Mapping[str, Any]) -> Optional[int]:
    if "unix" in rec and rec["unix"] is not None:
        try:
            return int(rec["unix"])
        except (TypeError, ValueError):
            pass
    return timestamp_to_unix(rec.get("timestamp"))


def iter_jsonl_records(path: str) -> Iterable[tuple[str, dict[str, Any]]]:
    """Yield (raw_line, obj). Skip blank / non-object / truncated JSON lines."""
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            raw = line.rstrip("\n")
            if not raw.strip():
                continue
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if not isinstance(obj, dict):
                continue
            yield raw, obj


def format_reprint(rec: Mapping[str, Any], *, color_on: bool) -> str:
    """Rebuild D062-like line with optional dim #id after [SESSION]."""
    level = str(rec.get("level") or "").strip().lower()
    ts = str(rec.get("timestamp") or "")
    sid = str(rec.get("sessionId") or "")
    rid = str(rec.get("id") or "")
    text = rec.get("text")
    text_s = "" if text is None else str(text)

    ts_style = "+wR" if level == "error" else "+a"
    level_style = _LEVEL_STYLE.get(level, "+n")
    upper = level.upper() if level else "?"

    out = pstr(ts_style, ts, color="always", end="")
    out += " "
    out += pstr(level_style, upper, color="always", end="")
    out += " "
    out += pstr("+c", f"[{sid}]", color="always", end="")
    if rid:
        out += " "
        out += pstr("+a~", f"#{rid}", color="always", end="")
    out += " | "
    out += text_s
    if not color_on:
        out = ansi_strip(out)
    return out


def query_records(
    path: str,
    *,
    sessions: Optional[Sequence[str]] = None,
    level_spec: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    grep: Optional[str] = None,
    last: int = 30,
    now: Optional[int] = None,
) -> list[tuple[str, dict[str, Any]]]:
    """Return last N matching (raw, obj) pairs in chronological order."""
    filters: list[FilterFn] = []

    if sessions:
        wanted = {str(s) for s in sessions}
        filters.append(lambda r, w=wanted: str(r.get("sessionId") or "") in w)

    if level_spec:
        filters.append(parse_level_spec(level_spec))

    since_u = parse_time_bound(since, now=now) if since else None
    until_u = parse_time_bound(until, now=now) if until else None

    if since_u is not None or until_u is not None:

        def time_match(rec: Mapping[str, Any]) -> bool:
            u = record_unix(rec)
            if u is None:
                return False
            if since_u is not None and u < since_u:
                return False
            if until_u is not None and u > until_u:
                return False
            return True

        filters.append(time_match)

    if grep is not None:
        try:
            gre = re.compile(grep)
        except re.error as err:
            raise ValueError(f"plog-query: invalid --grep: {err}") from err

        def grep_match(rec: Mapping[str, Any], rx=gre) -> bool:
            return rx.search(str(rec.get("text") or "")) is not None

        filters.append(grep_match)

    if last < 0:
        raise ValueError("plog-query: --last must be >= 0")
    buf: Deque[tuple[str, dict[str, Any]]]
    if last == 0:
        buf = deque()
    else:
        buf = deque(maxlen=last)

    for raw, obj in iter_jsonl_records(path):
        if all(fn(obj) for fn in filters):
            buf.append((raw, obj))

    return list(buf)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="plog-query",
        description="Filter and reprint plog JSONL (D066). Default --last 30.",
    )
    p.add_argument(
        "file",
        nargs="?",
        default=None,
        help="JSONL path (default: P_LOG_JSONL or sibling of P_LOG_FILE)",
    )
    p.add_argument(
        "--session",
        action="append",
        default=None,
        metavar="ID",
        help="Session id filter (repeatable; OR)",
    )
    p.add_argument(
        "--level",
        default=None,
        metavar="SPEC",
        help="Level filter: warn, warn+, 40+, or comma list",
    )
    p.add_argument(
        "--since",
        default=None,
        metavar="WHEN",
        help="Lower time bound: 2h / 30m / stamp",
    )
    p.add_argument(
        "--until",
        default=None,
        metavar="WHEN",
        help="Upper time bound: 2h / 30m / stamp",
    )
    p.add_argument(
        "--last",
        type=int,
        default=30,
        metavar="N",
        help="Last N matching records (default 30; 0 = all)",
    )
    p.add_argument(
        "--grep",
        default=None,
        metavar="PATTERN",
        help="Regex on JSONL text field",
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="Emit matching JSONL lines unchanged (no color)",
    )
    p.add_argument(
        "--color",
        nargs="?",
        const="always",
        choices=["auto", "always", "never"],
        default="auto",
        help="When to colorize reprint (default: auto)",
    )
    p.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {PLOG_QUERY_VERSION}",
    )
    return p


def main(
    argv: Optional[Sequence[str]] = None,
    *,
    stdout: Optional[TextIO] = None,
    stderr: Optional[TextIO] = None,
) -> int:
    out = stdout or sys.stdout
    err = stderr or sys.stderr
    parser = build_parser()
    old_out, old_err = sys.stdout, sys.stderr
    try:
        if stdout is not None:
            sys.stdout = out
        if stderr is not None:
            sys.stderr = err
        try:
            args = parser.parse_args(list(argv) if argv is not None else None)
        except SystemExit as e:
            code = e.code
            return int(code) if isinstance(code, int) else (0 if code is None else 1)

        try:
            path = resolve_jsonl_file(args.file)
        except FileNotFoundError as e:
            print(str(e), file=err)
            return 1

        try:
            rows = query_records(
                path,
                sessions=args.session,
                level_spec=args.level,
                since=args.since,
                until=args.until,
                grep=args.grep,
                last=args.last,
            )
        except ValueError as e:
            print(str(e), file=err)
            return 2

        if args.json:
            for raw, _obj in rows:
                out.write(raw if raw.endswith("\n") else raw + "\n")
            return 0

        color_on = color_enabled(
            out,
            cli_mode=args.color,
            tool_color_keys=_COLOR_TOOL_KEYS,
        )
        for _raw, obj in rows:
            out.write(format_reprint(obj, color_on=color_on) + "\n")
        return 0
    finally:
        sys.stdout, sys.stderr = old_out, old_err


if __name__ == "__main__":
    raise SystemExit(main())
