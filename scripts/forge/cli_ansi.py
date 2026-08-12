#!/usr/bin/env python3
"""Minimal ANSI for forge CLI help (auto|always|never). No third-party deps.

Color enablement follows the shellrc ansi-color contract via ansi_color.py
(ANSI_COLOR_VERSION must match shellrc util/py/ansi_color.py).
"""

from __future__ import annotations

import sys
from typing import Optional

from ansi_color import (  # noqa: E402
    ANSI_COLOR_VERSION as _ANSI_COLOR_VERSION,
    color_enabled as _contract_color_enabled,
    parse_color_flag,
)

# Re-export for tests / callers
ANSI_COLOR_VERSION = _ANSI_COLOR_VERSION

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

_COLOR_MODE = "auto"  # auto | always | never — from --color flag


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
    """True when ANSI should be used on stream (default stdout)."""
    s = stream if stream is not None else sys.stdout
    return _contract_color_enabled(
        s,
        cli_mode=_COLOR_MODE,
        tool_color_keys=("FORGE_COLOR",),
    )


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
