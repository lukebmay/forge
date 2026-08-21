# Vendored pansi / plog (from shellrc)

Pinned snapshot of shellrc `util/js/{ansi_color,p,plog}.js`.

See `VERSION` for exact versions and `shellrc_rev`.

**Do not edit these files in forge.** Re-snap from shellrc after bumping
versions there (commit + push shellrc, then copy again).

| Consumer | How |
| --- | --- |
| Node CLI (`cli/*.mjs`) | Import from here (`plog.js` needs Node) |
| GNOME Shell / GJS | Use `lib/shared/plog-adapter.js` — **never** import Node plog into GJS |
