# Handoff — forge (lukebmay)

**Updated:** 2026-08-30 — Soft poison + TABBED edge nest committed
(`de517f32`). Tab-click: raise-first then R025 only if still off-slot
(D069); CENTER join force-heals peers. **P0 leftover:** toggleTabStack
nest; host logout for tip; inkscape vs indigo; Chrome peer heal if
tab-click still resizes. **Do not resave loadouts.** **Plan:**
[forge-live-layout-dnd-proof](./plans/forge-live-layout-dnd-proof.md)
**Architecture:** [architecture-verdict-2026-08-29.md](./plans/forge-live-layout-dnd-proof/architecture-verdict-2026-08-29.md)
**Branch:** **`master`**. **Push:** only if asked.

Cutover C7 + agree-resync R0–R4+R6 are in the tree. Archive those plans
when the operator wants. Proof plan still owns nest toggleTabStack.

## Pain

Kernel is generic; adapters **extend** it (D085/D087/D088/**D092**).
Forest document = **META + FLOATS + TILES**. **Live topology = POJO
Forest** (D092). FLOAT windows in FLOATS (no ROOT parking). Host Meta/St
via `Map<id, bag>`. Nanoid per node (envelope singletons may keep
META/FLOATS/ROOT literals). **D093:** present → observe → AGREE or
RESYNC (TOM toward REALITY; FLOAT terminator). No twin presenter
atomics.
Join chord wins over swap. Do not merge the two monitor-resolves. Do not
put Mutter/DOM in the kernel. **Big bang** — no dual-run steady state;
no BC obligation. Apply desired state is TOM.

**Kernel** = `lib/tom/` + `lib/rulesets/` + `lib/opsets/` + keybind
action ids (`lib/keybinds/`). Language-portable contract; JS is the
reference impl.
**World** = `lib/world/` (host adapter **fills**). **Slot math** =
`lib/presenter/` `paneRect`.
**Epochs** = `lib/epochs/` (portable key → nanoid under D092).
**Adapters:** ForgeAdapterGnome (GJS `WindowManager` façade) /
ForgeAdapterWebView (proto desk); KeybindAdapterGnome /
KeybindAdapterWebView.
**Cutover:**
[`plans/forge-live-tom-cutover.md`](./plans/forge-live-tom-cutover.md)
(C7 code). **Agree:**
[`forge-tom-agree-resync.md`](./plans/forge-tom-agree-resync.md).
**Active remainder:**
[`forge-live-layout-dnd-proof.md`](./plans/forge-live-layout-dnd-proof.md)
(H5 nest edge matrix landed; toggleTabStack nest). S8 is in the
tree (identity-only skeleton take; CENTER wrap dest, not parent→TABBED).

Product Move **is** Mark 2 Move. Glossary =
[`mark2.md`](../prototypes/container-motion/src/opsets/mark2.md).

**Size** (D090) = **percent** or **`share`**. Action ids **`size.share*`**
(D091). **FLOAT window** = FLOATS bag. Do not say float for leftover size.

## Host eyes-on (2026-08-30, session `9m9Kw`)

Human: `forge layout dev` **works**; `vinyl` **works** (Inkscape content
smaller than indigo slot outline — soft size leftover). Nautilus DnD
**CENTER** join / create TAB groups **works**. RIGHT horizontal DnD onto
a TAB group (`dnd surface=slotSplit stackedOrTabbed=true`) **felt like
tab thrash** on host; nest synthetic edge matrix is green (see below).

`dev` apply `ok=true ms=10046` with
`settle-soft-fail … soft focus wall timeout after 9000ms`. Cause:
quiet-expiry corrections were recorded as residual latencies (~3002ms at
soft clamp) → softTimeout→clamp → wall=`soft×3`=9000. **Fix:** do not
record quiet-expiry as residual; do not learn when `softSettled=false`.
Host heuristics trimmed (backup
`~/.config/forge/config/settle-heuristics.json.bak-20260830`). After
scrub, focus soft≈1261 wall≈3783 (still ≥2s when open-leaf pin floor
applies). Host needs **logout** to load soft+edge tip.

Do **not** resave `dev` / `t1` / `vinyl` loadouts.

## Fixes in this tip (nest + soft)

| Area | What |
| --- | --- |
| **Soft poison** | `runSoftFocusBarrierOnSignals`: quiet-expiry corrections skip residual push; `recordSoftFocusHeuristics` no-op unless `softSettled` |
| **H5 nest matrix** | `smoke-layout-tabbed-edge`: seed 3 ghosttys → CENTER bag → LEFT/RIGHT/TOP/BOTTOM; bag WINDOW-only; dragged is H/V sibling of bag |
| **H5 units** | RIGHT multi-tab + RIGHT peel keep bag WINDOW peers (`WindowManager-drag-drop-comprehensive`) |
| **S8** (prior) | Identity-only skeleton; CENTER wrap dest beside TABBED |

**Nest green:** `smoke-layout-dnd` · `smoke-layout-occupied` ·
`smoke-layout-tabbed-edge` (LEFT,RIGHT,TOP,BOTTOM). Proto brake **154**.

## Nest vs host logout (FIRM)

| Question | Answer |
| --- | --- |
| Does nest need host Wayland logout to pick up JS? | **No.** `./install --dev` then `forge-test nested restart\|run` loads tip into nest Shell. |
| When is host logout needed? | Host Shell never loaded this tip this boot **and** you need host dual-mon / personal `dev` eyes-on / soft-quiet speed. |
| After crash | Re-enable user extensions (`gsettings set org.gnome.shell disable-user-extensions false` + `gnome-extensions enable forge@jmmaranan.com`). Nest shared that dconf key. |

## Next session

**Plan:** [`plans/forge-live-layout-dnd-proof.md`](./plans/forge-live-layout-dnd-proof.md)

| Slice | Disk |
| --- | --- |
| **toggleTabStack nest** | CENTER drop groups; TABBED bag still soft in WS campaign (Mark 2 toggle may no-op) |
| **Host RIGHT thrash eyes-on** | After logout: rebuild TAB group, RIGHT-drop Nautilus; if still weird, hunt deco/geometry (nest structure path is green) |
| **Vinyl inkscape slot** | Content smaller than indigo outline — size/slot leftover, not H5 |
| **Archive (optional)** | cutover + agree-resync when operator wants |

### Do

1. Nest first for JS reload (`./install --dev` + `forge-test nested …`).
2. Hunt `forge log` only (`float-promote-denied`, `deco-disposed`, `settle-jitter`, `render-throw`, `forest-match`, `skeleton skip-float`, `PlaceNext dest`, `settle-soft-fail`, `soft quiet`).
3. Use `_forge-test-*` in nest, never personal `dev`.

### Do not

- Twin child-list atomics
- Treat host logout as the ordinary reload loop
- Resave personal loadouts
- Commit or push unless asked
- Re-learn soft residuals from wall timeouts

## Architecture verdict (do not rediscover)

D093 stays. No redesign meeting. Failure class was unfinished presenter
observe/chrome (bag vs Forest votes; St deco lifecycle), not kernel FLOAT
terminator. Verdict file above. Host `dev` + Nautilus DnD closed the
live-proof gate for that verdict.

## Brake

`cd prototypes/container-motion && npm test` → **154**.
`./scripts/forge/forge-test nested smoke-layout-ws` · `smoke-layout-dnd`
· `smoke-layout-occupied` · `smoke-layout-tabbed-edge`.
