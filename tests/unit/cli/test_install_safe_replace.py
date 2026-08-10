"""Install safe-replace: disable before rm (mocked FORGE_EXT_DIR / gnome-extensions).

Does not touch the live GNOME extension install. Uses PATH stubs and temp dirs.
"""

from __future__ import annotations

import json
import os
import stat
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path

_REPO = Path(__file__).resolve().parents[3]
_LIB = _REPO / "scripts" / "forge" / "_lib.zsh"
_BUILD_INSTALL = _REPO / "scripts" / "forge" / "build-install.zsh"
_UUID = "forge@jmmaranan.com"


def _write_executable(path: Path, body: str) -> None:
    path.write_text(body)
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP
               | stat.S_IXOTH)


def _make_gnome_extensions_stub(bin_dir: Path, log_path: Path, *,
                                enabled_uuids: list[str]) -> Path:
    """Stub gnome-extensions that logs disable/enable/list and tracks enabled set."""
    state = bin_dir / "enabled-state.txt"
    state.write_text("\n".join(enabled_uuids) +
                     ("\n" if enabled_uuids else ""))
    stub = bin_dir / "gnome-extensions"
    _write_executable(
        stub,
        textwrap.dedent(f"""\
            #!/usr/bin/env zsh
            emulate -L zsh
            set -euo pipefail
            LOG={log_path!s}
            STATE={state!s}
            print -r -- "$*" >>"$LOG"
            case "${{1:-}}" in
              list)
                if [[ "${{2:-}}" == "--enabled" ]]; then
                  [[ -f "$STATE" ]] && cat "$STATE"
                fi
                ;;
              disable)
                uuid="${{2:-}}"
                if [[ -f "$STATE" ]]; then
                  grep -vxF "$uuid" "$STATE" >"${{STATE}}.tmp" || true
                  mv "${{STATE}}.tmp" "$STATE"
                fi
                ;;
              enable)
                uuid="${{2:-}}"
                if ! grep -qxF "$uuid" "$STATE" 2>/dev/null; then
                  print -r -- "$uuid" >>"$STATE"
                fi
                ;;
              install)
                # pretend success for install-ego paths if ever hit
                ;;
              *)
                ;;
            esac
            exit 0
            """),
    )
    return stub


def _zsh_bin() -> str:
    for candidate in ("/usr/bin/zsh", "/bin/zsh", "zsh"):
        if candidate == "zsh" or Path(candidate).is_file():
            return candidate
    return "zsh"


def _run_zsh(script: str,
             env: dict[str, str],
             timeout: float = 30.0) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [_zsh_bin(), "-c", script],
        env=env,
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )


class TestForgeDisableExtension(unittest.TestCase):

    def setUp(self) -> None:
        self._td = tempfile.TemporaryDirectory(prefix="forge-safe-replace-")
        self.root = Path(self._td.name)
        self.ext = self.root / "extensions" / _UUID
        self.ext.mkdir(parents=True)
        (self.ext / "metadata.json").write_text(
            json.dumps({
                "uuid": _UUID,
                "name": "Forge",
                "version-name": "test-luke",
                "shell-version": ["46"],
            }))
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.log = self.root / "gnome-extensions.log"
        self.log.write_text("")
        _make_gnome_extensions_stub(self.bin, self.log, enabled_uuids=[_UUID])
        self.env = {
            **os.environ,
            "PATH": f"{self.bin}:{os.environ.get('PATH', '')}",
            "FORGE_EXT_DIR": str(self.ext),
            "FORGE_UUID": _UUID,
            "FORGE_FORCE": "1",
            "FORGE_COLOR": "never",
            "FORGE_INSTALL_QUIET": "0",
            "HOME": str(self.root / "home"),
        }
        (self.root / "home").mkdir(exist_ok=True)

    def tearDown(self) -> None:
        self._td.cleanup()

    def _disable(self) -> subprocess.CompletedProcess[str]:
        script = textwrap.dedent(f"""\
            emulate -L zsh
            set -euo pipefail
            source {_LIB!s}
            forge_disable_extension
            """)
        return _run_zsh(script, self.env)

    def test_disable_when_enabled(self) -> None:
        r = self._disable()
        self.assertEqual(r.returncode, 0, msg=r.stderr)
        self.assertEqual(r.stdout.strip(), "disabled")
        log = self.log.read_text()
        self.assertIn("disable", log)
        # Second call: already off
        r2 = self._disable()
        self.assertEqual(r2.returncode, 0, msg=r2.stderr)
        self.assertEqual(r2.stdout.strip(), "already-off")

    def test_not_installed(self) -> None:
        import shutil

        shutil.rmtree(self.ext)
        r = self._disable()
        self.assertEqual(r.returncode, 0, msg=r.stderr)
        self.assertEqual(r.stdout.strip(), "not-installed")

    def test_skip_without_gnome_extensions(self) -> None:
        # Absolute zsh + empty PATH so command -v gnome-extensions fails.
        empty = self.root / "empty-bin"
        empty.mkdir(exist_ok=True)
        env = {**self.env, "PATH": str(empty)}
        r = _run_zsh(
            textwrap.dedent(f"""\
                emulate -L zsh
                set -euo pipefail
                source {_LIB!s}
                forge_disable_extension
                """),
            env,
        )
        self.assertEqual(r.returncode, 0, msg=r.stderr)
        self.assertEqual(r.stdout.strip(), "skip")


class TestForgeDoInstallDisableBeforeRm(unittest.TestCase):
    """forge_do_install must call disable before removing FORGE_EXT_DIR."""

    def setUp(self) -> None:
        self._td = tempfile.TemporaryDirectory(prefix="forge-do-install-")
        self.root = Path(self._td.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        # Minimal fake repo + verified temp build
        (self.repo / "Makefile").write_text("# fake\n")
        (self.repo / "metadata.json").write_text(
            json.dumps({
                "uuid": _UUID,
                "name": "Forge"
            }))
        temp = self.repo / "temp"
        temp.mkdir()
        # forge_verify_temp_build needs >150 lines in extension.js
        (temp / "extension.js").write_text("\n".join(f"// line {i}"
                                                     for i in range(200)))
        (temp / "metadata.json").write_text(
            json.dumps({
                "uuid": _UUID,
                "name": "Forge",
                "version-name": "from-temp",
                "shell-version": ["46"],
            }))
        (temp / "schemas").mkdir()
        (temp / "schemas" / "gschemas.compiled").write_bytes(b"fake")

        self.ext = self.root / "extensions" / _UUID
        self.ext.mkdir(parents=True)
        (self.ext / "metadata.json").write_text(
            json.dumps({
                "uuid": _UUID,
                "name": "Forge",
                "version-name": "old-install",
                "shell-version": ["46"],
            }))
        (self.ext / "old-marker.txt").write_text("stale")

        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.log = self.root / "ops.log"
        self.log.write_text("")

        # gnome-extensions stub + wrap rm via a sentinel in PATH won't work for
        # shell builtin-less `rm`. Instead log disable and have a side-channel
        # that records whether disable ran while old-marker still exists.
        order = self.root / "order.log"
        order.write_text("")
        self.order = order

        state = self.bin / "enabled-state.txt"
        state.write_text(_UUID + "\n")
        _write_executable(
            self.bin / "gnome-extensions",
            textwrap.dedent(f"""\
                #!/usr/bin/env zsh
                emulate -L zsh
                set -euo pipefail
                LOG={self.log!s}
                ORDER={order!s}
                STATE={state!s}
                EXT={self.ext!s}
                print -r -- "$*" >>"$LOG"
                case "${{1:-}}" in
                  list)
                    if [[ "${{2:-}}" == "--enabled" ]]; then
                      [[ -f "$STATE" ]] && cat "$STATE"
                    fi
                    ;;
                  disable)
                    uuid="${{2:-}}"
                    if [[ -f "$EXT/old-marker.txt" ]]; then
                      print -r -- "disable-while-old-present" >>"$ORDER"
                    else
                      print -r -- "disable-after-old-gone" >>"$ORDER"
                    fi
                    if [[ -f "$STATE" ]]; then
                      grep -vxF "$uuid" "$STATE" >"${{STATE}}.tmp" || true
                      mv "${{STATE}}.tmp" "$STATE"
                    fi
                    ;;
                  enable)
                    uuid="${{2:-}}"
                    print -r -- "$uuid" >>"$STATE"
                    ;;
                esac
                exit 0
                """),
        )

        self.env = {
            **os.environ,
            "PATH": f"{self.bin}:{os.environ.get('PATH', '')}",
            "FORGE_EXT_DIR": str(self.ext),
            "FORGE_REPO_ROOT": str(self.repo),
            "FORGE_UUID": _UUID,
            "FORGE_FORCE": "1",
            "FORGE_COLOR": "never",
            "FORGE_INSTALL_QUIET": "1",
            "HOME": str(self.root / "home"),
            # Avoid writing origin into real manage dir
            "FORGE_MANAGE_DIR": str(self.root / "manage"),
            "FORGE_ORIGIN_PATH":
            str(self.root / "manage" / "install-origin.json"),
        }
        (self.root / "home").mkdir(exist_ok=True)
        (self.root / "manage").mkdir(exist_ok=True)

    def tearDown(self) -> None:
        self._td.cleanup()

    def test_install_only_disables_before_removing_old_dir(self) -> None:
        # Run install-only with no-enable / no-host-defaults (no live Shell needed).
        r = subprocess.run(
            [
                _zsh_bin(),
                str(_BUILD_INSTALL),
                "--force",
                "--install-only",
                "--no-enable",
                "--no-host-defaults",
            ],
            env=self.env,
            text=True,
            capture_output=True,
            timeout=60,
            check=False,
        )
        self.assertEqual(r.returncode,
                         0,
                         msg=f"stdout={r.stdout}\nstderr={r.stderr}")

        order = self.order.read_text().strip().splitlines()
        self.assertIn(
            "disable-while-old-present",
            order,
            msg=
            f"disable must run before rm; order={order!r} log={self.log.read_text()!r}",
        )
        self.assertNotIn("disable-after-old-gone", order)

        # Old marker gone; new tree present
        self.assertFalse((self.ext / "old-marker.txt").exists())
        self.assertTrue((self.ext / "extension.js").is_file())
        meta = json.loads((self.ext / "metadata.json").read_text())
        self.assertEqual(meta.get("version-name"), "from-temp")

        # gnome-extensions disable was invoked
        log = self.log.read_text()
        self.assertRegex(log, rf"disable\s+{_UUID}")


class TestInstallHelpMentionsSafeReplace(unittest.TestCase):

    def test_install_zsh_help(self) -> None:
        r = subprocess.run(
            [_zsh_bin(),
             str(_REPO / "scripts" / "install.zsh"), "--help"],
            text=True,
            capture_output=True,
            timeout=15,
            check=False,
            env={
                **os.environ, "FORGE_COLOR": "never"
            },
        )
        self.assertEqual(r.returncode, 0, msg=r.stderr)
        out = r.stdout + r.stderr
        self.assertIn("disables", out.lower())
        self.assertRegex(out, r"EGO|ego")
        self.assertRegex(out, r"jcrussell|luke")


if __name__ == "__main__":
    unittest.main()
