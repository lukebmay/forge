#!/usr/bin/env python3
"""Minimal ANSI for forge CLI help (auto|always|never). No third-party deps."""

from __future__ import annotations

import os
import sys
from typing import Optional

# Roles: magenta headings, cyan ids/paths, blue commands, green ok, yellow warn, red err
_RESET = "\033[0m"
_BOLD = "\033[1m"
_DIM = "\033[2m"
_RED = "\033[31m"
_GREEN = "\033[32m"
_YELLOW = "\033[33m"
_BLUE = "\033[34m"
_MAGENTA = "\033[35m"
_CYAN = "\033[36m"

_COLOR_MODE = "auto"  # auto | always | never


def set_color_mode(mode: Optional[str]) -> None:
    global _COLOR_MODE
    if mode is None or str(mode).strip() == "":
        _COLOR_MODE = "auto"
        return
    m = str(mode).strip().lower()
    if m not in ("auto", "always", "never"):
        raise ValueError(f"color mode must be auto|always|never, got {mode!r}")
    _COLOR_MODE = m


def color_enabled(stream=None) -> bool:
    if _COLOR_MODE == "always":
        return True
    if _COLOR_MODE == "never":
        return False
    # auto: NO_COLOR wins; else TTY on stream (default stderr for help on tty)
    if os.environ.get("NO_COLOR", "").strip():
        return False
    s = stream if stream is not None else sys.stdout
    try:
        return bool(s.isatty())
    except Exception:
        return False


def _wrap(code: str, text: str, *, stream=None) -> str:
    if not color_enabled(stream):
        return text
    return f"{code}{text}{_RESET}"


def bold(text: str, *, stream=None) -> str:
    return _wrap(_BOLD, text, stream=stream)


def dim(text: str, *, stream=None) -> str:
    return _wrap(_DIM, text, stream=stream)


def red(text: str, *, stream=None) -> str:
    return _wrap(_RED, text, stream=stream)


def green(text: str, *, stream=None) -> str:
    return _wrap(_GREEN, text, stream=stream)


def yellow(text: str, *, stream=None) -> str:
    return _wrap(_YELLOW, text, stream=stream)


def blue(text: str, *, stream=None) -> str:
    return _wrap(_BLUE, text, stream=stream)


def magenta(text: str, *, stream=None) -> str:
    return _wrap(_MAGENTA, text, stream=stream)


def cyan(text: str, *, stream=None) -> str:
    return _wrap(_CYAN, text, stream=stream)


def heading(text: str, *, stream=None) -> str:
    return _wrap(f"{_BOLD}{_MAGENTA}", text, stream=stream)


def cmd(text: str, *, stream=None) -> str:
    """Runnable command."""
    return _wrap(f"{_BOLD}{_BLUE}", text, stream=stream)


def ident(text: str, *, stream=None) -> str:
    """Path, id, key, slot."""
    return cyan(text, stream=stream)


def parse_color_flag(argv: list[str]) -> tuple[list[str], Optional[str]]:
    """
    Strip --color / --color=MODE from argv; return (rest, mode|None).
    MODE defaults to always when bare --color is passed.
    """
    out: list[str] = []
    mode: Optional[str] = None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--color":
            if i + 1 < len(argv) and not argv[i + 1].startswith("-"):
                mode = argv[i + 1]
                i += 2
            else:
                mode = "always"
                i += 1
            continue
        if a.startswith("--color="):
            mode = a.split("=", 1)[1] or "always"
            i += 1
            continue
        out.append(a)
        i += 1
    return out, mode
