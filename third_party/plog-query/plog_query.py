#!/usr/bin/env python3
"""plog-query — filter / reprint plog JSONL tape (D066 §8 + D067 pretty).

Stdlib json + argparse; color via p/pstr + ansi_color.
"""

from __future__ import annotations

import argparse
import colorsys
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable, Deque, Iterable, Mapping, Optional, Sequence, TextIO

try:
    from ansi_color import color_enabled
    from p import ansi_strip, pstr
except ImportError:  # pragma: no cover — package-style import
    from .ansi_color import color_enabled
    from .p import ansi_strip, pstr

PLOG_QUERY_VERSION = "1.1.0"

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
_ID_PARTS_RE = re.compile(r"^([^:]+):([^:]+):(.+)$")
_KV_TOKEN_RE = re.compile(r"^([A-Za-z_][\w.-]*)=(.*)$")
_CSI_RE = re.compile(r"\x1b\[([0-9;]*)([@-~])")
_BAT_THEME_RE = re.compile(r"""--theme\s*=\s*(?:"([^"]+)"|'([^']+)'|(\S+))""")

# Rainbow bg cycle for match hilight (truecolor hex without leading H).
_RAINBOW_BG = (
    "c026ff",  # magenta
    "2563eb",  # blue
    "0891b2",  # cyan
    "16a34a",  # green
    "ca8a04",  # yellow
    "dc2626",  # red
)

_PRETTY_CHOICES = ("auto", "bat", "internal", "off", "plain")
_HILIGHT_CHOICES = ("auto", "on", "off")

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


# --- D067 color / pretty helpers -------------------------------------------------


def stable_truecolor_hex(key: str, *, salt: str = "") -> str:
    """Stable HSV→RGB hex for session/pid coloring (query-time only)."""
    digest = hashlib.sha256(f"{salt}\0{key}".encode()).digest()
    h = int.from_bytes(digest[0:2], "big") / 65535.0
    s = 0.55 + (digest[2] / 255.0) * 0.35
    v = 0.72 + (digest[3] / 255.0) * 0.22
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    return f"{int(r * 255):02x}{int(g * 255):02x}{int(b * 255):02x}"


def _luminance_hex(hex6: str) -> float:
    r = int(hex6[0:2], 16)
    g = int(hex6[2:4], 16)
    b = int(hex6[4:6], 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255.0


def split_record_id(rec: Mapping[str, Any]) -> tuple[str, str, str]:
    """Return (sessionId, pid, seq) from fields / id."""
    sid = str(rec.get("sessionId") or "")
    pid = "" if rec.get("pid") is None else str(rec.get("pid"))
    seq = ""
    rid = str(rec.get("id") or "")
    m = _ID_PARTS_RE.match(rid)
    if m:
        if not sid:
            sid = m.group(1)
        if not pid:
            pid = m.group(2)
        seq = m.group(3)
    elif rid:
        seq = rid
    return sid, pid, seq


def payload_nonempty(payload: Any) -> bool:
    if payload is None:
        return False
    if isinstance(payload, dict):
        return len(payload) > 0
    if isinstance(payload, (list, tuple)):
        return len(payload) > 0
    return True


def parse_trailing_kv(text: str) -> tuple[str, dict[str, str]]:
    """Split display-only trailing `k=v` tokens from message text."""
    s = str(text or "")
    if not s or "=" not in s:
        return s, {}
    parts = s.split()
    if not parts:
        return s, {}
    kv: dict[str, str] = {}
    i = len(parts)
    while i > 0:
        m = _KV_TOKEN_RE.match(parts[i - 1])
        if not m:
            break
        kv[m.group(1)] = m.group(2)
        i -= 1
    if not kv or i == len(parts):
        return s, {}
    # Keep insertion order of trailing tokens (left→right).
    ordered = {k: kv[k] for k in list(kv.keys())[::-1]}
    head = " ".join(parts[:i])
    return head, ordered


def _sty(style: str, text: str, *, color_on: bool) -> str:
    if not color_on:
        return text
    return pstr(style, text, color="always", end="")


def _punct(ch: str, *, color_on: bool) -> str:
    return _sty("+a~", ch, color_on=color_on)


def format_json_value(
    value: Any,
    *,
    color_on: bool,
    pretty: bool,
    indent: int = 0,
    indent_step: int = 2,
) -> str:
    """Internal type-colored JSON/k=v renderer (nested objects/arrays)."""
    pad = (" " * (indent * indent_step)) if pretty else ""
    pad_inner = (" " * ((indent + 1) * indent_step)) if pretty else ""

    if value is None:
        return _sty("+a~", "null", color_on=color_on)
    if isinstance(value, bool):
        return _sty("+y", "true" if value else "false", color_on=color_on)
    if isinstance(value, int) and not isinstance(value, bool):
        return _sty("+b", str(value), color_on=color_on)
    if isinstance(value, float):
        return _sty("+b", repr(value), color_on=color_on)
    if isinstance(value, str):
        return _sty("+g", json.dumps(value, ensure_ascii=False), color_on=color_on)

    if isinstance(value, Mapping):
        if not value:
            return _punct("{", color_on=color_on) + _punct("}", color_on=color_on)
        if not pretty:
            parts = []
            for i, (k, v) in enumerate(value.items()):
                if i:
                    parts.append(_punct(",", color_on=color_on) + " ")
                parts.append(_sty("+m", json.dumps(str(k), ensure_ascii=False), color_on=color_on))
                parts.append(_punct(":", color_on=color_on) + " ")
                parts.append(
                    format_json_value(v, color_on=color_on, pretty=False, indent=0)
                )
            return (
                _punct("{", color_on=color_on)
                + " "
                + "".join(parts)
                + " "
                + _punct("}", color_on=color_on)
            )
        lines = [_punct("{", color_on=color_on)]
        items = list(value.items())
        for i, (k, v) in enumerate(items):
            key_s = _sty("+m", json.dumps(str(k), ensure_ascii=False), color_on=color_on)
            rendered = format_json_value(
                v, color_on=color_on, pretty=True, indent=indent + 1
            )
            comma = _punct(",", color_on=color_on) if i < len(items) - 1 else ""
            if "\n" in rendered:
                lines.append(
                    f"{pad_inner}{key_s}{_punct(':', color_on=color_on)} {rendered}{comma}"
                )
            else:
                lines.append(
                    f"{pad_inner}{key_s}{_punct(':', color_on=color_on)} {rendered}{comma}"
                )
        lines.append(f"{pad}{_punct('}', color_on=color_on)}")
        return "\n".join(lines)

    if isinstance(value, (list, tuple)):
        if not value:
            return _punct("[", color_on=color_on) + _punct("]", color_on=color_on)
        if not pretty:
            parts = []
            for i, item in enumerate(value):
                if i:
                    parts.append(_punct(",", color_on=color_on) + " ")
                parts.append(
                    format_json_value(item, color_on=color_on, pretty=False, indent=0)
                )
            return (
                _punct("[", color_on=color_on)
                + " "
                + "".join(parts)
                + " "
                + _punct("]", color_on=color_on)
            )
        lines = [_punct("[", color_on=color_on)]
        for i, item in enumerate(value):
            rendered = format_json_value(
                item, color_on=color_on, pretty=True, indent=indent + 1
            )
            comma = _punct(",", color_on=color_on) if i < len(value) - 1 else ""
            lines.append(f"{pad_inner}{rendered}{comma}")
        lines.append(f"{pad}{_punct(']', color_on=color_on)}")
        return "\n".join(lines)

    # Fallback: stringify unknown
    return _sty("+c", json.dumps(str(value), ensure_ascii=False), color_on=color_on)


def format_fields_compact(
    fields: Mapping[str, Any], *, color_on: bool
) -> str:
    """Compact `key=value` pairs (internal colors)."""
    chunks: list[str] = []
    for k, v in fields.items():
        piece = _sty("+m", str(k), color_on=color_on) + _punct("=", color_on=color_on)
        if isinstance(v, str):
            piece += _sty("+g", v, color_on=color_on)
        else:
            piece += format_json_value(v, color_on=color_on, pretty=False)
        chunks.append(piece)
    return " ".join(chunks)


def find_bat() -> Optional[str]:
    return shutil.which("bat") or shutil.which("batcat")


def bat_config_paths() -> list[str]:
    paths: list[str] = []
    env = os.environ.get("BAT_CONFIG_PATH")
    if env:
        paths.append(env)
    xdg = os.environ.get("XDG_CONFIG_HOME")
    if xdg:
        paths.append(os.path.join(xdg, "bat", "config"))
    home = os.environ.get("HOME")
    if home:
        paths.append(os.path.join(home, ".config", "bat", "config"))
    return paths


def theme_from_bat_config() -> Optional[str]:
    for path in bat_config_paths():
        try:
            with open(path, "r", encoding="utf-8") as fh:
                for line in fh:
                    raw = line.strip()
                    if not raw or raw.startswith("#"):
                        continue
                    m = _BAT_THEME_RE.search(raw)
                    if m:
                        return next(g for g in m.groups() if g)
        except OSError:
            continue
    return None


def resolve_bat_theme(cli_theme: Optional[str] = None) -> str:
    """H4: CLI / P_LOG_BAT_THEME → BAT_THEME → bat config → Monokai Extended."""
    if cli_theme is not None and str(cli_theme).strip() != "":
        return str(cli_theme).strip()
    env_p = os.environ.get("P_LOG_BAT_THEME")
    if env_p is not None and str(env_p).strip() != "":
        return str(env_p).strip()
    env_b = os.environ.get("BAT_THEME")
    if env_b is not None and str(env_b).strip() != "":
        return str(env_b).strip()
    cfg = theme_from_bat_config()
    if cfg:
        return cfg
    return "Monokai Extended"


def bat_colorize_json(text: str, *, theme: str, bat_bin: Optional[str] = None) -> Optional[str]:
    """Run bat JSON highlighter; return None on failure / missing bat."""
    exe = bat_bin if bat_bin is not None else find_bat()
    if not exe:
        return None
    try:
        proc = subprocess.run(
            [
                exe,
                "-l",
                "json",
                "-p",
                "--color=always",
                f"--theme={theme}",
            ],
            input=text,
            capture_output=True,
            text=True,
            check=False,
            env={**os.environ, "NO_COLOR": "", "TERM": os.environ.get("TERM") or "xterm-256color"},
        )
    except OSError:
        return None
    if proc.returncode != 0:
        return None
    out = proc.stdout
    if out.endswith("\n") and not text.endswith("\n"):
        out = out[:-1]
    return out


def resolve_pretty_mode(
    cli: Optional[str],
    *,
    color_on: bool,
    is_tty: bool,
    compact: bool,
) -> str:
    """Return effective engine: bat | internal | off (off = compact plain/colored)."""
    raw = (cli or os.environ.get("P_LOG_PRETTY") or "auto").strip().lower()
    if raw not in _PRETTY_CHOICES:
        raw = "auto"
    if raw == "plain":
        raw = "internal"
    if compact or raw == "off":
        return "off"
    if raw in ("bat", "internal"):
        return raw
    # auto
    if color_on and is_tty:
        return "bat" if find_bat() else "internal"
    return "off"


def body_fields_for_record(rec: Mapping[str, Any]) -> tuple[str, Optional[Any]]:
    """Message lead-in + structured fields (payload preferred, else k=v bridge)."""
    text = rec.get("text")
    text_s = "" if text is None else str(text)
    payload = rec.get("payload")
    if payload_nonempty(payload):
        return text_s, payload
    head, kv = parse_trailing_kv(text_s)
    if kv:
        return head, kv
    return text_s, None


def format_body(
    rec: Mapping[str, Any],
    *,
    color_on: bool,
    pretty_mode: str,
    bat_theme: str,
    bat_bin: Optional[str] = None,
) -> str:
    """Render body after `| ` (may be multi-line when pretty)."""
    message, fields = body_fields_for_record(rec)
    pretty = pretty_mode in ("bat", "internal")

    if fields is None:
        return message

    if pretty and pretty_mode == "bat" and color_on:
        dump = json.dumps(fields, ensure_ascii=False, indent=2)
        # bat_bin="" forces internal fallback (tests / missing binary).
        use_bat: Optional[str]
        if bat_bin is not None:
            use_bat = bat_bin or None
        else:
            use_bat = find_bat()
        bat_out = (
            bat_colorize_json(dump, theme=bat_theme, bat_bin=use_bat)
            if use_bat
            else None
        )
        if bat_out is not None:
            if message:
                return message + "\n" + bat_out
            return bat_out
        # missing/failed bat → internal
        pretty_mode = "internal"

    if pretty:
        rendered = format_json_value(fields, color_on=color_on, pretty=True)
        if message:
            return message + "\n" + rendered
        return rendered

    # compact
    if isinstance(fields, Mapping):
        field_s = format_fields_compact(fields, color_on=color_on)
    else:
        field_s = format_json_value(fields, color_on=color_on, pretty=False)
    if message and field_s:
        return message + " " + field_s
    return message or field_s


def format_id_colored(sid: str, pid: str, seq: str, *, color_on: bool) -> str:
    out = _sty("+a~", "#", color_on=color_on)
    if sid:
        out += _sty(f"+h{stable_truecolor_hex(sid, salt='session')}", sid, color_on=color_on)
    out += _sty("+a~", ":", color_on=color_on)
    if pid:
        out += _sty(f"+h{stable_truecolor_hex(pid, salt='pid')}", pid, color_on=color_on)
    out += _sty("+a~", ":", color_on=color_on)
    out += _sty("+a~", seq, color_on=color_on)
    return out


def format_header(rec: Mapping[str, Any], *, color_on: bool) -> str:
    level = str(rec.get("level") or "").strip().lower()
    ts = str(rec.get("timestamp") or "")
    sid, pid, seq = split_record_id(rec)

    ts_style = "+wR" if level == "error" else "+a"
    level_style = _LEVEL_STYLE.get(level, "+n")
    upper = level.upper() if level else "?"

    out = _sty(ts_style, ts, color_on=color_on)
    out += " "
    out += _sty(level_style, upper, color_on=color_on)
    out += " "
    out += format_id_colored(sid, pid, seq, color_on=color_on)
    return out


# --- Hilight (H5) ----------------------------------------------------------------


@dataclass
class _SgrState:
    bold: bool = False
    dim: bool = False
    italic: bool = False
    underline: bool = False
    fg: str = ""  # full '38;2;…' / '35' / ''
    bg: str = ""

    def copy(self) -> "_SgrState":
        return _SgrState(
            bold=self.bold,
            dim=self.dim,
            italic=self.italic,
            underline=self.underline,
            fg=self.fg,
            bg=self.bg,
        )

    def apply_params(self, params: str) -> None:
        if params == "" or params == "0":
            self.bold = self.dim = self.italic = self.underline = False
            self.fg = self.bg = ""
            return
        nums = [int(x) for x in params.split(";") if x != ""]
        i = 0
        while i < len(nums):
            n = nums[i]
            if n == 0:
                self.bold = self.dim = self.italic = self.underline = False
                self.fg = self.bg = ""
            elif n == 1:
                self.bold = True
                self.dim = False
            elif n == 2:
                self.dim = True
            elif n == 3:
                self.italic = True
            elif n == 4:
                self.underline = True
            elif n == 22:
                self.bold = False
                self.dim = False
            elif n == 23:
                self.italic = False
            elif n == 24:
                self.underline = False
            elif n == 39:
                self.fg = ""
            elif n == 49:
                self.bg = ""
            elif n == 38 and i + 1 < len(nums):
                if nums[i + 1] == 5 and i + 2 < len(nums):
                    self.fg = f"38;5;{nums[i + 2]}"
                    i += 2
                elif nums[i + 1] == 2 and i + 4 < len(nums):
                    self.fg = f"38;2;{nums[i + 2]};{nums[i + 3]};{nums[i + 4]}"
                    i += 4
            elif n == 48 and i + 1 < len(nums):
                if nums[i + 1] == 5 and i + 2 < len(nums):
                    self.bg = f"48;5;{nums[i + 2]}"
                    i += 2
                elif nums[i + 1] == 2 and i + 4 < len(nums):
                    self.bg = f"48;2;{nums[i + 2]};{nums[i + 3]};{nums[i + 4]}"
                    i += 4
            elif 30 <= n <= 37 or 90 <= n <= 97:
                self.fg = str(n)
            elif 40 <= n <= 47 or 100 <= n <= 107:
                self.bg = str(n)
            i += 1

    def encode(self) -> str:
        parts: list[str] = ["0"]
        if self.bold:
            parts.append("1")
        if self.dim:
            parts.append("2")
        if self.italic:
            parts.append("3")
        if self.underline:
            parts.append("4")
        if self.fg:
            parts.append(self.fg)
        if self.bg:
            parts.append(self.bg)
        if len(parts) == 1:
            return "\x1b[0m"
        return "\x1b[" + ";".join(parts) + "m"


def plain_offset_map(colored: str) -> tuple[str, list[int], list[_SgrState]]:
    """Map plain indices → colored indices; SGR state before each colored index."""
    plain_chars: list[str] = []
    cmap: list[int] = []
    state_at: list[_SgrState] = []
    state = _SgrState()
    i = 0
    n = len(colored)
    while i < n:
        if colored[i] == "\x1b":
            m = _CSI_RE.match(colored, i)
            if m:
                if m.group(2) == "m":
                    state.apply_params(m.group(1))
                i = m.end()
                continue
        state_at.append(state.copy())
        plain_chars.append(colored[i])
        cmap.append(i)
        i += 1
    # Sentinel state after last char (for restore-at-end).
    state_at.append(state.copy())
    return "".join(plain_chars), cmap, state_at


def hilight_open_sgr(layer: int) -> str:
    bg = _RAINBOW_BG[layer % len(_RAINBOW_BG)]
    fg = "ffffff" if _luminance_hex(bg) < 0.55 else "000000"
    fr, fg_, fb = int(fg[0:2], 16), int(fg[2:4], 16), int(fg[4:6], 16)
    br, bg_, bb = int(bg[0:2], 16), int(bg[2:4], 16), int(bg[4:6], 16)
    return f"\x1b[0;38;2;{fr};{fg_};{fb};48;2;{br};{bg_};{bb}m"


def apply_hilight_spans(
    colored: str,
    spans: Sequence[tuple[int, int, int]],
) -> str:
    """Replace match spans with hilight+plain; replay SGR after each span.

    spans: (plain_start, plain_end, layer) — end exclusive. Edits apply on the
    original `colored` string from the end so colored indices stay valid.
    """
    if not spans:
        return colored
    plain, cmap, _state_at = plain_offset_map(colored)
    ordered = sorted(spans, key=lambda t: (t[0], t[1]), reverse=True)
    out = colored
    for start, end, layer in ordered:
        if start < 0 or end > len(plain) or start >= end:
            continue
        c_start = cmap[start]
        c_end = cmap[end - 1] + 1
        region_plain = plain[start:end]
        restore_state = _sgr_at_index(colored, c_end)
        chunk = hilight_open_sgr(layer) + region_plain + restore_state.encode()
        out = out[:c_start] + chunk + out[c_end:]
    return out


def _sgr_at_index(colored: str, index: int) -> _SgrState:
    state = _SgrState()
    i = 0
    while i < index and i < len(colored):
        if colored[i] == "\x1b":
            m = _CSI_RE.match(colored, i)
            if m:
                if m.group(2) == "m":
                    state.apply_params(m.group(1))
                i = m.end()
                continue
        i += 1
    return state


def collect_hilight_spans(
    plain_line: str,
    rec: Mapping[str, Any],
    *,
    grep_rx: Optional[re.Pattern[str]],
    sessions: Optional[Sequence[str]],
    level_spec: Optional[str],
) -> list[tuple[int, int, int]]:
    """Locate filter match spans on the strip-stable reprint plain text."""
    spans: list[tuple[int, int, int]] = []
    layer = 0

    if sessions:
        wanted = {str(s) for s in sessions}
        sid = str(rec.get("sessionId") or "")
        if sid and sid in wanted:
            # Prefer `#sid` in header.
            needle = "#" + sid
            idx = plain_line.find(needle)
            if idx >= 0:
                spans.append((idx + 1, idx + 1 + len(sid), layer))
            else:
                idx = plain_line.find(sid)
                if idx >= 0:
                    spans.append((idx, idx + len(sid), layer))
            layer += 1

    if level_spec:
        upper = str(rec.get("level") or "").strip().upper()
        if upper:
            # First standalone level token after timestamp.
            idx = plain_line.find(" " + upper + " ")
            if idx >= 0:
                spans.append((idx + 1, idx + 1 + len(upper), layer))
                layer += 1

    if grep_rx is not None:
        for m in grep_rx.finditer(plain_line):
            spans.append((m.start(), m.end(), layer))
        layer += 1

    return spans


def resolve_hilight_mode(cli: Optional[str], *, color_on: bool) -> bool:
    raw = (cli or "auto").strip().lower()
    if raw not in _HILIGHT_CHOICES:
        raw = "auto"
    if raw == "off":
        return False
    if raw == "on":
        return color_on
    return color_on


def format_reprint(
    rec: Mapping[str, Any],
    *,
    color_on: bool,
    pretty_mode: str = "off",
    bat_theme: str = "Monokai Extended",
    hilight: bool = False,
    grep_rx: Optional[re.Pattern[str]] = None,
    sessions: Optional[Sequence[str]] = None,
    level_spec: Optional[str] = None,
) -> str:
    """Rebuild view line: `ts LEVEL #sid:pid:seq | body` (D067; no [session])."""
    header = format_header(rec, color_on=color_on)
    body = format_body(
        rec, color_on=color_on, pretty_mode=pretty_mode, bat_theme=bat_theme
    )
    line = header + " | " + body

    if hilight and color_on:
        plain = ansi_strip(line)
        spans = collect_hilight_spans(
            plain,
            rec,
            grep_rx=grep_rx,
            sessions=sessions,
            level_spec=level_spec,
        )
        if spans:
            line = apply_hilight_spans(line, spans)
    if not color_on:
        line = ansi_strip(line)
    return line


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
        description="Filter and reprint plog JSONL (D066/D067). Default --last 30.",
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
        "--pretty",
        nargs="?",
        const="auto",
        choices=list(_PRETTY_CHOICES),
        default=None,
        help="Pretty body engine: auto|bat|internal|off|plain (env P_LOG_PRETTY)",
    )
    p.add_argument(
        "--compact",
        action="store_true",
        help="Force single-line compact body (no nested pretty)",
    )
    p.add_argument(
        "--hilight",
        nargs="?",
        const="on",
        choices=list(_HILIGHT_CHOICES),
        default="auto",
        help="Rainbow match hilight: auto|on|off (default: auto)",
    )
    p.add_argument(
        "--bat-theme",
        default=None,
        metavar="THEME",
        help="bat theme (else P_LOG_BAT_THEME / BAT_THEME / bat config / Monokai Extended)",
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
        is_tty = False
        try:
            is_tty = out.isatty()
        except Exception:
            is_tty = False

        pretty_mode = resolve_pretty_mode(
            args.pretty,
            color_on=color_on,
            is_tty=is_tty,
            compact=bool(args.compact),
        )
        bat_theme = resolve_bat_theme(args.bat_theme)
        do_hilight = resolve_hilight_mode(args.hilight, color_on=color_on)
        grep_rx = None
        if args.grep and do_hilight:
            try:
                grep_rx = re.compile(args.grep)
            except re.error:
                grep_rx = None

        for _raw, obj in rows:
            out.write(
                format_reprint(
                    obj,
                    color_on=color_on,
                    pretty_mode=pretty_mode,
                    bat_theme=bat_theme,
                    hilight=do_hilight,
                    grep_rx=grep_rx,
                    sessions=args.session,
                    level_spec=args.level,
                )
                + "\n"
            )
        return 0
    finally:
        sys.stdout, sys.stderr = old_out, old_err


if __name__ == "__main__":
    raise SystemExit(main())
