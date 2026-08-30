"""Nest client argv rewrites (Chrome profile, Ghostty multi-instance)."""

from __future__ import annotations

import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from nested_wayland import nest_launch_argv_for_state  # noqa: E402


def test_ghostty_forces_multi_instance(tmp_path: Path) -> None:
    out = nest_launch_argv_for_state(
        tmp_path, ["ghostty", "--gtk-single-instance=true", "-e", "bash"]
    )
    assert out[0] == "ghostty"
    assert "--gtk-single-instance=false" in out
    assert "--gtk-single-instance=true" not in out
    assert "-e" in out


def test_chrome_adds_user_data_dir(tmp_path: Path) -> None:
    out = nest_launch_argv_for_state(
        tmp_path, ["google-chrome-stable", "about:blank"]
    )
    assert out[0] == "google-chrome-stable"
    ud = [a for a in out if a.startswith("--user-data-dir=")]
    assert len(ud) == 1
    assert str(tmp_path / "chrome-profile") in ud[0]
    assert "--no-first-run" in out
    assert "--ozone-platform=wayland" in out
    assert (tmp_path / "chrome-profile").is_dir()


def test_chrome_keeps_existing_user_data_dir(tmp_path: Path) -> None:
    out = nest_launch_argv_for_state(
        tmp_path,
        [
            "chromium",
            "--user-data-dir=/tmp/custom",
            "--ozone-platform=wayland",
            "about:blank",
        ],
    )
    ud = [a for a in out if a.startswith("--user-data-dir=")]
    assert ud == ["--user-data-dir=/tmp/custom"]
