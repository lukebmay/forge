#!/usr/bin/env python3
"""CLI _class_eq Chrome PWA family + launch wait/place helpers (CL7)."""

from __future__ import annotations

import tempfile
import textwrap
import unittest
from importlib.machinery import SourceFileLoader
from pathlib import Path

_REPO = Path(__file__).resolve().parents[3]
_FORGE = _REPO / "scripts" / "forge" / "forge"

forge = SourceFileLoader("forge_cli_class_eq", str(_FORGE)).load_module()
_class_eq = forge._class_eq
merge_launch_wait_classes = forge.merge_launch_wait_classes
prefer_launch_place_class = forge.prefer_launch_place_class
infer_wm_class_hints = forge.infer_wm_class_hints
_chrome_pwa_app_id = forge._chrome_pwa_app_id


class TestForgeClassEq(unittest.TestCase):

    def test_casefold_and_stem(self):
        self.assertTrue(_class_eq("Google-chrome", "google-chrome"))
        self.assertTrue(_class_eq("ghostty", "com.mitchellh.ghostty"))
        self.assertFalse(_class_eq("A", "B"))
        self.assertFalse(_class_eq(None, "A"))

    def test_chrome_browser_matches_pwa_and_crx(self):
        self.assertTrue(_class_eq("Google-chrome",
                                  "chrome-ggjoabcdef-Default"))
        self.assertTrue(_class_eq("google-chrome",
                                  "chrome-ggjoabcdef-Default"))
        self.assertTrue(_class_eq("Chromium", "chrome-ggjoabcdef-Default"))
        self.assertTrue(_class_eq("chromium", "crx_abc123"))
        self.assertTrue(_class_eq("google-chrome-stable", "crx_xyz"))
        self.assertTrue(_class_eq("chrome-aaa-Default", "Google-chrome"))
        self.assertTrue(_class_eq("Google-chrome", "Google-chrome"))
        self.assertTrue(_class_eq("Google-chrome", "Chromium"))

    def test_distinct_pwas_do_not_match(self):
        self.assertFalse(_class_eq("chrome-aaa-Default", "chrome-bbb-Default"))
        self.assertFalse(
            _class_eq("chrome-ggjoabcdef-Default", "chrome-otherid-Default"))
        self.assertFalse(_class_eq("crx_a", "crx_b"))
        self.assertFalse(_class_eq("crx_abc123", "chrome-aaa-Default"))
        self.assertTrue(_class_eq("chrome-aaa-Default", "chrome-aaa-Default"))
        self.assertTrue(_class_eq("crx_a", "crx_a"))

    def test_open_action_is_chrome_family(self):
        fn = forge._open_action_is_chrome_family
        self.assertTrue(
            fn({
                "open": {"app": "Grok", "wmClass": "Google-chrome"},
                "match": {"title~=": "Grok"},
            }))
        self.assertTrue(
            fn({"open": {"app": "YouTube", "wmClass": "chrome-abc-Default"}}))
        self.assertFalse(fn({"open": {"app": "ghostty", "wmClass": "ghostty"}}))
        self.assertFalse(fn({"open": {"app": "nautilus"}}))

    def test_same_pwa_crx_matches_chrome_default(self):
        self.assertTrue(
            _class_eq(
                "crx_agimnkijcaahngcdmfeangaknmldooml",
                "chrome-agimnkijcaahngcdmfeangaknmldooml-Default",
            ))
        self.assertTrue(
            _class_eq(
                "chrome-ggjocahimgaohmigbfhghnlfcnjemagj-Default",
                "crx_ggjocahimgaohmigbfhghnlfcnjemagj",
            ))
        # Profile-ish same app id
        self.assertTrue(
            _class_eq(
                "crx_ggjocahimgaohmigbfhghnlfcnjemagj",
                "chrome-ggjocahimgaohmigbfhghnlfcnjemagj-Profile",
            ))
        self.assertEqual(
            _chrome_pwa_app_id(
                "chrome-ggjocahimgaohmigbfhghnlfcnjemagj-Profile_1"),
            "ggjocahimgaohmigbfhghnlfcnjemagj",
        )

    def test_non_chrome_does_not_match_pwa(self):
        self.assertFalse(_class_eq("firefox", "chrome-ggjo-Default"))
        self.assertFalse(_class_eq("ghostty", "crx_abc"))


class TestLaunchWaitPlaceHelpers(unittest.TestCase):

    def test_merge_hints_first_then_explicit(self):
        # Keep both PWA forms + sugar; hints before explicit; casefold dedupe only.
        hints = [
            "chrome-ggjocahimgaohmigbfhghnlfcnjemagj-Default",
            "crx_ggjocahimgaohmigbfhghnlfcnjemagj",
            "google-chrome",
        ]
        wait = merge_launch_wait_classes("Google-chrome", hints)
        self.assertIsNotNone(wait)
        assert wait is not None
        self.assertEqual(wait[0],
                         "chrome-ggjocahimgaohmigbfhghnlfcnjemagj-Default")
        self.assertIn("crx_ggjocahimgaohmigbfhghnlfcnjemagj", wait)
        # google-chrome already from hints; Google-chrome casefolds equal.
        self.assertEqual(wait[-1], "google-chrome")
        self.assertEqual(
            len([w for w in wait if w.casefold() == "google-chrome"]), 1)

    def test_merge_explicit_only(self):
        wait = merge_launch_wait_classes("Google-chrome", [])
        self.assertEqual(wait, ["Google-chrome"])

    def test_merge_hints_only(self):
        wait = merge_launch_wait_classes(None,
                                         ["com.mitchellh.ghostty", "ghostty"])
        self.assertEqual(wait, ["com.mitchellh.ghostty", "ghostty"])

    def test_prefer_chrome_default_over_sugar(self):
        place = prefer_launch_place_class(
            "Google-chrome",
            [
                "chrome-ggjocahimgaohmigbfhghnlfcnjemagj-Default",
                "crx_ggjocahimgaohmigbfhghnlfcnjemagj",
                "google-chrome",
            ],
        )
        self.assertEqual(place,
                         "chrome-ggjocahimgaohmigbfhghnlfcnjemagj-Default")

    def test_prefer_crx_when_no_chrome_default(self):
        place = prefer_launch_place_class(
            "Google-chrome",
            ["crx_abc123", "google-chrome"],
        )
        self.assertEqual(place, "crx_abc123")

    def test_prefer_explicit_when_no_hints(self):
        self.assertEqual(prefer_launch_place_class("Google-chrome", []),
                         "Google-chrome")

    def test_infer_hints_from_crx_startup(self):
        app_id = "ggjocahimgaohmigbfhghnlfcnjemagj"
        body = textwrap.dedent(f"""\
            [Desktop Entry]
            Type=Application
            Name=Grok
            Exec=/usr/bin/google-chrome --app-id={app_id}
            StartupWMClass=crx_{app_id}
            """)
        with tempfile.TemporaryDirectory() as td:
            desk = Path(td) / f"chrome-{app_id}-Default.desktop"
            desk.write_text(body, encoding="utf-8")
            hints = infer_wm_class_hints("Grok", str(desk))
        self.assertEqual(hints[0], f"chrome-{app_id}-Default")
        self.assertIn(f"crx_{app_id}", hints)

    def test_infer_hints_from_app_id_only(self):
        app_id = "agimnkijcaahngcdmfeangaknmldooml"
        body = textwrap.dedent(f"""\
            [Desktop Entry]
            Type=Application
            Name=YouTube
            Exec=/usr/bin/google-chrome --profile-directory=Default --app-id={app_id}
            """)
        with tempfile.TemporaryDirectory() as td:
            desk = Path(td) / "youtube.desktop"
            desk.write_text(body, encoding="utf-8")
            hints = infer_wm_class_hints("YouTube", str(desk))
        self.assertEqual(hints[0], f"chrome-{app_id}-Default")
        self.assertIn(f"crx_{app_id}", hints)


class TestOpenLoopContinueLogic(unittest.TestCase):
    """Pure continue-on-failure bookkeeping used by layout open loop."""

    def test_continue_records_failures_and_pins(self):
        opens = [
            {
                "role": "chrome",
                "ok": True,
                "windowId": 1
            },
            {
                "role": "Grok",
                "ok": False,
                "error": "timeout"
            },
            {
                "role": "YouTube",
                "ok": True,
                "windowId": 3
            },
        ]
        role_pins: dict[str, int] = {}
        open_failures: list[str] = []
        for oa in opens:
            role = oa["role"]
            if not oa.get("ok"):
                open_failures.append(role)
                continue
            if oa.get("windowId") is not None:
                role_pins[str(role)] = oa["windowId"]
        self.assertEqual(open_failures, ["Grok"])
        self.assertEqual(role_pins, {"chrome": 1, "YouTube": 3})

    def test_parallel_spawn_then_map_pin_bookkeeping(self):
        """CL9: spawns succeed without windowId; map wait fills pins later."""
        spawns = [
            {
                "role": "chrome",
                "ok": True,
                "waited": False,
                "waitClasses": ["Google-chrome"]
            },
            {
                "role": "ghostty",
                "ok": True,
                "waited": False,
                "waitClasses": ["ghostty"]
            },
            {
                "role": "Grok",
                "ok": False,
                "error": "PlaceNext failed"
            },
        ]
        pending = []
        open_failures: list[str] = []
        for s in spawns:
            if not s.get("ok"):
                open_failures.append(s["role"])
                continue
            pending.append({
                "role": s["role"],
                "wait_classes": s.get("waitClasses"),
                "accept_any_new": s.get("waitClasses") is None,
            })
        self.assertEqual(open_failures, ["Grok"])
        self.assertEqual([p["role"] for p in pending], ["chrome", "ghostty"])
        # Map pins (no TILE required) applied after wait.
        map_pins = {"chrome": 10, "ghostty": 20}
        role_pins = dict(map_pins)
        self.assertEqual(role_pins, {"chrome": 10, "ghostty": 20})
        self.assertTrue(
            all(s.get("waited") is False for s in spawns if s.get("ok")))


if __name__ == "__main__":
    unittest.main()
