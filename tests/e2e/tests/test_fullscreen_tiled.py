"""D026 / IC3: unsolicited Meta-fullscreen on a TILE restores the slot.

A tiled window that Meta-fullscreens without a live grab (VLC, F11) is
unfullscreened and moved back to renderRect. apply() still skips a *live*
fullscreen frame so move() does not fight Mutter before unmake.
"""

from framework.constants import Timing
from framework.wait import wait_for


def _make_focused_fullscreen(shell_proxy) -> str:
    return shell_proxy.eval(
        "(function(){"
        "let w=global.display.get_focus_window();"
        "if(!w) return 'none';"
        "w.make_fullscreen();"
        "return 'ok';"
        "})();"
    )


class TestFullscreenTiled:
    def test_fullscreen_window_fills_monitor_with_sibling(
        self, shell_proxy, restore_settings, two_windows
    ):
        """A TILE that Meta-fullscreens is restored to its slot, not left full-monitor."""
        shell_proxy.ensure_focus()

        ws = shell_proxy.get_workspace_rect()
        ws_width = ws["width"]

        # Precondition: the focused window is a tiled half (well under full width).
        before = shell_proxy.get_focused_window()["rect"]
        assert before["width"] < ws_width * 0.75, (
            f"expected a tiled (sub-full-width) window before fullscreen, got {before}"
        )
        slot_width = before["width"]

        assert _make_focused_fullscreen(shell_proxy) == "ok"

        rect = wait_for(
            lambda: shell_proxy.get_focused_window()["rect"],
            predicate=lambda r: r["width"] < ws_width * 0.75,
            timeout=Timing.LAYOUT_CHANGE * 6,
            message="TILE fullscreen was left full-monitor instead of restoring the slot",
        )
        assert rect["width"] < ws_width * 0.75
        assert abs(rect["width"] - slot_width) < ws_width * 0.15
