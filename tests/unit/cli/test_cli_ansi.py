#!/usr/bin/env python3
"""Unit tests for forge cli_ansi + ansi_color contract."""

from __future__ import annotations

import io
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

import ansi_color  # noqa: E402
import cli_ansi  # noqa: E402


class VersionDrift(unittest.TestCase):
    def test_forge_matches_shellrc_when_present(self):
        self.assertEqual(cli_ansi.ANSI_COLOR_VERSION, "1.0.0")
        self.assertEqual(ansi_color.ANSI_COLOR_VERSION, cli_ansi.ANSI_COLOR_VERSION)
        shellrc = os.environ.get("shellrc") or str(Path.home() / "dev/me/shellrc")
        py = Path(shellrc) / "util" / "py" / "ansi_color.py"
        if py.is_file():
            text = py.read_text(encoding="utf-8")
            self.assertIn(f'ANSI_COLOR_VERSION = "{cli_ansi.ANSI_COLOR_VERSION}"', text)


class ColorEnabled(unittest.TestCase):
    def setUp(self):
        cli_ansi.set_color_mode("auto")

    def tearDown(self):
        cli_ansi.set_color_mode("auto")

    def test_mode_always(self):
        cli_ansi.set_color_mode("always")
        self.assertTrue(cli_ansi.color_enabled(io.StringIO()))

    def test_mode_never(self):
        cli_ansi.set_color_mode("never")
        with mock.patch.dict(os.environ, {"FORGE_COLOR": "always"}, clear=False):
            self.assertFalse(cli_ansi.color_enabled(io.StringIO()))

    def test_env_forge_color_always_without_tty(self):
        cli_ansi.set_color_mode("auto")
        with mock.patch.dict(os.environ, {"FORGE_COLOR": "always"}, clear=False):
            os.environ.pop("NO_COLOR", None)
            self.assertTrue(cli_ansi.color_enabled(io.StringIO()))

    def test_no_color_wins_over_tty(self):
        class _Tty:
            def isatty(self):
                return True

        with mock.patch.dict(
                os.environ, {"NO_COLOR": "1", "FORGE_COLOR": "auto"}, clear=False):
            self.assertFalse(cli_ansi.color_enabled(_Tty()))

    def test_force_color_on_pipe(self):
        with mock.patch.dict(
                os.environ, {"FORCE_COLOR": "1"}, clear=False):
            os.environ.pop("NO_COLOR", None)
            self.assertTrue(cli_ansi.color_enabled(io.StringIO()))


if __name__ == "__main__":
    unittest.main()
