#!/usr/bin/env python3
"""Unit tests for scripts/forge/node_exec.py (CN1)."""

from __future__ import annotations

import io
import sys
import unittest
from pathlib import Path
from unittest import mock

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from node_exec import (  # noqa: E402
    EXIT_NODE_MISSING,
    cli_mjs,
    exec_cli,
    find_node,
    node_missing_message,
    repo_root,
    run_cli,
)


class FindNode(unittest.TestCase):

    def test_find_node_present_or_none(self):
        found = find_node()
        if found is not None:
            self.assertTrue(Path(found).is_file() or Path(found).is_symlink())
            self.assertIn("node", Path(found).name)

    def test_find_node_missing(self):
        with mock.patch("node_exec.shutil.which", return_value=None):
            self.assertIsNone(find_node())


class MissingMessage(unittest.TestCase):

    def test_names_tool_and_install_hint(self):
        msg = node_missing_message()
        self.assertIn("node", msg.lower())
        # install hint: Node.js and/or a known installer family
        self.assertTrue(
            "install" in msg.lower() or "nvm" in msg.lower() or "fnm" in msg.lower(),
            msg,
        )


class CliPath(unittest.TestCase):

    def test_cli_mjs_keybind(self):
        p = cli_mjs("keybind.mjs")
        self.assertEqual(p, _REPO / "cli" / "keybind.mjs")
        self.assertEqual(p, repo_root() / "cli" / "keybind.mjs")

    def test_cli_mjs_smoke_exists(self):
        p = cli_mjs("smoke-import.mjs")
        self.assertEqual(p, _REPO / "cli" / "smoke-import.mjs")
        self.assertTrue(p.is_file())

    def test_cli_mjs_rejects_empty(self):
        with self.assertRaises(ValueError):
            cli_mjs("")
        with self.assertRaises(ValueError):
            cli_mjs("   ")


class RunCli(unittest.TestCase):

    def test_run_cli_smoke_import(self):
        node = find_node()
        if not node:
            self.skipTest("node not on PATH")
        # run_cli inherits stdio; return code is the contract under test
        rc = run_cli("smoke-import.mjs", [])
        self.assertEqual(rc, 0)
        # content check via the same argv shape run_cli uses
        import subprocess

        r = subprocess.run(
            [node, str(cli_mjs("smoke-import.mjs"))],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(r.returncode, 0)
        out = r.stdout.strip()
        for kit in ("safe", "vim", "i3"):
            self.assertIn(kit, out)

    def test_run_cli_missing_node_returns_127(self):
        err = io.StringIO()
        with mock.patch("node_exec.find_node", return_value=None), \
                mock.patch("sys.stderr", err):
            rc = run_cli("smoke-import.mjs", [])
        self.assertEqual(rc, EXIT_NODE_MISSING)
        self.assertEqual(rc, 127)
        self.assertIn("node", err.getvalue().lower())


class ExecCli(unittest.TestCase):

    def test_exec_cli_missing_node_exits_127(self):
        err = io.StringIO()
        with mock.patch("node_exec.find_node", return_value=None), \
                mock.patch("sys.stderr", err):
            with self.assertRaises(SystemExit) as ctx:
                exec_cli("keybind.mjs", ["load", "vim"])
        self.assertEqual(ctx.exception.code, 127)
        self.assertIn("node", err.getvalue().lower())

    def test_exec_cli_calls_execv(self):
        with mock.patch("node_exec.find_node", return_value="/usr/bin/node"), \
                mock.patch("node_exec.os.execv", side_effect=SystemExit(0)) as ex:
            with self.assertRaises(SystemExit):
                exec_cli("keybind.mjs", ["load", "vim"])
        ex.assert_called_once()
        args = ex.call_args[0]
        self.assertEqual(args[0], "/usr/bin/node")
        self.assertEqual(
            args[1],
            [
                "/usr/bin/node",
                str(_REPO / "cli" / "keybind.mjs"),
                "load",
                "vim",
            ],
        )


if __name__ == "__main__":
    unittest.main()
