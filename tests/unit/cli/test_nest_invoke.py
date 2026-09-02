"""Unit tests for nest Mark 2 invoke (no live gnome-shell)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from nest_invoke import (  # noqa: E402
    MARK2_ACTION_IDS,
    InvokeError,
    build_dnd_drop_js,
    build_invoke_js,
    dnd_token_to_selector,
    forest_fingerprint,
    get_tree_options_json,
    parse_dnd_drop_argv,
    parse_invoke_argv,
    parse_invoke_result,
    require_nest_client_env,
    resolve_window_id,
    spec_from_args,
    tiled_windows,
    unpack_eval_payload,
    unpack_gdbus_string,
    validate_action_name,
)


def test_validate_action_rejects_product_move() -> None:
    with pytest.raises(InvokeError, match="move.left"):
        validate_action_name("move")
    with pytest.raises(InvokeError, match="move.left"):
        validate_action_name("Move")
    with pytest.raises(InvokeError, match="join.left"):
        validate_action_name("swap")
    assert validate_action_name("move.left") == "move.left"
    assert validate_action_name("join.right") == "join.right"
    assert validate_action_name("toggleSplit") == "toggleSplit"


def test_require_nest_client_env_refuses_host() -> None:
    with pytest.raises(InvokeError, match="FORGE_CONFIG_HOME") as ei:
        require_nest_client_env(
            {
                "WAYLAND_DISPLAY": "wayland-0",
                "XDG_RUNTIME_DIR": "/run/user/1000",
            },
            what="t",
        )
    assert ei.value.exit_code == 2

    with pytest.raises(InvokeError, match="host desk") as ei2:
        require_nest_client_env(
            {
                "FORGE_CONFIG_HOME": "/tmp/x/forge-config",
                "WAYLAND_DISPLAY": "wayland-0",
                "XDG_RUNTIME_DIR": "/tmp/nested/forge/runtime",
            },
            what="t",
        )
    assert ei2.value.exit_code == 2

    with pytest.raises(InvokeError, match="empty WAYLAND_DISPLAY") as ei3:
        require_nest_client_env(
            {
                "FORGE_CONFIG_HOME": "/tmp/nested/forge/forge-config",
                "WAYLAND_DISPLAY": "",
                "XDG_RUNTIME_DIR": "/tmp/nested/forge/runtime",
            },
            what="t",
        )
    assert ei3.value.exit_code == 2

    with pytest.raises(InvokeError, match="XDG_RUNTIME_DIR") as ei4:
        require_nest_client_env(
            {
                "FORGE_CONFIG_HOME": "/tmp/x/forge-config",
                "WAYLAND_DISPLAY": "wayland-forge",
                "XDG_RUNTIME_DIR": "/run/user/1000/forge-something",
            },
            what="t",
        )
    assert ei4.value.exit_code == 2

    require_nest_client_env(
        {
            "FORGE_CONFIG_HOME": "/tmp/nested/forge/forge-config",
            "WAYLAND_DISPLAY": "wayland-forge",
            "XDG_RUNTIME_DIR": "/tmp/nested/forge/runtime",
        },
        what="t",
    )


def test_mark2_ids_include_plan_surface() -> None:
    for aid in ("move.left", "join.right", "toggleSplit", "promote", "focus.left"):
        assert aid in MARK2_ACTION_IDS


def test_parse_invoke_argv_selector_flags() -> None:
    ns = parse_invoke_argv(
        ["join.right", "--hint", "leftmost", "--activate", "--class", "nautilus"]
    )
    assert ns.action == "join.right"
    assert ns.hint == "leftmost"
    assert ns.activate is True
    assert ns.wm_class == "nautilus"
    spec = spec_from_args(ns)
    assert spec["hint"] == "leftmost"
    assert spec["wmClass"] == "nautilus"
    assert spec["activate"] is True


def test_parse_invoke_window_id_and_selector() -> None:
    ns = parse_invoke_argv(["move.left", "--window-id", "42", "--selector", "id:42"])
    assert ns.window_id == "42"
    assert ns.selector == "id:42"


def test_build_invoke_js_is_eval_command() -> None:
    js = build_invoke_js({"name": "join.right"}, {"hint": "leftmost", "activate": True})
    assert "ext.extWm.command" in js
    assert '"join.right"' in js
    assert "leftmost" in js
    assert "import " not in js
    assert "%%FORGE_INVOKE_ACTION%%" not in js


def test_unpack_eval_json_tuple() -> None:
    raw = """(true, '{"ok":true,"name":"join.right"}')"""
    text = unpack_eval_payload(raw)
    data = json.loads(text)
    assert data["ok"] is True
    assert data["name"] == "join.right"


def test_parse_invoke_result_eval_tuple() -> None:
    inner = json.dumps({"ok": True, "name": "move.left"})
    got = parse_invoke_result(f"(true, '{inner}')")
    assert got["ok"] is True
    assert got["name"] == "move.left"
    # JSON.stringify body wrapped as a JSON string (no gdbus tuple).
    got2 = parse_invoke_result(json.dumps(inner))
    assert got2["ok"] is True
    assert got2["name"] == "move.left"


def test_unpack_gdbus_get_tree() -> None:
    payload = '{"apiVersion":2,"monitors":[]}'
    assert unpack_gdbus_string(f"('{payload}',)") == payload


def test_get_tree_options_json() -> None:
    assert get_tree_options_json() == "{}"
    assert json.loads(get_tree_options_json(workspace=1)) == {"workspace": 1}


def test_forest_fingerprint_shape() -> None:
    forest = {
        "monitors": [
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "children": [
                    {
                        "nodeType": "CON",
                        "layout": "HSPLIT",
                        "children": [
                            {"nodeType": "WINDOW", "windowId": 1, "mode": "TILE"},
                            {"nodeType": "WINDOW", "windowId": 2, "mode": "TILE"},
                        ],
                    }
                ],
            }
        ]
    }
    wins = tiled_windows(forest)
    assert len(wins) == 2
    fp = forest_fingerprint(forest)
    assert ("CON", "HSPLIT", "") in fp
    assert ("WINDOW", "1", "TILE") in fp
    assert resolve_window_id(forest, {"hint": "leftmost"}) == "1"
    assert resolve_window_id(forest, {"id": "2"}) == "2"


def test_hoist_leaves_invoke_hint_in_cmd() -> None:
    from test_cli import hoist_nested_action_flags as hoist

    argv = ["nested", "invoke", "join.right", "--hint", "leftmost", "--activate"]
    assert hoist(argv) == argv
    hoisted = hoist(["nested", "invoke", "move.left", "--json"])
    assert hoisted[0] == "nested"
    assert "--json" in hoisted
    assert "invoke" in hoisted
    assert "move.left" in hoisted


def test_parse_dnd_drop_argv_zone_and_empty_mon() -> None:
    ns = parse_dnd_drop_argv(["leftmost", "rightmost", "--zone", "right"])
    assert ns.tile == "leftmost"
    assert ns.onto == "rightmost"
    assert ns.zone == "right"
    empty = parse_dnd_drop_argv(["leftmost", "--dest-monitor", "1"])
    assert empty.tile == "leftmost"
    assert empty.onto is None
    assert empty.dest_monitor == 1


def test_dnd_token_to_selector_hint_and_id() -> None:
    forest = {
        "monitors": [
            {
                "nodeType": "MONITOR",
                "layout": "HSPLIT",
                "children": [
                    {"nodeType": "WINDOW", "windowId": 11, "mode": "TILE", "rect": {"x": 0}},
                    {"nodeType": "WINDOW", "windowId": 22, "mode": "TILE", "rect": {"x": 900}},
                ],
            }
        ]
    }
    assert dnd_token_to_selector("leftmost", forest) == "id:11"
    assert dnd_token_to_selector("rightmost", forest) == "id:22"
    assert dnd_token_to_selector("42") == "id:42"
    assert dnd_token_to_selector("class:nautilus") == "class:nautilus"
    with pytest.raises(InvokeError, match="GetTree"):
        dnd_token_to_selector("leftmost")


def test_build_dnd_drop_js_hits_session_commit() -> None:
    js = build_dnd_drop_js(
        {"tile": "id:1", "onto": "id:2", "zone": "RIGHT", "quiet": True}
    )
    assert "sessionApi" in js
    assert "_dndDropOp" in js
    assert '"id:1"' in js
    assert '"RIGHT"' in js
    assert "import " not in js
    assert "%%FORGE_DND_SPEC%%" not in js
    empty = build_dnd_drop_js(
        {"tile": "id:1", "onto": "", "zone": "CENTER", "destMonitor": 1, "quiet": True}
    )
    assert "destMonitor" in empty
    assert "_dndDropOp" in empty


def test_hoist_leaves_dnd_drop_zone_in_cmd() -> None:
    from test_cli import hoist_nested_action_flags as hoist

    argv = ["nested", "dnd-drop", "leftmost", "rightmost", "--zone", "center"]
    assert hoist(argv) == argv
    hoisted = hoist(["nested", "dnd-drop", "leftmost", "--json"])
    assert hoisted[0] == "nested"
    assert "--json" in hoisted
    assert "dnd-drop" in hoisted
    assert "leftmost" in hoisted


def test_forge_test_help_mentions_invoke() -> None:
    import io

    import cli_ansi
    import test_cli

    cli_ansi.set_color_mode("never")
    buf = io.StringIO()
    test_cli.print_forge_test_help(stream=buf)
    text = buf.getvalue()
    assert "invoke" in text
    assert "join.right" in text
    assert "dnd-drop" in text
    assert "nest_mark2_smoke" in text or "smoke-mark2" in text
