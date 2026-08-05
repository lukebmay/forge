#!/usr/bin/env python3
"""Colorized human help for forge / forge layout (stdout)."""

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
        ("layout", "Named layout profiles - idempotent reconcile (preferred)"),
        ("tree", "Dump tiling forest as JSON"),
        ("focus / swap / move", "Tile ops by selector"),
        ("launch", "Start app; place after LFT (or PlaceNext path/monitor)"),
        ("run / run-steps", "JSON step scripts (mixed CLI+ext / ext-only)"),
        ("get / set / settings", "Portable GSettings / named profiles"),
        ("keybind", "Backup/apply keybind kits (vim|safe|i3; no DBus)"),
        ("ping", "Extension health"),
        ("save-session-layout", "Flush last-good topology before install/HUP"),
        ("install / uninstall", "Reinstall from git tree / remove extension"),
        ("update", "Fetch origin/master; pull if new; always install (even if git current)"),
        ("help", "This page (also: forge --help)"),
    ]
    for name, desc in rows:
        _out(s, "  ", cyan(f"{name:<22}", **kw), " ", desc)
    _blank(s)

    _out(s, heading("Quick start", **kw))
    _out(s, "  ", cmd("forge layout help", **kw), "   ", dim("# full layout guide + minimal config", **kw))
    _out(s, "  ", cmd("forge layout list", **kw))
    _out(s, "  ", cmd("forge layout mydesk --dry-run", **kw))
    _out(s, "  ", cmd("forge layout mydesk", **kw))
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
        (
            "LayoutBatch",
            "Multi-open control loop (CL5/CL9): begin|release-deferred|end; "
            "parallel map pins then residual commit",
        ),
        ("reconcile", "Desired-state layout: match roles, open gaps, move/park - not a launch script"),
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

    _out(s, heading("Keybind kits", **kw))
    _out(s, "  ", cmd("forge keybind backup [name]", **kw), "  ", dim("# live → profile JSON", **kw))
    _out(s, "  ", cmd("forge keybind apply vim", **kw), "       ", dim("# built-in kit → gsettings", **kw))
    _out(s, "  ", cmd("forge keybind list", **kw), "            ", dim("# FORGE_KEYBIND_PROFILES_DIR", **kw))
    _out(
        s,
        "  ",
        dim(
            "Vim Phase 1: Shift+Super+n = tab↔stack chrome; Shift+Super+m = merge→tabbed.",
            **kw,
        ),
    )
    _blank(s)

    _out(s, dim("Per-command flags: forge <command> -h", **kw))
    _out(s, dim("Layout guide:      forge layout help", **kw))
    _out(s, dim("User docs:         docs/user/layout.md", **kw))


def print_layout_help(*, stream: TextIO | None = None) -> None:
    """`forge layout help` - generic profiles, defaults, examples."""
    s = stream if stream is not None else sys.stdout
    kw = {"stream": s}

    _out(s, heading("forge layout", **kw), " - named layout profiles (desired state)")
    _out(
        s,
        dim(
            "Named desks anytime — not morning-only. Profiles are user JSON.",
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
        ("forge layout help", "This guide"),
        ("forge layout list", "This host: Name + Description table (JSON when piped)"),
        ("forge layout show <name>", "Resolved path + validated profile"),
        ("forge layout save <name>", "Snapshot tree → host profile file (overwrite)"),
        ("forge layout save <name> --tree-file F", "Offline save from GetTree JSON"),
        ("forge layout save <name> --stdout", "Print JSON only (no write)"),
        ("forge layout save <name> --description T", "Set description (no prompt)"),
        ("forge layout save <name> --no-description", "Omit description key"),
        ("forge layout <name> --dry-run", "Plan only (human + plan JSON; mode A/B)"),
        ("forge layout <name>", "Apply; short human summary (stderr)"),
        ("forge layout <name> --verbose", "Also dump plan/apply JSON (or FORGE_VERBOSE=1)"),
        ("forge layout <name> --force-launch", "Imperative steps[] only (escape hatch)"),
        ("forge layout <name> --safe", "Open+move roles only (no park/structure/ensure)"),
        ("forge layout <name> --clean", "Close residuals (Meta delete; not park)"),
        ("forge layout <name> --clean --force", "Stronger delete; never process-kill"),
    ):
        _out(s, "  ", cmd(line, **kw))
        _out(s, "      ", dim(desc, **kw))
    _blank(s)

    _out(s, heading("Where profiles live", **kw), " ", dim("(first hit wins)", **kw))
    for line in (
        "FORGE_LAYOUT_PATH                         # one-shot file",
        "$FORGE_LAYOUT_DIR/hosts/<host>/<name>.json",
        "$FORGE_LAYOUT_DIR/hosts/<host>/<name>/profile.json",
        "$FORGE_LAYOUT_DIR/common/<name>.json",
        "~/.config/forge/layout/<name>.json        # XDG local",
    ):
        _out(s, "  ", cyan(line, **kw))
    _out(
        s,
        "  ",
        dim("Export FORGE_LAYOUT_DIR from shellrc for multi-machine trees. Host: FORGE_HOST or hostname.", **kw),
    )
    _blank(s)

    _out(s, heading("Minimal profile", **kw), " ", dim("(bare array - preferred)", **kw))
    _out(s, dim("  ~/.config/forge/layout/simple.json", **kw))
    code = """\
[ { "tab": ["firefox", "code"] }, "ghostty" ]"""
    for line in code.splitlines():
        _out(s, "  ", cyan(line, **kw))
    _blank(s)
    _out(s, "  Then: ", cmd("forge layout simple --dry-run", **kw), "  ->  ", cmd("forge layout simple", **kw))
    _blank(s)

    _out(s, heading("Layout sugar", **kw), " ", dim("(desugars to roles + layout)", **kw))
    for line, desc in (
        ("bare dual-mon array", "[[panes…], [panes…]] when len==live mon count"),
        ("bare single-mon panes", "[ pane, pane ] → mon0 (default mon split hsplit)"),
        ('{ "tab": ["a","b"] }', "tabbed pane (also t / tabbed); save uses tab"),
        ('{ "stack": ["a","b"] }', "stacked (also s / stacked)"),
        ('{ "tab": […], "active": "Grok" }', "open leaf (1st match in group)"),
        ('{ "tab": […], "active": 1 }', "open 2nd child in group (0-based)"),
        ('{ "tab": […], "active": ["Grok", 1] }', "2nd Grok in this group only"),
        ('"focus": "Grok"', "keyboard focus (1st match desk-wide)"),
        ('"focus": ["Grok", 1]', "2nd Grok desk-wide (0-based)"),
        ('{ "hsplit"|"vsplit": […] }', "split CON (also h/horizontal, v/vertical)"),
        ('{ "hsplit": […], "share": [0.67, 0.33] }', "custom widths (ratio OK: [2,1])"),
        ('"ghostty" / "Grok"', "string = open + inferred match"),
        ("mon0/mon1 keys", "explicit mons — no fold when a head is missing"),
        ("monitors: [[…],[…]]", "explicit mon list (same no-fold)"),
        ("save --monitors", "write mon0/mon1 keys instead of bare array"),
        ("rich object cell", "override when inference is not enough"),
    ):
        _out(s, "  ", cyan(line, **kw), "  ", desc)
    _blank(s)

    _out(s, heading("Defaults", **kw), " ", dim("(omit noise; Forge fills these in)", **kw))
    defaults = [
        ("version / mode", "2 / reconcile when tiles or roles present"),
        ("description", "auto one-liner on list/show when omitted"),
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
[
  [ ["a", "b"], "term-left" ],
  [ "term-right", ["mail", "chat"] ]
]"""
    for line in sketch.splitlines():
        _out(s, "  ", cyan(line, **kw))
    _out(
        s,
        "  ",
        dim("First mon child = left in hsplit; first mon1 child = left of right monitor.", **kw),
    )
    _blank(s)

    _out(s, heading("Reconcile vs steps", **kw))
    _out(s, "  ", bold("v2 bare array / tiles / roles+layout", **kw), "  reconcile (daily default)")
    _out(s, "  ", bold("v1 steps[]", **kw), "         imperative replay (can double apps)")
    _out(s, "  ", bold("--force-launch", **kw), "      force steps[] path for debug")
    _out(s, "  ", bold("--safe", **kw), "             open+move roles only (no park/structure/ensure)")
    _out(s, "  ", bold("--clean", **kw), "            close residuals (default leave; Mode B parks)")
    _out(s, "  ", bold("--clean --force", **kw), "     stronger Meta delete; never process-kill")
    _out(s, "  ", bold("marginal.mode=strict", **kw), "  no companion keep; residual leave|park still applies")
    _blank(s)

    _out(s, heading("Thrash modes", **kw), " ", dim("(auto; stderr on dry-run/apply)", **kw))
    _out(s, "  ", bold("mode=A collect", **kw), "       desk sane: open gaps, move roles, tab marginals into views")
    _out(s, "  ", bold("mode=B thrash-recover", **kw), " desk wrong: roles only + soft-park other tiles")
    _out(s, "  ", bold("thrashState", **kw), "            one line when thrashed (score + reasons)")
    _out(s, "  ", bold("thrashRisk", **kw), "             plan risk when score > 0 (structure/moves)")
    _out(s, "  ", bold("--safe", **kw), "                 skips park/structure; still reports A/B detection")
    _blank(s)

    _out(s, heading("Tips", **kw))
    _out(s, "  • Always dry-run a new profile first.")
    _out(s, "  • Match titles with ", cyan('title~="substr"', **kw), " when several windows share a class.")
    _out(s, "  • Counts: reused / opened / moved / kept / parked (or closed with --clean).")
    _out(s, "  • Default never closes windows; role windows and kept companions stay.")
    _out(s, "  • Thrashed desk: default auto Mode B recover (prefer over refuse).")
    _out(s, "  • Optional: ", cyan('"displays": "scene"', **kw), " -> gdisplays load; ", cyan('"settings": "name"', **kw), " -> SettingsLoad.")
    _out(s, "  • Offline plan: ", cmd("forge layout name --dry-run --tree-file forest.json", **kw))
    _out(s, "  • Save sketch: ", cmd("forge layout save mydesk", **kw), "  (bare array when possible)")
    _out(s, "  • In-tree examples: ", cyan("scripts/forge/examples/layout-tiles-minimal.json", **kw), dim(" (bare)", **kw))
    _out(s, "                    ", cyan("scripts/forge/examples/layout-tiles-nested.json", **kw))
    _out(s, "                    ", cyan("scripts/forge/examples/layout-minimal.json", **kw), dim(" (IR)", **kw))
    _blank(s)

    _out(s, dim("Docs: docs/user/layout.md · design: docs/DESIGN.md", **kw))
