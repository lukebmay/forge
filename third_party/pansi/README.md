# Vendored pansi / plog (from shellrc)

Pinned snapshot of shellrc `util/js` pansi + plog (D064 action pipelines).

See `VERSION` for exact versions and `shellrc_rev`.

**Do not edit these files in forge.** Re-snap from shellrc after bumping
versions there (commit + push shellrc, then copy again).

| Consumer | How |
| --- | --- |
| Node CLI (`cli/*.mjs`) | Import `plog.js` (Node `fs`) |
| GNOME Shell / GJS | Import `plog.gjs.js` (Gio `toFile`) via `lib/shared/plog-adapter.js` — **never** import Node `plog.js` into GJS |

| File | Role |
| --- | --- |
| `ansi_color.js` | Color enablement |
| `p.js` | `p` / `pstr` printer |
| `plog-core.js` | Runtime-agnostic logger factory |
| `plog-runtime-node.js` | Node/Bun I/O |
| `plog-runtime-gjs.js` | GJS Gio/GLib I/O |
| `plog.js` | Node entry |
| `plog.gjs.js` | GJS entry |
