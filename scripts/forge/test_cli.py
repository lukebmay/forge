#!/usr/bin/env python3
"""Argv + argparse for forge-test (nested + live). Not imported by user forge."""

from __future__ import annotations

import argparse
import sys
from typing import Optional, TextIO

from cli_ansi import cmd, cyan, dim, heading
from cli_help import _blank, _out
from live_cli import cmd_test
from nested_wayland import cmd_nested

FORGE_TEST = "forge-test"
NESTED_CLI = "forge-test nested"
LIVE_CLI = "forge-test live"

_NESTED_ACTIONS = frozenset(
    {
        "start",
        "stop",
        "restart",
        "status",
        "env",
        "exec",
        "run",
        "invoke",
        "dnd-drop",
        "smoke-mark2",
        "smoke-toggle-tab",
        "smoke-layout-dnd",
        "smoke-layout-ws",
        "smoke-layout-occupied",
        "smoke-layout-tabbed-edge",
        "smoke-geom-epsilon",
        "smoke-nest-apps",
        "smoke-close-reflow",
        "proof-loop",
        "enable-forge",
        "logs",
        "log",
        "wait",
        "doctor",
    }
)
_NESTED_VALUE_FLAGS = frozenset(
    {
        "--name",
        "--display",
        "--size",
        "--monitors",
        "--scale",
        "--timeout",
        "--grep",
        "--last",
        "--level",
        "--hours",
        "--iterations",
        "--seed",
        "--until",
        "--suite",
        "--cases",
        "--record-queue",
        "--trunk",
        "--branch",
    }
)
_NESTED_BOOL_FLAGS = frozenset(
    {
        "--replace",
        "--no-enable",
        "--safe-mode",
        "--allow-x11",
        "--force",
        "--keep",
        "--keep-on-fail",
        "--fail-fast",
        "--export",
        "--json",
        "--forge",
        "--follow",
        "--chaos",
        "--dry-run",
        "--rc",
        "-f",
        "-h",
        "--help",
    }
)


def hoist_nested_action_flags(argv: list[str]) -> list[str]:
    """Hoist nest flags that appear after the nested action so argparse can see them.

    ``nargs='*'`` for ``nested_cmd`` cannot consume positionals that come *after*
    options following the action token. Without this, common docs forms fail::

        forge-test nested run --monitors=1 -- true
        forge-test nested run --monitors=2 env FORGE_JOB=0 forge layout _forge-test-clean

    Expects argv starting with ``nested``. Rewrites to pre-action option order::

        nested --monitors=1 run -- true
    """
    if not argv or argv[0] != "nested":
        return list(argv)
    tokens = list(argv[1:])
    action_idx: Optional[int] = None
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t == "--":
            break
        if t in _NESTED_ACTIONS:
            action_idx = i
            break
        if t in _NESTED_BOOL_FLAGS or t in ("-h", "--help"):
            i += 1
            continue
        if t.startswith("--") and "=" in t:
            key = t.split("=", 1)[0]
            if key in _NESTED_VALUE_FLAGS:
                i += 1
                continue
            break
        if t in _NESTED_VALUE_FLAGS:
            i += 2
            continue
        if t.startswith("-"):
            i += 1
            continue
        break
    if action_idx is None:
        return list(argv)

    action = tokens[action_idx]
    before = tokens[:action_idx]
    after = tokens[action_idx + 1 :]

    hoisted: list[str] = []
    cmd_rest: list[str] = []
    j = 0
    while j < len(after):
        t = after[j]
        if t == "--":
            cmd_rest = after[j:]
            break
        if t in _NESTED_BOOL_FLAGS:
            hoisted.append(t)
            j += 1
            continue
        if t.startswith("--") and "=" in t:
            key = t.split("=", 1)[0]
            if key in _NESTED_VALUE_FLAGS:
                hoisted.append(t)
                j += 1
                continue
            cmd_rest = after[j:]
            break
        if t in _NESTED_VALUE_FLAGS:
            hoisted.append(t)
            if j + 1 < len(after):
                hoisted.append(after[j + 1])
                j += 2
            else:
                j += 1
            continue
        cmd_rest = after[j:]
        break

    if not hoisted:
        return list(argv)
    return ["nested", *before, *hoisted, action, *cmd_rest]


def print_forge_test_help(*, stream: TextIO | None = None) -> None:
    """Top-level `forge-test help` (color when TTY)."""
    s = stream if stream is not None else sys.stdout
    kw = {"stream": s}

    _out(s, heading("forge-test", **kw),
         " - developer / agent test CLI (not the user forge product)")
    _out(s, dim("Not installed by normal ./install. Clone: ./scripts/forge/forge-test", **kw))
    _blank(s)

    _out(s, heading("Commands", **kw))
    rows = [
        ("nested", "Nested Wayland GNOME Shell retest (reload JS without logout)"),
        ("live", "AI live matrix: probe / list / plan / run"),
        ("help", "This page (also: forge-test --help)"),
    ]
    for name, desc in rows:
        _out(s, "  ", cyan(f"{name:<22}", **kw), " ", desc)
    _blank(s)

    _out(s, heading("Nested", **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} --trunk trunk.open.launch-into-2slot", **kw),
         "  ", dim("# lightest open trunk (T3 body)", **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} --trunk trunk.open --dry-run", **kw),
         "  ", dim("# print resolved story ids", **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} --branch branch.layout.ws2-no-mutate-ws1", **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} --rc --dry-run", **kw),
         "  ", dim("# full story tree; unimplemented listed", **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} proof-loop --suite rc --dry-run", **kw),
         "  ", dim("# same tree; expected-fail is XFAIL", **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} run -- forge ping", **kw), "  ",
         dim("# one-shot; always stops", **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} run --monitors=2 -- forge tree", **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} invoke join.right --hint leftmost", **kw),
         "  ", dim("# Mark 2 command({name}); no Super+key", **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} dnd-drop leftmost rightmost --zone center", **kw),
         "  ", dim("# synthetic drop → _commitResolvedDrop", **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} run -- python3 scripts/forge/nest_mark2_smoke.py",
                     **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} smoke-mark2", **kw), "            ",
         dim("# alias --trunk trunk.mark2.join-enter", **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} smoke-close-reflow", **kw), "  ",
         dim("# alias --trunk trunk.close.three-equal-one-gone", **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} smoke-nest-apps", **kw), "        ",
         dim("# isolation tool (not a story)", **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} smoke-geom-epsilon", **kw), "     ",
         dim("# D095 measure tool (not a story)", **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} smoke-layout-tabbed-edge", **kw), "",
         dim("# Join-invent tool (not RC trunk)", **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} proof-loop --suite core --iterations 1", **kw),
         "  ", dim("# seven trunks; always-stop per case", **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} restart", **kw), "                 ",
         dim("# interactive loop; stop when done", **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} status", **kw), "                  ",
         dim("# want running: False after campaigns", **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} log --grep PAT --level info+ --last 40", **kw),
         "  ", dim("# nest forge.jsonl (plog-query; nest need not be up)", **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} logs", **kw), "                    ",
         dim("# gnome-shell stderr (shell.log)", **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} doctor", **kw))
    _out(s, "  ", cmd(f"{NESTED_CLI} --help", **kw))
    _blank(s)

    _out(s, heading("Live matrix", **kw))
    _out(s, "  ", cmd(f"{LIVE_CLI} probe", **kw))
    _out(s, "  ", cmd(f"{LIVE_CLI} list", **kw))
    _out(s, "  ", cmd(f"{LIVE_CLI} plan --from-work open-leaf", **kw))
    _out(s, "  ", cmd(f"{LIVE_CLI} run --from-work cold", **kw), "  ",
         dim("# destructive; durable job", **kw))
    _out(s, "  ", cmd(f"{LIVE_CLI} --help", **kw))
    _blank(s)

    _out(s, dim("Layouts in matrix: only _forge-test-* (never personal dev/t1).", **kw))
    _out(s, dim("User product CLI remains: forge (layout, tree, install, …).", **kw))
    _out(
        s,
        dim("Opt-in PATH: ./install --with-test-cli  →  ~/.local/bin/forge-test", **kw),
    )


def _cmd_help(_backend: object, _args: argparse.Namespace) -> int:
    print_forge_test_help()
    return 0


def add_nested_parser(sub: argparse._SubParsersAction) -> argparse.ArgumentParser:
    nested_p = sub.add_parser(
        "nested",
        help="Nested Wayland GNOME Shell retest harness",
        description=(
            "Nested Wayland GNOME Shell retest harness (developer / agent).\n"
            f"Entry: {NESTED_CLI} <action> …\n"
            "\n"
            "Story tree (design catalog; not legacy smoke-* names):\n"
            f"  {NESTED_CLI} --trunk trunk.open.launch-into-2slot\n"
            f"  {NESTED_CLI} --trunk trunk.open --dry-run\n"
            f"  {NESTED_CLI} --branch branch.layout.ws2-no-mutate-ws1\n"
            f"  {NESTED_CLI} --rc\n"
            f"  {NESTED_CLI} proof-loop --trunk trunk.open --dry-run\n"
            "  Day-to-day: pass --trunk (or --branch / --rc). No implicit story.\n"
            "  proof-loop --suite core = seven trunks; --suite rc = full tree.\n"
            "  regression/chaos loop the core trunk tree.\n"
            "\n"
            f"  {NESTED_CLI} start                 # start nest + enable Forge\n"
            f"  {NESTED_CLI} start --monitors=2    # dual virtual mon (dummy)\n"
            f"  {NESTED_CLI} status\n"
            f"  eval $({NESTED_CLI} env --export)  # point forge/apps at nest\n"
            "  forge ping                              # talks to nested Forge\n"
            f"  {NESTED_CLI} exec -- gnome-text-editor\n"
            f"  {NESTED_CLI} run -- true           # campaign: start→cmd→always stop\n"
            f"  {NESTED_CLI} invoke join.right --hint leftmost  # Mark 2 command({{name}})\n"
            f"  {NESTED_CLI} invoke move.left --window-id 42 --activate\n"
            f"  {NESTED_CLI} invoke toggleSplit --selector 'class:org.gnome.Nautilus'\n"
            f"  {NESTED_CLI} dnd-drop leftmost rightmost --zone center\n"
            f"  {NESTED_CLI} dnd-drop leftmost --dest-monitor 1\n"
            f"  {NESTED_CLI} smoke-mark2           # alias --trunk trunk.mark2.join-enter\n"
            f"  {NESTED_CLI} smoke-toggle-tab      # alias --branch branch.tabs.stacked-same-slot\n"
            f"  {NESTED_CLI} smoke-layout-dnd      # alias --branch leaf.mark2.move-empty-monitor\n"
            f"  {NESTED_CLI} smoke-layout-ws       # alias --branch branch.layout.ws2-no-mutate-ws1\n"
            f"  {NESTED_CLI} smoke-layout-occupied # alias --branch branch.layout.missing-roles-open\n"
            f"  {NESTED_CLI} smoke-close-reflow   # alias --trunk trunk.close.three-equal-one-gone\n"
            f"  {NESTED_CLI} smoke-layout-tabbed-edge # tool (Join-invent); not RC trunk\n"
            f"  {NESTED_CLI} smoke-geom-epsilon   # tool (D095 measure); not a story\n"
            f"  {NESTED_CLI} smoke-nest-apps      # tool (isolation); not a story\n"
            f"  {NESTED_CLI} proof-loop --suite core --iterations 1\n"
            f"  {NESTED_CLI} proof-loop --suite rc --dry-run\n"
            f"  {NESTED_CLI} proof-loop --suite regression --hours 8\n"
            f"  {NESTED_CLI} log --grep PAT --level info+ --last 40\n"
            f"  {NESTED_CLI} logs                  # gnome-shell stderr (shell.log)\n"
            f"  {NESTED_CLI} restart               # reload shell/extension\n"
            f"  {NESTED_CLI} stop\n"
            "\n"
            "nested log queries nest forge.jsonl via plog-query (tapes survive stop).\n"
            "nested logs dumps gnome-shell stderr (shell.log) — not the hunt tape.\n"
            "Mark 2 invoke uses Shell.Eval → extWm.command (e2e dbus path), not Super+key.\n"
            "dnd-drop is sessionApi._dndDropOp → _commitResolvedDrop (empty-mon:\n"
            "_commitEmptyMonitorDrop). smoke-* tiling aliases wrap --trunk/--branch.\n"
            "smoke-nest-apps / smoke-geom-epsilon / smoke-layout-tabbed-edge stay tools.\n"
            "proof-loop --suite core = all trunks (always-stop per case).\n"
            "--suite rc / --rc = full stories.md tree (unimplemented is non-zero).\n"
            "Plan-named expected-fail prints XFAIL and is not hard red.\n"
            "regression/chaos loop the core trunk tree. wake-approx / host unchanged.\n"
            "On fail: JSONL queue + repro; stop unless --until keep-going.\n"
            "--keep-on-fail leaves the nest up.\n"
            "Do not use product `forge Move` (dest-reparent) as move.left.\n"
            f"Campaign entry: prefer `{NESTED_CLI} run` (always stops on exit).\n"
            "Multi-monitor: MUTTER_DEBUG_NUM_DUMMY_MONITORS (not host desks).\n"
            "Independent of shellrc. State: ~/.local/state/forge/nested/<name>/\n"
            "Override root: FORGE_NESTED_ROOT=…"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    nested_p.add_argument(
        "nested_action",
        nargs="?",
        default="status",
        help=(
            "start | stop | restart | status | env | exec | run | invoke | "
            "dnd-drop | smoke-mark2 | smoke-toggle-tab | smoke-layout-dnd | "
            "smoke-layout-ws | smoke-layout-occupied | smoke-layout-tabbed-edge | "
            "smoke-geom-epsilon | smoke-nest-apps | smoke-close-reflow | "
            "proof-loop | enable-forge | log | logs | wait | doctor  "
            "(default: status)"
        ),
    )
    nested_p.add_argument(
        "--name",
        dest="nested_name",
        default="forge",
        help="Session name (default: forge)",
    )
    nested_p.add_argument(
        "--display",
        default=None,
        help="Nested WAYLAND_DISPLAY name (default: wayland-forge)",
    )
    nested_p.add_argument(
        "--size",
        default=None,
        help="Virtual mode size WxH per dummy mon (default: 1920x1080 Full HD)",
    )
    nested_p.add_argument(
        "--monitors",
        type=int,
        default=None,
        help=(
            "Number of dummy monitors in the nest (1–4, default 1). "
            "Use 2 for dual-mon layout tests without host dual geometry."
        ),
    )
    nested_p.add_argument(
        "--scale",
        default=None,
        help="Dummy monitor scale(s): one value or comma list (default: 1, no scaling)",
    )
    nested_p.add_argument(
        "--replace",
        action="store_true",
        help="With start: stop existing session first",
    )
    nested_p.add_argument(
        "--no-enable",
        action="store_true",
        help="With start/restart: do not enable Forge on the nest",
    )
    nested_p.add_argument(
        "--safe-mode",
        action="store_true",
        help="Omit gnome-shell --unsafe-mode (Eval/extension hooks limited)",
    )
    nested_p.add_argument(
        "--allow-x11",
        action="store_true",
        help=(
            "Do not refuse on X11 host (experimental; still needs a parent "
            "Wayland socket). Default: exit 2 on X11 with HUP guidance."
        ),
    )
    nested_p.add_argument(
        "--force",
        action="store_true",
        help="With stop: SIGKILL after grace",
    )
    nested_p.add_argument(
        "--keep",
        action="store_true",
        help="With run: leave nest running after command (debug; default always-stop)",
    )
    nested_p.add_argument(
        "--export",
        dest="export_env",
        action="store_true",
        help="With env: print export lines for eval",
    )
    nested_p.add_argument(
        "--json",
        action="store_true",
        help="With status/env/log/proof-loop: JSON",
    )
    nested_p.add_argument(
        "-f",
        "--follow",
        action="store_true",
        help="With logs: tail -F gnome-shell stderr (shell.log)",
    )
    nested_p.add_argument(
        "--grep",
        default=None,
        help="With log: regex on nest forge.jsonl text",
    )
    nested_p.add_argument(
        "--last",
        type=int,
        default=None,
        help="With log: last N matching records (default 80; 0 = all)",
    )
    nested_p.add_argument(
        "--level",
        default=None,
        help="With log: plog-query level spec (default info+)",
    )
    nested_p.add_argument(
        "--forge",
        dest="wait_forge",
        action="store_true",
        help="With wait: also wait for Forge DBus name",
    )
    nested_p.add_argument(
        "--timeout",
        type=float,
        default=None,
        help="With wait: seconds (default 30)",
    )
    nested_p.add_argument(
        "--suite",
        default=None,
        help="With proof-loop: core (alias: smoke) = trunks; rc = full tree; "
        "regression|chaos loop core; wake-approx | host. "
        "Plan-named expected-fail is XFAIL, not hard red.",
    )
    story_g = nested_p.add_mutually_exclusive_group()
    story_g.add_argument(
        "--trunk",
        dest="story_trunk",
        default=None,
        metavar="ID",
        help=(
            "Story trunk only (prefix ok if unique: trunk.open). "
            "Lightest net. No implicit default story."
        ),
    )
    story_g.add_argument(
        "--branch",
        dest="story_branch",
        default=None,
        metavar="ID",
        help="Story branch and descendant leaves (not sibling trunks)",
    )
    story_g.add_argument(
        "--rc",
        dest="story_rc",
        action="store_true",
        help=(
            "Full story tree from stories.md (skip fail-safe leaf unless "
            "fixture). Unimplemented is non-zero. Plan-named expected-fail "
            "is XFAIL, not hard red."
        ),
    )
    nested_p.add_argument(
        "--hours",
        type=float,
        default=None,
        help="With proof-loop: wall-clock stop (hours)",
    )
    nested_p.add_argument(
        "--iterations",
        type=int,
        default=None,
        help="With proof-loop: full suite passes (default 1 if no --hours)",
    )
    nested_p.add_argument(
        "--seed",
        type=int,
        default=None,
        help="With proof-loop: integer seed (chaos + JSONL)",
    )
    nested_p.add_argument(
        "--until",
        default=None,
        help="With proof-loop: fail (default) | keep-going",
    )
    nested_p.add_argument(
        "--fail-fast",
        dest="fail_fast",
        action="store_true",
        help="With proof-loop: alias for --until fail",
    )
    nested_p.add_argument(
        "--keep-on-fail",
        dest="keep_on_fail",
        action="store_true",
        help="With proof-loop: stop after first fail and leave nest running",
    )
    nested_p.add_argument(
        "--cases",
        default=None,
        help="With proof-loop: comma-separated case ids / smoke names",
    )
    nested_p.add_argument(
        "--chaos",
        action="store_true",
        help="With proof-loop: FORGE_LAYOUT_CHAOS=1 on layout cases",
    )
    nested_p.add_argument(
        "--dry-run",
        dest="dry_run",
        action="store_true",
        help="With proof-loop / --trunk / --branch / --rc: print resolved ids; no nest",
    )
    nested_p.add_argument(
        "--record-queue",
        dest="record_queue",
        default=None,
        help="With proof-loop: failures JSONL path (default nest state)",
    )
    nested_p.add_argument(
        "nested_cmd",
        nargs="*",
        default=[],
        help="With exec/run: command (put -- before foreign flags)",
    )
    nested_p.set_defaults(func=cmd_nested)
    return nested_p


def add_live_parser(sub: argparse._SubParsersAction) -> argparse.ArgumentParser:
    live_p = sub.add_parser(
        "live",
        help="AI live matrix: probe / list / plan / run",
        description=(
            "Developer / agent live test matrix (not a user product verb).\n"
            "\n"
            f"  {LIVE_CLI} probe              # session + agent + gates\n"
            f"  {LIVE_CLI} list               # catalog JSON\n"
            f"  {LIVE_CLI} plan               # auto suite for this capability\n"
            f"  {LIVE_CLI} plan --from-work open-leaf\n"
            f"  {LIVE_CLI} plan --tags R008\n"
            f"  {LIVE_CLI} plan --suite partial\n"
            f"  {LIVE_CLI} run --from-work cold   # execute (destructive)\n"
            "\n"
            "Do not always run everything: pick behaviors that current work can\n"
            "change. New regressions must add a catalog case (R0xx tag).\n"
            "Docs: agents/plans/forge-ai-live-test-matrix.md · agents/testing.md"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    live_p.add_argument(
        "live_action",
        nargs="?",
        default="plan",
        help="probe | list | plan | run  (default: plan)",
    )
    live_p.add_argument(
        "--suite",
        default="auto",
        help="auto | partial (L1) | cold (L2) | regression (needs --tags/--behaviors)",
    )
    live_p.add_argument(
        "--behaviors",
        metavar="LIST",
        default=None,
        help="Comma-separated behaviors (open-leaf,layout-apply,cold-open,…)",
    )
    live_p.add_argument(
        "--tags",
        metavar="LIST",
        default=None,
        help="Comma-separated tags / regression ids (R008,L1.ghosttys-only)",
    )
    live_p.add_argument(
        "--cases",
        metavar="LIST",
        default=None,
        help="Comma-separated case ids only",
    )
    live_p.add_argument(
        "--from-work",
        metavar="HINT",
        default=None,
        dest="from_work",
        help=(
            "Work-area hint → behaviors: layout-apply|open-leaf|focus|cold|"
            "clean|close|save|settle|dock  or free behavior list"
        ),
    )
    live_p.add_argument(
        "--tree-file",
        metavar="PATH",
        default=None,
        help="Offline forest for probe/plan (no DBus)",
    )
    live_p.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="JSON dump with human plan/results",
    )
    live_p.add_argument(
        "--report",
        metavar="PATH",
        default=None,
        help=(
            "Write JSON results+metrics to PATH. "
            "Default auto path under agents/test-results/wayland/; "
            "FORGE_LIVE_REPORT=none to disable"
        ),
    )
    live_p.set_defaults(func=cmd_test, test_which="live")
    return live_p


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog=FORGE_TEST,
        description=(
            "Forge developer / agent test CLI. Not the user product.\n"
            f"Colorized overview: {FORGE_TEST} help\n"
            "\n"
            "Nested Wayland retest + live matrix. Ordinary ./install does not\n"
            f"put this on PATH. From a clone: ./scripts/forge/{FORGE_TEST}"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        add_help=True,
    )
    p.add_argument(
        "--color",
        choices=("auto", "always", "never"),
        default=None,
        help="ANSI color for help (default: auto)",
    )
    sub = p.add_subparsers(dest="command", required=True)
    help_p = sub.add_parser("help", help="Colorized overview")
    help_p.set_defaults(func=_cmd_help)
    add_nested_parser(sub)
    add_live_parser(sub)
    return p
