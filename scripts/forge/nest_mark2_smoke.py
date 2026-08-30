#!/usr/bin/env python3
"""Nest campaign: two clients → Mark 2 invoke → forge tree. Use via nested run."""

from __future__ import annotations

import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from nest_invoke import cmd_smoke_from_env  # noqa: E402


def main() -> int:
    return int(cmd_smoke_from_env())


if __name__ == "__main__":
    sys.exit(main())
