#!/usr/bin/env python3
"""Keybind kit argparse shim — body lives in ``cli/keybind.mjs`` (CN2)."""

from __future__ import annotations

import sys
from typing import Any, Optional, Sequence

from node_exec import exec_cli


def argv_after_keybind(argv: Optional[Sequence[str]] = None) -> list[str]:
    """Slice argv to the keybind subcommand args (no ``keybind`` prefix)."""
    a = list(argv if argv is not None else sys.argv)
    for i, tok in enumerate(a):
        if tok == "keybind":
            return list(a[i + 1 :])
    # standalone: ``keybind_kit.py load vim`` → drop program name
    return list(a[1:]) if a else []


def _dispatch_keybind(_backend: Any, args: Any) -> int:
    exec_cli("keybind.mjs", argv_after_keybind(sys.argv))
    return 1  # pragma: no cover — exec never returns


def build_keybind_subparser(sub: Any) -> None:
    """Attach ``keybind`` command group to forge argparse (help + dispatch)."""
    kb = sub.add_parser(
        "keybind",
        help="Save/load keybind kits (gsettings; no DBus)",
        description=(
            "Save live Forge keybindings to a profile JSON, or load a built-in "
            "kit (vim|safe|i3) / saved profile.\n"
            "Dir: FORGE_KEYBIND_PROFILES_DIR or ~/.config/forge/config/keybinding-profiles\n"
            "Schema: extension schemas/ or repo schemas/ (auto-compiles source if needed)."
        ),
        formatter_class=__import__("argparse").RawDescriptionHelpFormatter,
    )
    kb_sub = kb.add_subparsers(dest="keybind_action", required=True)

    b = kb_sub.add_parser("save", help="Save live keybindings to <name>.json")
    b.add_argument(
        "name",
        help="Profile name (writes <name>.json; not vim|safe|i3)",
    )
    b.add_argument(
        "--dir",
        metavar="PATH",
        help="Override profiles directory",
    )
    b.set_defaults(func=_dispatch_keybind)

    a = kb_sub.add_parser(
        "load",
        help="Load built-in kit (vim|safe|i3) or saved profile by name",
    )
    a.add_argument(
        "name",
        help="Kit id or saved profile name (or path to .json)",
    )
    a.add_argument(
        "--dry-run",
        action="store_true",
        help="Resolve kit/schema only; do not write gsettings",
    )
    a.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="List keys loaded",
    )
    a.set_defaults(func=_dispatch_keybind)

    st = kb_sub.add_parser(
        "status",
        help="Does live gsettings match vim/safe/i3?",
    )
    st.add_argument(
        "--json",
        action="store_true",
        help="Machine JSON (exit 2 when custom)",
    )
    st.set_defaults(func=_dispatch_keybind)

    ls = kb_sub.add_parser("list", help="List saved profile names")
    ls.add_argument("--dir", metavar="PATH", help="Override profiles directory")
    ls.set_defaults(func=_dispatch_keybind)

    d = kb_sub.add_parser("dir", help="Print resolved profiles directory")
    d.set_defaults(func=_dispatch_keybind)


def main(argv: Optional[list[str]] = None) -> int:
    """Standalone entry: ``python3 keybind_kit.py load vim`` → Node CLI."""
    args = list(argv) if argv is not None else list(sys.argv[1:])
    exec_cli("keybind.mjs", args)
    return 1  # pragma: no cover


if __name__ == "__main__":
    sys.exit(main())
