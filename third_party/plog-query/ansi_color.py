#!/usr/bin/env python3
"""ansi_color — portable color enablement (shellrc contract).

Decision order (FIRM): see agents-catalog ansi-colors.md.
Keep ANSI_COLOR_VERSION in sync across py/zsh/js/lua and vendored copies.
"""

from __future__ import annotations

import os
import sys
from types import SimpleNamespace
from typing import Mapping, Optional, TextIO, Union

# Contract implementation version — bump when decision order or env names change.
# Must match util/zsh/script-utils/ansi_color.zsh, util/js/ansi_color.js,
# util/lua/ansi_color.lua, and any vendored copy (e.g. forge).
ANSI_COLOR_VERSION = "1.0.0"

_FALSEY = frozenset({"", "0", "false", "no", "off"})


def _truthy_force(raw: Optional[str]) -> bool:
    if raw is None:
        return False
    s = str(raw).strip().lower()
    if s in _FALSEY:
        return False
    return bool(s)


def _env_mode(env: Mapping[str, str], tool_color_keys: Optional[tuple[str, ...]] = None) -> Optional[str]:
    """Return always|never|auto from env aliases, or None if unset."""
    keys = list(tool_color_keys or ())
    keys.extend(("COLOR",))
    for key in keys:
        raw = (env.get(key) or "").strip().lower()
        if raw in ("always", "never", "auto"):
            return raw
    return None


def resolve_color_mode(
    cli_mode: Optional[str] = None,
    *,
    env: Optional[Mapping[str, str]] = None,
    tool_color_keys: Optional[tuple[str, ...]] = None,
) -> str:
    """
    Resolve to always|never|auto (not yet isatty).

    cli_mode: from --color=… (None = not passed).
    """
    e = env if env is not None else os.environ
    if cli_mode is not None and str(cli_mode).strip() != "":
        m = str(cli_mode).strip().lower()
        if m not in ("always", "never", "auto"):
            raise ValueError(f"color mode must be auto|always|never, got {cli_mode!r}")
        if m in ("always", "never"):
            return m
        # auto: fall through to env kills / force
    else:
        m = "auto"

    if str(e.get("NO_COLOR", "")).strip():
        return "never"

    if _truthy_force(e.get("FORCE_COLOR")) or _truthy_force(e.get("CLICOLOR_FORCE")):
        return "always"

    em = _env_mode(e, tool_color_keys)
    if em in ("always", "never"):
        return em
    if em == "auto":
        m = "auto"

    return m  # auto


def color_enabled(
    stream: Optional[Union[TextIO, object]] = None,
    *,
    cli_mode: Optional[str] = None,
    env: Optional[Mapping[str, str]] = None,
    tool_color_keys: Optional[tuple[str, ...]] = None,
    fd: Optional[int] = None,
) -> bool:
    """
    True when ANSI should be emitted on stream (default stdout).

    fd: optional int file descriptor for isatty when stream is omitted
    (used by non-Python ports; Python prefers stream.isatty()).
    """
    mode = resolve_color_mode(
        cli_mode, env=env, tool_color_keys=tool_color_keys
    )
    if mode == "always":
        return True
    if mode == "never":
        return False
    s = stream if stream is not None else sys.stdout
    try:
        return bool(s.isatty())  # type: ignore[union-attr]
    except Exception:
        if fd is not None:
            try:
                return os.isatty(int(fd))
            except Exception:
                return False
        return False


_CODE_SEQS = {
    "red": "\033[31m",
    "green": "\033[32m",
    "yellow": "\033[33m",
    "blue": "\033[34m",
    "magenta": "\033[35m",
    "cyan": "\033[36m",
    "reset": "\033[0m",
    "bold": "\033[1m",
    "dim": "\033[2m",
}


def color_codes(
    stream: Optional[Union[TextIO, object]] = None,
    *,
    cli_mode: Optional[str] = None,
    env: Optional[Mapping[str, str]] = None,
    tool_color_keys: Optional[tuple[str, ...]] = None,
    fd: Optional[int] = None,
    enabled: Optional[bool] = None,
) -> SimpleNamespace:
    """Role sequences, or empty strings when color is off.

    enabled=: optional override; else color_enabled(...).
    """
    on = (
        bool(enabled)
        if enabled is not None
        else color_enabled(
            stream,
            cli_mode=cli_mode,
            env=env,
            tool_color_keys=tool_color_keys,
            fd=fd,
        )
    )
    if on:
        return SimpleNamespace(**_CODE_SEQS)
    return SimpleNamespace(**{k: "" for k in _CODE_SEQS})


def parse_color_flag(argv: list[str]) -> tuple[list[str], Optional[str]]:
    """
    Strip --color / --color=MODE from argv; return (rest, mode|None).
    Bare --color ⇒ always.
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
