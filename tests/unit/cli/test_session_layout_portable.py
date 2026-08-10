#!/usr/bin/env python3
"""CLI GetTree → session-layout portable projection (install flush fallback)."""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

_REPO = Path(__file__).resolve().parents[3]
_FORGE_BIN = _REPO / "scripts" / "forge" / "forge"


def _load_forge_cli():
    # `forge` has no .py suffix — SourceFileLoader is required.
    name = "forge_cli_session"
    loader = importlib.machinery.SourceFileLoader(name, str(_FORGE_BIN))
    spec = importlib.util.spec_from_loader(name, loader)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


class TestSessionLayoutPortable(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.forge = _load_forge_cli()

    def test_project_con_keeps_last_tab_focus_and_child_order(self):
        node = {
            "nodeType":
            "CON",
            "layout":
            "TABBED",
            "percent":
            0,
            "userSized":
            False,
            "lastTabFocusId":
            42,
            "children": [
                {
                    "nodeType": "WINDOW",
                    "windowId": 1,
                    "wmClass": "A",
                    "title": "first",
                    "percent": 0,
                    "userSized": False,
                },
                {
                    "nodeType": "WINDOW",
                    "windowId": 42,
                    "wmClass": "B",
                    "title": "open",
                    "percent": 0,
                    "userSized": False,
                },
            ],
        }
        out = self.forge._project_node_to_portable(node)
        assert out is not None
        self.assertEqual(out["layout"], "TABBED")
        self.assertEqual(out["lastTabFocusId"], 42)
        self.assertEqual([c["id"] for c in out["children"]], [1, 42])

    def test_write_session_layout_includes_focus_and_open_tab(self):
        forest = {
            "focusWindowId":
            42,
            "monitors": [{
                "nodeType":
                "MONITOR",
                "id":
                "mo0ws0",
                "layout":
                "HSPLIT",
                "children": [{
                    "nodeType":
                    "CON",
                    "layout":
                    "STACKED",
                    "percent":
                    1,
                    "userSized":
                    False,
                    "lastTabFocusId":
                    42,
                    "children": [
                        {
                            "nodeType": "WINDOW",
                            "windowId": 1,
                            "wmClass": "A",
                            "title": "a",
                            "percent": 0,
                            "userSized": False,
                        },
                        {
                            "nodeType": "WINDOW",
                            "windowId": 42,
                            "wmClass": "B",
                            "title": "b",
                            "percent": 0,
                            "userSized": False,
                        },
                    ],
                }],
            }],
        }
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            with mock.patch.object(Path, "home", return_value=home):
                result = self.forge._write_session_layout_from_tree(forest)
            self.assertTrue(result.get("ok"), result)
            env = json.loads(Path(result["path"]).read_text(encoding="utf-8"))
            self.assertEqual(env["focusWindowId"], 42)
            group = env["forest"]["monitors"][0]["children"][0]
            self.assertEqual(group["layout"], "STACKED")
            self.assertEqual(group["lastTabFocusId"], 42)
            self.assertEqual([c["id"] for c in group["children"]], [1, 42])


if __name__ == "__main__":
    unittest.main()
