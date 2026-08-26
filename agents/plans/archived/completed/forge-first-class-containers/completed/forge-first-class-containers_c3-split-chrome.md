# forge-first-class-containers_c3-split-chrome — Split chrome (I5)

**Status:** done  
**Plan:** [forge-first-class-containers](../../forge-first-class-containers.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-17  
**Agent:** Grok 4.5 implementer (orchestrator-assigned)

## Goal

Make H/V structure readable via **split chrome** (invariant **I5**). Extend the
existing focus/split border vocabulary — do **not** invent a second chrome
system. Modes: focus-ancestry (default), show-all, force show-all while
dragging.

## Acceptance

- [x] **Default:** chrome on focused unit’s **parent chain** (ancestry of
      H/V splits + existing focus/split borders refined). Tab/stack unit =
      bag CON (same unit idea as R1 `layoutUnit`).
- [x] **Show-all:** setting and/or toggle draws H/V indicators on every
      split CON (not only focus ancestry).
- [x] **While dragging:** force show-all for drag duration; restore prior
      mode on grab end / cancel.
- [x] Visual language stays `.window-tiled-border` / `.window-split-border`
      (+ vertical/horizontal classes). Extend (which edge = parent split
      axis) — no parallel actor system.
- [x] Named helpers (`resolveSplitChromeMode` / `collectSplitAncestry` /
      `splitChromeForWindow`); contracts row.
- [x] Unit tests for pure helpers + decoration paint + command toggle.
      Nest visual skipped (contract unit-proven; chrome eyes-on needs human).
- [x] Did **not** open C4, R2/R3, tab-strip redesign, or spanning chrome.
- [x] Overwrite session note + FCC plan + PRIORITY/HANDOFF; moved to
      `agents/plans/forge-first-class-containers/completed/`.

## Context for the next agent (complete + succinct)

### Locked

- D039–D044; C1 I1; C2 I2; R1 I3; **C3 I5 done**.
- Split chrome modes locked in FCC plan §3.
- D045 nest = `./scripts/forge/forge-test nested` only.
- Do not close durable-agent ghostty windows.
- Do not commit/push unless operator asks.
- C2+R1+C3 uncommitted on tip.

### API / settings

| Surface | Path | Behavior |
| --- | --- | --- |
| `resolveSplitChromeMode` | `lib/extension/split-chrome.js` | ancestry vs all (setting \|\| force) |
| `collectSplitAncestry` | same | H/V parents of layout unit (incl. MONITOR) |
| `splitChromeForWindow` | same | lowest qualifying H/V → axis for a WINDOW leaf |
| `DecorationsManager.setSplitChromeForceShowAll` | `decoration.js` | grab force; restores on end |
| Setting | `split-chrome-show-all` (default false) | prefs Appearance switch |
| Toggle | `SplitChromeShowAllToggle` / kbd `split-chrome-show-all-toggle` (unbound) | flips setting |
| Paint | existing `windowActor.splitBorder` + CSS classes | all tiled leaves under qualifying CONs |

**Ancestry paint rule:** leaf paints when a walk finds an H/V ancestor in the
focus unit’s ancestry set (lowest match). Cousins under a non-ancestry V can
still show the shared outer H. Show-all = nearest H/V parent for every leaf.

### Proven

- Pure I5: 8 tests (mode, ancestry, cousins, tab bag, show-all).
- DecorationManager: ancestry paints both HSPLIT siblings; force flag idempotent.
- Touched L0 **219** green (split-chrome + DecorationManager + borders +
  commands + keybinds + keybind-presets + config-sync + settings-control).
- Nest `running: False`; nest visual **not** run (unit covers contract).

### Enable / test

```bash
# Show-all path (optional; default is focus-ancestry)
forge set split-chrome-show-all true
# or unbound keybind once assigned in prefs

npm test -- tests/unit/extension/split-chrome-i5.test.js \
  tests/unit/extension/DecorationManager.test.js \
  tests/unit/window/WindowManager-borders.test.js \
  tests/unit/window/WindowManager-commands.test.js \
  tests/unit/shared/keybind-presets.test.js \
  tests/unit/keybindings/Keybindings.test.js
```

### Risks

- Host tip lags until reload/logout for new gschema + JS.
- Keyboard resize also forces show-all for grab duration (same grab begin/end).
- Tab-strip chrome untouched (group chrome A).

## Session note

**2026-08-17 C3 shipped on master (uncommitted; operator did not ask).**
I5 split chrome: focus-ancestry default, `split-chrome-show-all` + toggle,
grab force show-all with restore in grab-end `finally`. Pure helpers in
`split-chrome.js`; paint still `.window-split-border`. Nest skipped (unit).
Next: FCC **C4**.
