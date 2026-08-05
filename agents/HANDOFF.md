# Handoff — forge (lukebmay)

**Updated:** 2026-08-04 (post Wayland W1–W5; operator logout/in next)  
**Branch:** `plan/forge-wayland-live` (pushed to `origin`)  
**Default:** `master` — **not** merged yet (wait for live smoke after logout)  
**Remotes:** `test` / `prod` **not** touched  
**Queue:** [PRIORITY.md](./PRIORITY.md) — thrash → selection S3 → desktop keybinds  

**Plan:** [forge-wayland-live.md](./plans/forge-wayland-live.md)

---

## Where we are

| Layer | Status |
| --- | --- |
| Wayland **W1–W5** | **Shipped on branch** (unit + partial live). Extension on disk `v49-90-beta.2-171-g975ed17` (or newer). **Running shell may still be old** until logout/in. |
| Layout `dev` topology | Cold retest OK after W5: mon0 tabs(Chrome,Grok)\|ghostty; mon1 ghostty\|tabs(YouTube,Gmail,Voice) |
| Tab icons (Grok/Gmail wrong) | **Fix in tree.js** — needs logout so ES modules reload |
| Soft-rehome thrash | X11 OK earlier; **Wayland thrash smoke not done** (W4) |
| Selection S1–S2 | Done (prior); S3 after Wayland smoke |
| Desktop keybinds | KB0 done; KB1+ after S3 |
| Wayland shell reload | **No X11-style HUP** — logout/in only (park DX later) |

### Commits on `plan/forge-wayland-live` (this wave)

| Commit | What |
| --- | --- |
| `4f63ace` | **W1** computeSizes renormalize, late-tile share, `notify::title`, non-reactive borders |
| `655a0c9` + `9e6bd15` | **W2** PlaceNext sticky mon, Chrome wait sugar, deferred path attach |
| `9a13761` | **W3** focus-monitor for dock sticky + Guake |
| `975ed17` | **W5** same-PWA crx↔chrome-Default, PlaceNext desktop class, full residual belt, open-continue, PWA tab icons |

---

## Next agent — after operator logout/in (Wayland)

Operator will **log out and back into GNOME Wayland** so extension code reloads. Then:

### 0. Branch + install match

```sh
cd ~/dev/me/forge
git checkout plan/forge-wayland-live
git pull --ff-only origin plan/forge-wayland-live
./install   # debug; files already installed — confirm version
forge ping  # versionName should match git describe, not stale c0b6e67-era
```

Logging:

```sh
SCHEMA_DIR=~/.local/share/gnome-shell/extensions/forge@jmmaranan.com/schemas
gsettings --schemadir "$SCHEMA_DIR" set org.gnome.shell.extensions.forge logging-enabled true
gsettings --schemadir "$SCHEMA_DIR" set org.gnome.shell.extensions.forge log-level 5
```

### 1. Layout smoke (`forge layout dev`)

Desired shape (`hosts/black/dev.json`):

- **mon0:** TABBED(Chrome, Grok active) \| ghostty  
- **mon1:** ghostty \| TABBED(YouTube active, Gmail, Google Voice)  
- **Keyboard focus:** mon0 ghostty (`focus: ["ghostty", 0]`)

```sh
# Prefer cold-ish: only Ghostty on both heads, then:
forge layout dev
forge tree
forge layout dev --dry-run   # ideally only focus residuals or nothingToDo
```

Check:

- [ ] One shot (not “second pass heals YouTube”)  
- [ ] Tab **order** mon1: YouTube → Gmail → Voice  
- [ ] **Active** tabs: Grok mon0, YouTube mon1  
- [ ] **Icons:** Grok ≠ Chrome globe; Gmail ≠ YouTube  
- [ ] No zero/negative tile widths  

Do **not** close the Ghostty the agent runs in; other windows OK to close for cold layout.

### 2. W4 — Wayland thrash smoke

1. `forge layout dev` (stable dual-head tabs)  
2. Lock **Super+Delete** (GNOME media-keys; no Forge DPMS)  
3. Wait for blank if any; unlock  
4. Compare `forge tree` topology  
5. Journal: thrash guard → unlock → soft-rehome  

Artifacts under `/tmp/forge-wayland-thrash-…` if useful.

### 3. Selection smoke (after thrash OK)

```sh
forge run-steps '[{"op":"focus","selector":"title~=Grok"},{"op":"focus-parent","selector":"focus"},{"op":"layout-cycle","axis":"group","selector":"focus"}]'
forge tree
```

Then product: **S3** kit bindings → desktop keybinds KB1+.

### 4. Merge gate

Merge `plan/forge-wayland-live` → `master` only when:

- Layout + icons smoke OK on Wayland after logout  
- Thrash not obviously broken (or explicitly deferred with note)  
- Tests green; no doubt  

Never touch `test` / `prod`.

---

## Known constraints

| Topic | Detail |
| --- | --- |
| **No Wayland HUP** | Cannot reload extension modules like X11. Logout/in required. Disable/enable is **not** enough. Park “better Wayland reload DX” later. |
| **Focus residual** | Dry-run may still list 3 focus ops (Grok active, YouTube active, profile ghostty) even when topology is perfect — product intent, not a thrash. |
| **Don’t close agent Ghostty** | Dual-head ghostty is load-bearing for layout roles. |

---

## Key code map (this wave)

| Concern | Path |
| --- | --- |
| Fair sizes / late title | `lib/extension/tree-layout.js`, `window.js` |
| PlaceNext / PWA class | `lib/extension/place-hint.js`, `scripts/forge/forge` `_class_eq` |
| Layout residual belt | `scripts/forge/forge` (after opens) |
| PWA tab icons | `lib/extension/tree.js` `_preferChromePwaApp`, `refreshApp` |
| Dock/Guake mon | `window.js` `resolveFocusMonitor` |
| Soft rehome | `lib/extension/soft-rehome.js` |

---

## Human blockers

None hard. Operator: **logout/in Wayland**, then continue from §1 above.

---

## Plans

| Plan | Next |
| --- | --- |
| [forge-wayland-live](./plans/forge-wayland-live.md) | **W4 thrash** after logout smoke |
| [forge-container-selection](./plans/forge-container-selection.md) | S3 after Wayland OK |
| [forge-desktop-keybinds](./plans/forge-desktop-keybinds.md) | KB1 after S3 |
