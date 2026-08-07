// Meta Probe — Forge-independent Meta event recorder + op DBus.
// GNOME Shell 45+ ESM. No tiling, no tree, no Forge imports.

import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Meta from "gi://Meta";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

const PROBE_VERSION = "0.2.0";
const BUS_NAME = "org.gnome.Shell.Extensions.MetaProbe";
const BUS_PATH = "/org/gnome/Shell/Extensions/MetaProbe";

const IFACE_XML = `
<node>
  <interface name="org.gnome.Shell.Extensions.MetaProbe">
    <method name="Ping">
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="ListWindows">
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="ClearEvents">
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="GetEvents">
      <arg type="u" direction="in" name="since_seq"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="BeginMark">
      <arg type="s" direction="in" name="label"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="SnapshotWindow">
      <arg type="u" direction="in" name="window_id"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="MoveResize">
      <arg type="u" direction="in" name="window_id"/>
      <arg type="i" direction="in" name="x"/>
      <arg type="i" direction="in" name="y"/>
      <arg type="i" direction="in" name="width"/>
      <arg type="i" direction="in" name="height"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="MoveToMonitor">
      <arg type="u" direction="in" name="window_id"/>
      <arg type="i" direction="in" name="monitor"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="MoveToWorkspace">
      <arg type="u" direction="in" name="window_id"/>
      <arg type="i" direction="in" name="workspace"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="Activate">
      <arg type="u" direction="in" name="window_id"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="Raise">
      <arg type="u" direction="in" name="window_id"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="Unmaximize">
      <arg type="u" direction="in" name="window_id"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="Minimize">
      <arg type="u" direction="in" name="window_id"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="Unminimize">
      <arg type="u" direction="in" name="window_id"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="MakeAbove">
      <arg type="u" direction="in" name="window_id"/>
      <arg type="b" direction="in" name="above"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="Fullscreen">
      <arg type="u" direction="in" name="window_id"/>
      <arg type="b" direction="in" name="fullscreen"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="Close">
      <arg type="u" direction="in" name="window_id"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="FocusWorkspace">
      <arg type="i" direction="in" name="index"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="GetEnv">
      <arg type="s" direction="out" name="json"/>
    </method>
  </interface>
</node>`;

function monoMs() {
  return GLib.get_monotonic_time() / 1000.0;
}

function wallIso() {
  return new Date().toISOString();
}

function safeCall(fn, fallback = null) {
  try {
    return fn();
  } catch (_e) {
    return fallback;
  }
}

function frameOf(metaWindow) {
  const r = safeCall(() => metaWindow.get_frame_rect());
  if (!r) return null;
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

function winId(metaWindow) {
  return safeCall(() => metaWindow.get_id?.() ?? metaWindow.get_stable_sequence?.(), 0) || 0;
}

function unmaximizeBestEffort(mw) {
  if (!mw?.unmaximize) return;
  try {
    mw.unmaximize(Meta.MaximizeFlags.BOTH);
  } catch (_e) {
    try {
      mw.unmaximize(3);
    } catch (_e2) {
      /* ignore */
    }
  }
}

export default class MetaProbeExtension extends Extension {
  enable() {
    this._seq = 0;
    this._events = [];
    this._maxEvents = 80000;
    this._tracked = new Map();
    this._displaySignals = [];
    this._dbus = null;
    this._nameOwnerId = 0;

    this._bindDisplay();
    this._exportDbus();
    this._record("probe-enabled", null, {});
  }

  disable() {
    this._record("probe-disabled", null, {});
    this._untrackAll();
    this._unbindDisplay();
    this._unexportDbus();
    this._events = [];
    this._tracked = new Map();
  }

  _exportDbus() {
    this._dbus = Gio.DBusExportedObject.wrapJSObject(IFACE_XML, this);
    this._dbus.export(Gio.DBus.session, BUS_PATH);
    this._nameOwnerId = Gio.DBus.session.own_name(
      BUS_NAME,
      Gio.BusNameOwnerFlags.NONE,
      () => {},
      () => {}
    );
  }

  _unexportDbus() {
    if (this._dbus) {
      try {
        this._dbus.unexport();
      } catch (_e) {
        /* ignore */
      }
      this._dbus = null;
    }
    if (this._nameOwnerId) {
      Gio.DBus.session.unown_name(this._nameOwnerId);
      this._nameOwnerId = 0;
    }
  }

  _bindDisplay() {
    const display = global.display;
    const created = display.connect("window-created", (_d, metaWindow) => {
      this._record("window-created", metaWindow, {});
      this._trackWindow(metaWindow);
    });
    this._displaySignals.push([display, created]);

    const actors = global.get_window_actors?.() || [];
    for (const actor of actors) {
      const mw = actor.meta_window;
      if (mw) this._trackWindow(mw);
    }
  }

  _unbindDisplay() {
    for (const [obj, id] of this._displaySignals) {
      try {
        obj.disconnect(id);
      } catch (_e) {
        /* ignore */
      }
    }
    this._displaySignals = [];
  }

  _trackWindow(metaWindow) {
    if (!metaWindow) return;
    const id = winId(metaWindow);
    if (!id || this._tracked.has(id)) return;

    const signals = [];
    const connect = (sig, handler) => {
      try {
        signals.push(metaWindow.connect(sig, handler));
      } catch (_e) {
        /* optional signal */
      }
    };

    connect("position-changed", (mw) => this._record("position-changed", mw, {}));
    connect("size-changed", (mw) => this._record("size-changed", mw, {}));
    connect("raised", (mw) => this._record("raised", mw, {}));
    connect("unmanaged", (mw) => {
      this._record("unmanaged", mw, {});
      this._untrackWindow(winId(mw));
    });
    connect("workspace-changed", (mw) => this._record("workspace-changed", mw, {}));
    connect("notify::wm-class", (mw) =>
      this._record("notify::wm-class", mw, {
        wmClass: safeCall(() => mw.get_wm_class()),
      })
    );
    connect("notify::title", (mw) =>
      this._record("notify::title", mw, {
        title: safeCall(() => mw.get_title()),
      })
    );
    connect("notify::appears-focused", (mw) =>
      this._record("notify::appears-focused", mw, {
        focused: safeCall(() => mw.has_focus?.() || mw.appears_focused, false),
      })
    );
    connect("notify::fullscreen", (mw) =>
      this._record("notify::fullscreen", mw, {
        fullscreen: safeCall(() => mw.is_fullscreen?.(), false),
      })
    );
    connect("notify::minimized", (mw) =>
      this._record("notify::minimized", mw, {
        minimized: safeCall(() => mw.minimized, false),
      })
    );
    connect("notify::maximized-horizontally", (mw) =>
      this._record("notify::maximized-horizontally", mw, {})
    );
    connect("notify::maximized-vertically", (mw) =>
      this._record("notify::maximized-vertically", mw, {})
    );

    this._tracked.set(id, { meta: metaWindow, signals });
  }

  _untrackWindow(id) {
    const ent = this._tracked.get(id);
    if (!ent) return;
    for (const sid of ent.signals) {
      try {
        ent.meta.disconnect(sid);
      } catch (_e) {
        /* ignore */
      }
    }
    this._tracked.delete(id);
  }

  _untrackAll() {
    for (const id of [...this._tracked.keys()]) this._untrackWindow(id);
  }

  _findMeta(windowId) {
    const ent = this._tracked.get(windowId);
    if (ent?.meta) return ent.meta;
    const actors = global.get_window_actors?.() || [];
    for (const actor of actors) {
      const mw = actor.meta_window;
      if (mw && winId(mw) === windowId) {
        this._trackWindow(mw);
        return mw;
      }
    }
    return null;
  }

  _snapshot(metaWindow) {
    if (!metaWindow) return null;
    return {
      windowId: winId(metaWindow),
      wmClass: safeCall(() => metaWindow.get_wm_class()),
      wmClassInstance: safeCall(() => metaWindow.get_wm_class_instance?.()),
      title: safeCall(() => metaWindow.get_title()),
      frame: frameOf(metaWindow),
      monitor: safeCall(() => metaWindow.get_monitor(), -1),
      workspace: safeCall(() => metaWindow.get_workspace()?.index?.(), -1),
      maximized: safeCall(() => {
        if (metaWindow.get_maximized) return metaWindow.get_maximized();
        return 0;
      }, 0),
      fullscreen: safeCall(() => metaWindow.is_fullscreen?.(), false),
      minimized: safeCall(() => !!metaWindow.minimized, false),
      focused: safeCall(() => metaWindow.has_focus?.(), false),
      above: safeCall(() => metaWindow.is_above?.(), false),
      windowType: safeCall(() => metaWindow.get_window_type?.(), -1),
      pid: safeCall(() => metaWindow.get_pid?.(), 0),
      transientFor: safeCall(() => {
        const t = metaWindow.get_transient_for?.();
        return t ? winId(t) : 0;
      }, 0),
    };
  }

  _record(signal, metaWindow, extra) {
    this._seq += 1;
    const snap = metaWindow ? this._snapshot(metaWindow) : null;
    const ev = {
      seq: this._seq,
      monoMs: monoMs(),
      wall: wallIso(),
      signal,
      windowId: snap?.windowId || 0,
      snapshot: snap,
      extra: extra || {},
    };
    this._events.push(ev);
    if (this._events.length > this._maxEvents) {
      this._events.splice(0, this._events.length - this._maxEvents);
    }
    return ev;
  }

  Ping() {
    return JSON.stringify({
      ok: true,
      probeVersion: PROBE_VERSION,
      monoMs: monoMs(),
      wall: wallIso(),
      eventCount: this._events.length,
      trackedWindows: this._tracked.size,
    });
  }

  GetEnv() {
    const wm = global.workspace_manager;
    const nMon = safeCall(() => global.display.get_n_monitors(), 0);
    const mons = [];
    for (let i = 0; i < nMon; i++) {
      const geo = safeCall(() => global.display.get_monitor_geometry(i));
      mons.push(
        geo ? { index: i, x: geo.x, y: geo.y, width: geo.width, height: geo.height } : { index: i }
      );
    }

    const enabledExt = [];
    try {
      const uuids = Main.extensionManager?.getUuids?.() || [];
      for (const u of uuids) {
        const ext = Main.extensionManager.lookup(u);
        if (ext?.state === 1 /* ENABLED */) enabledExt.push(u);
      }
    } catch (_e) {
      /* ignore */
    }

    return JSON.stringify({
      ok: true,
      probeVersion: PROBE_VERSION,
      shellVersion: safeCall(() => {
        try {
          return imports.misc.config.PACKAGE_VERSION;
        } catch (_e) {
          return null;
        }
      }, null),
      isWayland: safeCall(() => Meta.is_wayland_compositor(), null),
      nMonitors: nMon,
      monitors: mons,
      nWorkspaces: safeCall(() => wm.n_workspaces, 0),
      activeWorkspace: safeCall(() => wm.get_active_workspace_index(), -1),
      forgeUuidPresent: !!(
        Main.extensionManager && Main.extensionManager.lookup("forge@jmmaranan.com")
      ),
      enabledExtensions: enabledExt,
    });
  }

  ListWindows() {
    const list = [];
    const actors = global.get_window_actors?.() || [];
    for (const actor of actors) {
      const mw = actor.meta_window;
      if (!mw) continue;
      this._trackWindow(mw);
      const snap = this._snapshot(mw);
      if (snap) list.push(snap);
    }
    return JSON.stringify({ ok: true, windows: list, monoMs: monoMs() });
  }

  ClearEvents() {
    const n = this._events.length;
    this._events = [];
    return JSON.stringify({ ok: true, cleared: n, nextSeq: this._seq + 1, monoMs: monoMs() });
  }

  GetEvents(since_seq) {
    const since = since_seq || 0;
    const events = this._events.filter((e) => e.seq > since);
    const lastSeq = this._events.length ? this._events[this._events.length - 1].seq : since;
    return JSON.stringify({
      ok: true,
      since,
      lastSeq,
      monoMs: monoMs(),
      events,
    });
  }

  BeginMark(label) {
    const ev = this._record("mark", null, { label: String(label || "") });
    return JSON.stringify({ ok: true, mark: ev });
  }

  SnapshotWindow(window_id) {
    const mw = this._findMeta(window_id);
    if (!mw) return JSON.stringify({ ok: false, error: "window not found", windowId: window_id });
    return JSON.stringify({ ok: true, window: this._snapshot(mw), monoMs: monoMs() });
  }

  MoveResize(window_id, x, y, width, height) {
    const mw = this._findMeta(window_id);
    if (!mw) return JSON.stringify({ ok: false, error: "window not found", windowId: window_id });
    const before = this._snapshot(mw);
    this._record("op-move-resize-begin", mw, { x, y, width, height });
    try {
      unmaximizeBestEffort(mw);
      mw.move_frame(true, x, y);
      mw.move_resize_frame(true, x, y, width, height);
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e), before, monoMs: monoMs() });
    }
    const after = this._snapshot(mw);
    this._record("op-move-resize-end", mw, { x, y, width, height });
    return JSON.stringify({
      ok: true,
      before,
      after,
      requested: { x, y, width, height },
      monoMs: monoMs(),
    });
  }

  MoveToMonitor(window_id, monitor) {
    const mw = this._findMeta(window_id);
    if (!mw) return JSON.stringify({ ok: false, error: "window not found", windowId: window_id });
    const before = this._snapshot(mw);
    this._record("op-move-to-monitor-begin", mw, { monitor });
    try {
      mw.move_to_monitor(monitor);
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e), before, monoMs: monoMs() });
    }
    this._record("op-move-to-monitor-end", mw, { monitor });
    return JSON.stringify({
      ok: true,
      before,
      after: this._snapshot(mw),
      requestedMonitor: monitor,
      monoMs: monoMs(),
    });
  }

  MoveToWorkspace(window_id, workspace) {
    const mw = this._findMeta(window_id);
    if (!mw) return JSON.stringify({ ok: false, error: "window not found", windowId: window_id });
    const before = this._snapshot(mw);
    this._record("op-move-to-workspace-begin", mw, { workspace });
    try {
      const ws = global.workspace_manager.get_workspace_by_index(workspace);
      if (!ws) return JSON.stringify({ ok: false, error: "no workspace", workspace });
      mw.change_workspace(ws);
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e), before, monoMs: monoMs() });
    }
    this._record("op-move-to-workspace-end", mw, { workspace });
    return JSON.stringify({
      ok: true,
      before,
      after: this._snapshot(mw),
      requestedWorkspace: workspace,
      monoMs: monoMs(),
    });
  }

  Activate(window_id) {
    const mw = this._findMeta(window_id);
    if (!mw) return JSON.stringify({ ok: false, error: "window not found", windowId: window_id });
    this._record("op-activate-begin", mw, {});
    try {
      const ws = mw.get_workspace();
      const time =
        global.display.get_current_time_roundtrip?.() || global.get_current_time?.() || 0;
      if (ws?.activate_with_focus) ws.activate_with_focus(mw, time);
      else if (mw.activate) mw.activate(time);
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e), monoMs: monoMs() });
    }
    this._record("op-activate-end", mw, {});
    return JSON.stringify({ ok: true, window: this._snapshot(mw), monoMs: monoMs() });
  }

  Raise(window_id) {
    const mw = this._findMeta(window_id);
    if (!mw) return JSON.stringify({ ok: false, error: "window not found", windowId: window_id });
    this._record("op-raise-begin", mw, {});
    try {
      mw.raise();
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e), monoMs: monoMs() });
    }
    this._record("op-raise-end", mw, {});
    return JSON.stringify({ ok: true, window: this._snapshot(mw), monoMs: monoMs() });
  }

  Unmaximize(window_id) {
    const mw = this._findMeta(window_id);
    if (!mw) return JSON.stringify({ ok: false, error: "window not found", windowId: window_id });
    const before = this._snapshot(mw);
    this._record("op-unmaximize-begin", mw, {});
    unmaximizeBestEffort(mw);
    this._record("op-unmaximize-end", mw, {});
    return JSON.stringify({ ok: true, before, after: this._snapshot(mw), monoMs: monoMs() });
  }

  Minimize(window_id) {
    const mw = this._findMeta(window_id);
    if (!mw) return JSON.stringify({ ok: false, error: "window not found", windowId: window_id });
    this._record("op-minimize-begin", mw, {});
    try {
      mw.minimize();
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e), monoMs: monoMs() });
    }
    this._record("op-minimize-end", mw, {});
    return JSON.stringify({ ok: true, window: this._snapshot(mw), monoMs: monoMs() });
  }

  Unminimize(window_id) {
    const mw = this._findMeta(window_id);
    if (!mw) return JSON.stringify({ ok: false, error: "window not found", windowId: window_id });
    this._record("op-unminimize-begin", mw, {});
    try {
      mw.unminimize();
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e), monoMs: monoMs() });
    }
    this._record("op-unminimize-end", mw, {});
    return JSON.stringify({ ok: true, window: this._snapshot(mw), monoMs: monoMs() });
  }

  MakeAbove(window_id, above) {
    const mw = this._findMeta(window_id);
    if (!mw) return JSON.stringify({ ok: false, error: "window not found", windowId: window_id });
    this._record("op-make-above-begin", mw, { above: !!above });
    try {
      if (above) mw.make_above();
      else mw.unmake_above();
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e), monoMs: monoMs() });
    }
    this._record("op-make-above-end", mw, { above: !!above });
    return JSON.stringify({ ok: true, window: this._snapshot(mw), monoMs: monoMs() });
  }

  Fullscreen(window_id, fullscreen) {
    const mw = this._findMeta(window_id);
    if (!mw) return JSON.stringify({ ok: false, error: "window not found", windowId: window_id });
    this._record("op-fullscreen-begin", mw, { fullscreen: !!fullscreen });
    try {
      if (fullscreen) {
        if (mw.make_fullscreen) mw.make_fullscreen();
        else mw.maximize?.(Meta.MaximizeFlags?.BOTH ?? 3);
      } else {
        if (mw.unmake_fullscreen) mw.unmake_fullscreen();
        else unmaximizeBestEffort(mw);
      }
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e), monoMs: monoMs() });
    }
    this._record("op-fullscreen-end", mw, { fullscreen: !!fullscreen });
    return JSON.stringify({ ok: true, window: this._snapshot(mw), monoMs: monoMs() });
  }

  Close(window_id) {
    const mw = this._findMeta(window_id);
    if (!mw) return JSON.stringify({ ok: false, error: "window not found", windowId: window_id });
    this._record("op-close-begin", mw, {});
    try {
      const time =
        global.display.get_current_time_roundtrip?.() || global.get_current_time?.() || 0;
      mw.delete(time);
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e), monoMs: monoMs() });
    }
    this._record("op-close-end", null, { windowId: window_id });
    return JSON.stringify({ ok: true, windowId: window_id, monoMs: monoMs() });
  }

  FocusWorkspace(index) {
    try {
      const wm = global.workspace_manager;
      const ws = wm.get_workspace_by_index(index);
      if (!ws) return JSON.stringify({ ok: false, error: "no workspace", index });
      const time = global.display.get_current_time_roundtrip?.() || 0;
      ws.activate(time);
      this._record("op-focus-workspace", null, { index });
      return JSON.stringify({
        ok: true,
        index,
        active: wm.get_active_workspace_index(),
        monoMs: monoMs(),
      });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e) });
    }
  }
}
