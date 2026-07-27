#!/usr/bin/env python3
"""Colorized human help for forge / forge workon (stdout)."""

from __future__ import annotations

import sys
from typing import TextIO

from cli_ansi import bold, cmd, cyan, dim, heading


def _out(stream: TextIO, *parts: str) -> None:
    print("".join(parts), file=stream)


def _blank(stream: TextIO) -> None:
    print(file=stream)


def print_forge_help(*, stream: TextIO | None = None) -> None:
    """Top-level `forge help` / `forge --help` (color when TTY)."""
    s = stream if stream is not None else sys.stdout
    kw = {"stream": s}

    _out(s, heading("forge", **kw), " - tiling control CLI (DBus -> Forge extension)")
    _out(s, dim("Distinct from forge-ctl / ./install (install & migrate).", **kw))
    _blank(s)

    _out(s, heading("Commands", **kw))
    rows = [
        ("workon", "Named morning layouts - idempotent reconcile (preferred)"),
        ("tree", "Dump tiling forest as JSON"),
        ("focus / swap / move", "Tile ops by selector"),
        ("launch", "Start app; place after LFT (or PlaceNext path/monitor)"),
        ("run / run-steps", "JSON step scripts (mixed CLI+ext / ext-only)"),
        ("get / set / settings", "Portable GSettings / named profiles"),
        ("ping", "Extension health"),
        ("save-session-layout", "Flush last-good topology before install/HUP"),
        ("install / uninstall", "Reinstall from git tree / remove extension"),
        ("update", "Fetch origin/master; pull if new (clean master only) + install"),
        ("help", "This page (also: forge --help)"),
    ]
    for name, desc in rows:
        _out(s, "  ", cyan(f"{name:<22}", **kw), " ", desc)
    _blank(s)

    _out(s, heading("Quick start", **kw))
    _out(s, "  ", cmd("forge workon help", **kw), "   ", dim("# full workon guide + minimal config", **kw))
    _out(s, "  ", cmd("forge workon list", **kw))
    _out(s, "  ", cmd("forge workon mydesk --dry-run", **kw))
    _out(s, "  ", cmd("forge workon mydesk", **kw))
    _out(s, "  ", cmd("forge tree", **kw))
    _out(s, "  ", cmd("forge launch nautilus", **kw))
    _blank(s)

    _out(s, heading("Acronyms & terms", **kw))
    terms = [
        ("LFT", "Last Focused Tile - the tile that last held focus; default open-app attach point"),
        ("OP1", "Open-app policy: new windows place after LFT unless PlaceNext path/monitor is set"),
        ("CON", "Container node in the tiling tree (HSPLIT/VSPLIT/TABBED/STACKED group)"),
        ("HSPLIT / VSPLIT", "Horizontal / vertical split layout of sibling panes"),
        ("TABBED / STACKED", "Tab strip / stack of windows sharing one pane"),
        ("PlaceNext", "One-shot attach hint for the next matching window (monitor / tree path)"),
        ("RunSteps", "Batched extension ops (freeze -> ops -> one render)"),
        ("reconcile", "Desired-state workon: match roles, open gaps, move/park - not a launch script"),
        ("slot", "Home for a role, e.g. mon0.term or mon1.comms (monitor + layout child id)"),
        ("moNwsW", "Monitor N, workspace W tree id (mo0ws0 = primary-ish mon 0, workspace 0)"),
        ("HUP", "Shell reload on X11 (killall -HUP gnome-shell) after install"),
        ("wmClass", "Window class string used for matching (see forge tree titles/classes)"),
    ]
    for k, v in terms:
        _out(s, "  ", bold(cyan(k, **kw), **kw), "  ", v)
    _blank(s)

    _out(s, heading("Tile selectors", **kw))
    for line in (
        "focus | lft",
        "title:Exact | title~=substr | title~=/regex/flags?",
        "class:WmClass | class:WmClass@mon",
        "path:mo0ws0/0/1   |   id:WINDOW_ID",
        'JSON: \'{"selector":"class:Foo","first":true}\'',
    ):
        _out(s, "  ", cyan(line, **kw))
    _out(s, "  ", dim("Path: moN = monitor, wsW = workspace, /i/j = child indices (0-based).", **kw))
    _out(s, "  ", dim("Discover: ", **kw), cmd("forge tree", **kw))
    _blank(s)

    _out(s, heading("Dependencies", **kw))
    _out(s, "  python3; python3-gi ", dim("(preferred)", **kw), " or gdbus; Forge extension enabled")
    _blank(s)

    _out(s, heading("Global flags", **kw))
    _out(s, "  ", cyan("--color=auto|always|never", **kw), "  ", dim("default auto (TTY on)", **kw))
    _out(s, "  ", cyan("--first", **kw), "                 ", dim("ambiguous match -> first candidate", **kw))
    _out(s, "  ", cyan("--version", **kw))
    _blank(s)

    _out(s, dim("Per-command flags: forge <command> -h", **kw))
    _out(s, dim("Workon guide:      forge workon help", **kw))
    _out(s, dim("User docs:         docs/user/workon.md", **kw))


def print_workon_help(*, stream: TextIO | None = None) -> None:
    """`forge workon help` - generic profiles, defaults, examples."""
    s = stream if stream is not None else sys.stdout
    kw = {"stream": s}

    _out(s, heading("forge workon", **kw), " - named morning layouts (desired state)")
    _out(
        s,
        dim(
            "Not shellrc `workon` (t/e domains). Always use the forge prefix.",
            **kw,
        ),
    )
    _blank(s)

    _out(s, heading("Why this exists", **kw))
    _out(
        s,
        "  One command makes the desk match a ",
        bold("profile", **kw),
        " - reuse open windows, open only gaps,",
    )
    _out(s, "  park extras. Run twice ~= no-op. Apps and layout live in ", bold("your JSON", **kw), ",")
    _out(s, "  not in Forge source. Forge never hardcodes Ghostty, Chrome, host names, etc.")
    _blank(s)

    _out(s, heading("Commands", **kw))
    for line, desc in (
        ("forge workon help", "This guide"),
        ("forge workon list", "Profiles (stderr human; stdout JSON)"),
        ("forge workon show <name>", "Resolved path + validated profile"),
        ("forge workon capture", "Sketch tiles sugar from current tree (stdout)"),
        ("forge workon capture --tree-file F", "Offline capture from GetTree JSON"),
        ("forge workon capture --out PATH", "Also write file (parent dir must exist)"),
        ("forge workon <name> --dry-run", "Plan only (human + plan JSON)"),
        ("forge workon <name>", "Apply; short human summary (stderr)"),
        ("forge workon <name> --verbose", "Also dump plan/apply JSON (or FORGE_VERBOSE=1)"),
        ("forge workon <name> --force-launch", "Imperative steps[] only (escape hatch)"),
        ("forge workon <name> --clean", "Close residuals (Meta delete; not park)"),
        ("forge workon <name> --clean --force", "Stronger delete; never process-kill"),
    ):
        _out(s, "  ", cmd(line, **kw))
        _out(s, "      ", dim(desc, **kw))
    _blank(s)

    _out(s, heading("Where profiles live", **kw), " ", dim("(first hit wins)", **kw))
    for line in (
        "FORGE_WORKON_PATH                         # one-shot file",
        "$FORGE_WORKON_DIR/hosts/<host>/<name>.json",
        "$FORGE_WORKON_DIR/hosts/<host>/<name>/profile.json",
        "$FORGE_WORKON_DIR/common/<name>.json",
        "~/.config/forge/workon/<name>.json        # XDG local",
    ):
        _out(s, "  ", cyan(line, **kw))
    _out(
        s,
        "  ",
        dim("Export FORGE_WORKON_DIR from shellrc for multi-machine trees. Host: FORGE_HOST or hostname.", **kw),
    )
    _blank(s)

    _out(s, heading("Minimal profile", **kw), " ", dim("(tiles sugar - preferred)", **kw))
    _out(s, dim("  ~/.config/forge/workon/simple.json", **kw))
    code = """\
{
  "tiles": {
    "mon0": [
      ["firefox", "code"],
      "ghostty"
    ]
  }
}"""
    for line in code.splitlines():
        _out(s, "  ", cyan(line, **kw))
    _blank(s)
    _out(s, "  Then: ", cmd("forge workon simple --dry-run", **kw), "  ->  ", cmd("forge workon simple", **kw))
    _blank(s)

    _out(s, heading("tiles sugar", **kw), " ", dim("(desugars to roles + layout)", **kw))
    for line, desc in (
        ('monN: [ a, b ]', "panes L→R (hsplit default)"),
        ('stableKey / monitors alias', "multi-host mon keys (T7; plan resolves to monN)"),
        ('["app1", "app2"]', "one tabbed pane"),
        ('"ghostty"', "single-app pane"),
        ('split: "h"/"v"/hsplit/…', "override split"),
        ('{ split, content }', "nested split"),
        ("string cell", "open + best-effort match; id auto"),
        ("rich object cell", "id / match / open (PWAs need title~=)"),
    ):
        _out(s, "  ", cyan(line, **kw), "  ", desc)
    _blank(s)

    _out(s, heading("Defaults", **kw), " ", dim("(omit noise; Forge fills these in)", **kw))
    defaults = [
        ("version / mode", "2 / reconcile when tiles or roles present"),
        ("marginal", 'coexist + roleOrder first (companions kept)'),
        ("overflow", "mon0.overflow + tabbed"),
        ("mon split", "hsplit when ≥2 children"),
        ("multi-app pane", "tabbed"),
        ("role ids", "from open token; de-dupe app-2"),
        ('match: "WmClass"', 'same as { "class": "WmClass" } (IR)'),
        ('open: "app"', 'same as { "app": "app" } (IR)'),
    ]
    for k, v in defaults:
        _out(s, "  ", cyan(k, **kw), "  ", v)
    _blank(s)

    _out(s, heading("Dual-monitor sketch", **kw))
    sketch = """\
"tiles": {
  "mon0": [ ["a", "b"], "term-left" ],
  "mon1": [ "term-right", ["mail", "chat"] ]
}"""
    for line in sketch.splitlines():
        _out(s, "  ", cyan(line, **kw))
    _out(
        s,
        "  ",
        dim("First mon child = left in hsplit; first mon1 child = left of right monitor.", **kw),
    )
    _blank(s)

    _out(s, heading("Reconcile vs steps", **kw))
    _out(s, "  ", bold("v2 tiles or roles+layout", **kw), "  reconcile (daily default; idempotent)")
    _out(s, "  ", bold("v1 steps[]", **kw), "         imperative replay (can double apps)")
    _out(s, "  ", bold("--force-launch", **kw), "      force steps[] path for debug")
    _out(s, "  ", bold("--clean", **kw), "            close residuals (default parks to overflow)")
    _out(s, "  ", bold("--clean --force", **kw), "     stronger Meta delete; never process-kill")
    _out(s, "  ", bold("marginal.mode=strict", **kw), "  park all unclaimed (no companion keep)")
    _blank(s)

    _out(s, heading("Tips", **kw))
    _out(s, "  • Always dry-run a new profile first.")
    _out(s, "  • Match titles with ", cyan('title~="substr"', **kw), " when several windows share a class.")
    _out(s, "  • Counts: reused / opened / moved / kept / parked (or closed with --clean).")
    _out(s, "  • Default never closes windows; role windows and kept companions stay.")
    _out(s, "  • Optional: ", cyan('"displays": "scene"', **kw), " -> gdisplays load; ", cyan('"settings": "name"', **kw), " -> SettingsLoad.")
    _out(s, "  • Offline plan: ", cmd("forge workon name --dry-run --tree-file forest.json", **kw))
    _out(s, "  • Capture sketch: ", cmd("forge workon capture", **kw), "  then edit match/open; never auto-installs")
    _out(s, "  • In-tree examples: ", cyan("scripts/forge/examples/workon-tiles-minimal.json", **kw))
    _out(s, "                    ", cyan("scripts/forge/examples/workon-tiles-nested.json", **kw))
    _out(s, "                    ", cyan("scripts/forge/examples/workon-minimal.json", **kw), dim(" (IR)", **kw))
    _blank(s)

    _out(s, dim("Docs: docs/user/workon.md · design: docs/DESIGN.md", **kw))
