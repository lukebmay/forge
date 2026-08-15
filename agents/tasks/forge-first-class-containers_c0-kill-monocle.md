# forge-first-class-containers_c0-kill-monocle — C0 inventory + delete monocle

**Status:** later — after **TD1** (worth / do not forget)  
**Plan:** [forge-first-class-containers](../plans/forge-first-class-containers.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-14  
**Agent:** `grok-4.5` as 4.5 **medium**.

## Goal

Monocle is a structure-destroying flatten. Delete it (REG-monocle,
REG-i3-super-m). Inventory other **lossy** layout transitions so C1
`setLayout` has a call-site list. Do not implement `setLayout` here.

## Acceptance

- [ ] `toggleWorkspaceMonocle` / `workspace-monocle-toggle` gone
      (command, keybind, docs)
- [ ] i3 kit `<Super>m` **unbound** (REG-i3-super-m); Safe/Vim
      already unbound
- [ ] REG table in the FCC plan updated (Drop when = C0 done)
- [ ] Monocle-only tests deleted or rewritten (no empty stubs)
- [ ] Written inventory in this task session note: every call site
      that changes CON `layout` and whether it reparents/flattens
      (needed by C1)
- [ ] No new `setLayout` yet
- [ ] Kits + user keybindings docs mention Super+m is free for
      zoom later (Wave Z)

## Context for the next agent (complete + succinct)

### Product

I1 is coming in C1: `setLayout(con, L)` must not reparent. C0
removes the worst flatten (workspace tab-all) and lists the rest.

### Likely files

- `lib/extension/command.js`, `keybindings.js`
- `lib/shared/keybind-presets.js` (i3 Super+m)
- `lib/extension/session-api.js` `_layoutCycleOp`
- docs/user/keybindings.md, cheatsheet
- tests that mention monocle / `workspace-monocle`

### Test

```bash
npm test -- tests/unit/keybindings/Keybindings.test.js \
  tests/unit/shared/keybind-presets.test.js
# plus any command/layout-cycle tests you touch
```

### Do not

- Start C1/C2 group/ungroup
- Rebind Super+m to zoom here (Z0 owns that)
- Touch tab-strip TD1 files unless a monocle-only import forces it

## Session note

**2026-08-14:** Queued as worth work after TD1. No code.
