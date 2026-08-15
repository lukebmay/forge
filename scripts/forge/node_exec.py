#!/usr/bin/env python3
"""Exec a repo ``cli/*.mjs`` file under Node (CN1 dispatch helper)."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import NoReturn, Optional, Sequence

_SCRIPT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPT_DIR.parent.parent

# Exit when node is missing (scripting.md)
EXIT_NODE_MISSING = 127


def repo_root() -> Path:
    return _REPO_ROOT


def find_node() -> Optional[str]:
    """Return absolute path to ``node`` on PATH, or None."""
    return shutil.which("node")


def node_missing_message() -> str:
    """User-facing error: names the tool + install hint."""
    return (
        "node not found on PATH (required for forge Node CLI). "
        "Install Node.js 20+ (nvm/n/fnm) or your distro's nodejs package."
    )


def cli_mjs(rel: str) -> Path:
    """Resolve ``cli/<rel>`` under the forge repo root (file need not exist)."""
    name = rel.strip().lstrip("/")
    if not name:
        raise ValueError("cli_mjs: empty relative path")
    return _REPO_ROOT / "cli" / name


def exec_cli(rel: str, argv: Sequence[str] | None = None) -> NoReturn:
    """Replace this process with ``node <repo>/cli/<rel> …argv`` (inherit env/stdio/cwd)."""
    args = list(argv) if argv is not None else []
    node = find_node()
    if not node:
        print(node_missing_message(), file=sys.stderr)
        raise SystemExit(EXIT_NODE_MISSING)
    script = str(cli_mjs(rel))
    os.execv(node, [node, script, *args])
    raise SystemExit(EXIT_NODE_MISSING)  # pragma: no cover — exec never returns


def run_cli(rel: str, argv: Sequence[str] | None = None) -> int:
    """Run ``node <repo>/cli/<rel> …argv`` without exec (tests / non-replace callers)."""
    args = list(argv) if argv is not None else []
    node = find_node()
    if not node:
        print(node_missing_message(), file=sys.stderr)
        return EXIT_NODE_MISSING
    script = str(cli_mjs(rel))
    completed = subprocess.run([node, script, *args], check=False)
    return int(completed.returncode)
