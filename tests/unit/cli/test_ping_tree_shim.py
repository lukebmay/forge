#!/usr/bin/env python3
"""Thin shim tests: forge cmd_ping/cmd_tree → Node exec (CN4)."""

from __future__ import annotations

import sys
import unittest
from importlib.machinery import SourceFileLoader
from pathlib import Path
from unittest import mock

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

# scripts/forge/forge has no .py suffix — SourceFileLoader still works.
forge = SourceFileLoader(
    "forge_cli_main",
    str(_FORGE_CLI / "forge"),
).load_module()


class ArgvAfterCommand(unittest.TestCase):
    def test_after_ping(self):
        self.assertEqual(
            forge._argv_after_command(
                "ping", ["forge", "ping", "--help"]
            ),
            ["--help"],
        )

    def test_after_tree_flags(self):
        self.assertEqual(
            forge._argv_after_command(
                "tree",
                ["forge", "tree", "--monitor=0", "--compact"],
            ),
            ["--monitor=0", "--compact"],
        )


class PingTreeShim(unittest.TestCase):
    def test_cmd_ping_execs_node(self):
        with mock.patch.object(
            forge, "exec_cli", side_effect=SystemExit(0)
        ) as ex:
            with mock.patch.object(
                forge.sys, "argv", ["forge", "ping"]
            ):
                with self.assertRaises(SystemExit) as ctx:
                    forge.cmd_ping(None, mock.Mock())
        self.assertEqual(ctx.exception.code, 0)
        ex.assert_called_once_with("ping.mjs", [])

    def test_cmd_tree_execs_node_with_flags(self):
        with mock.patch.object(
            forge, "exec_cli", side_effect=SystemExit(0)
        ) as ex:
            with mock.patch.object(
                forge.sys,
                "argv",
                ["forge", "tree", "--compact", "--monitor", "0"],
            ):
                with self.assertRaises(SystemExit) as ctx:
                    forge.cmd_tree(None, mock.Mock())
        self.assertEqual(ctx.exception.code, 0)
        ex.assert_called_once_with(
            "tree.mjs", ["--compact", "--monitor", "0"]
        )

    def test_ping_tree_in_no_dbus(self):
        self.assertIn("ping", forge._NO_DBUS_COMMANDS)
        self.assertIn("tree", forge._NO_DBUS_COMMANDS)


if __name__ == "__main__":
    unittest.main()
