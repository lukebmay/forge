#!/usr/bin/env python3
"""Thin shim tests for keybind_kit → Node exec (CN2)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from keybind_kit import (  # noqa: E402
    argv_after_keybind,
    build_keybind_subparser,
    main,
)


class ArgvAfterKeybind(unittest.TestCase):

    def test_after_keybind_token(self):
        self.assertEqual(
            argv_after_keybind(["forge", "keybind", "load", "vim", "--dry-run"]),
            ["load", "vim", "--dry-run"],
        )

    def test_standalone_drops_prog(self):
        self.assertEqual(
            argv_after_keybind(["keybind_kit.py", "status", "--json"]),
            ["status", "--json"],
        )


class BuildSubparser(unittest.TestCase):

    def test_registers_actions(self):
        import argparse

        p = argparse.ArgumentParser()
        sub = p.add_subparsers(dest="cmd")
        build_keybind_subparser(sub)
        args = p.parse_args(["keybind", "dir"])
        self.assertEqual(args.keybind_action, "dir")
        self.assertTrue(callable(args.func))


class MainExec(unittest.TestCase):

    def test_main_execs_node_cli(self):
        with mock.patch("keybind_kit.exec_cli", side_effect=SystemExit(0)) as ex:
            with self.assertRaises(SystemExit) as ctx:
                main(["dir"])
        self.assertEqual(ctx.exception.code, 0)
        ex.assert_called_once_with("keybind.mjs", ["dir"])


if __name__ == "__main__":
    unittest.main()
