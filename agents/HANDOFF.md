# Handoff — forge (lukebmay)

**Updated:** 2026-08-30 — **S8 landed** (vinyl open-miss + CENTER
nested TABBED). Nest occupied **ilGIo** + dnd green. Host Shell still
on the previous tip until logout. **P0:** H5 TABBED TOP/BOTTOM. **Do
not resave loadouts.** **Plan:**
[forge-live-layout-dnd-proof](./plans/forge-live-layout-dnd-proof.md)
**Architecture:** [architecture-verdict-2026-08-29.md](./plans/forge-live-layout-dnd-proof/architecture-verdict-2026-08-29.md)
**Branch:** **`master`**. **Push:** only if asked.

Cutover C7 + agree-resync R0–R4+R6 are in the tree. Archive those plans
when the operator wants. Proof plan still owns nest TABBED TOP/BOTTOM
(H5) and toggleTabStack.

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
(H5 nest TABBED slotSplit; toggleTabStack). S8 is in the
tree (identity-only skeleton take; CENTER wrap dest, not parent→TABBED).

Product Move **is** Mark 2 Move. Glossary =
[`mark2.md`](../prototypes/container-motion/src/opsets/mark2.md).

**Size** (D090) = **percent** or **`share`**. Action ids **`size.share*`**
(D091). **FLOAT window** = FLOATS bag. Do not say float for leftover size.

## Host eyes-on (2026-08-29)

Human: `forge layout dev` **works** after this tip. **DnD with Nautilus
works.** Right-mon double TAB chrome (EZmFr) is gone on this tip. Do
**not** resave `dev` / `t1` loadouts (v2 `roles` +
`layout.mon*.children` / `layout: tabbed` unchanged).

Earlier host crash (session ScLRi, ~18:39): `float-mismatch` →
`moveWindowToFloats` → `render-throw parentNode is null`; later
`attachTabDecoration` on disposed St.BoxLayout logged out Shell. Those
paths are patched (H1 Forest-wins, deco lifecycle). Hunt `forge log`
only.

## Fixes in this tip (nest + host)

| Area | What |
| --- | --- |
| **D092** | Live Forest sole topology; `lib/host` bag; nanoid |
| **D093** | `lib/agree` present → observe → AGREE or RESYNC |
| **D094** | Same-type coerce unwraps mixed H/H; wrapMonitorMax1 absorb; ensure_layout bag-join; forest-match max-1 peel |
| **H1 observe** | Forest TILES wins; stale `bag.floating` repaired; `metric warn float-promote-denied` |
| **align FLOATS→TILES** | `hostBag.set`; `align-floats-to-tiles` |
| **Decoration** | destroy clears `con.decoration`; attach does not rethrow; `metric warn deco-disposed` |
| **Borders** | `showWindowBorders` null-safe on FLOATS detach |
| **Hunt** | `metric warn settle-jitter` / `settle-soft-fail`; `bag-con-child` invariant scan |
| **Nest** | `smoke-layout-dnd` · `smoke-layout-ws` · `smoke-layout-occupied` + `nest_log_query.py` |
| **S8 skeleton** | Identity-only take; Guake/float-class stays FLOATS (`skeleton skip-float`); unmatched leftover does not fill a role |
| **S8 CENTER** | H/V CON dest CENTER → wrap dest+source (`shouldCreateCon`); insert no longer converts H/V parent to TABBED |

**Nest green:** `smoke-layout-dnd` · `smoke-layout-occupied` (**ilGIo**,
2026-08-30). Expected WARN: `float-promote-denied` on entered-monitor.
Proto brake **154**.

## Nest vs host logout (FIRM)

| Question | Answer |
| --- | --- |
| Does nest need host Wayland logout to pick up JS? | **No.** `./install --dev` then `forge-test nested restart\|run` loads tip into nest Shell. |
| When is host logout needed? | Host Shell never loaded this tip this boot **and** you need host dual-mon / personal `dev` eyes-on. |
| After crash | Re-enable user extensions (`gsettings set org.gnome.shell disable-user-extensions false` + `gnome-extensions enable forge@jmmaranan.com`). Nest shared that dconf key. |

## Host vinyl + nested TABBED (session jwuvx, 2026-08-30)

`forge layout vinyl` on WS2: `ApplyLayout start name=vinyl ws=1`
`orphans=3`. `skeleton take role=inkscape` then
`open PlaceNext dest failed role=inkscape` (ghostty/YouTube PlaceNext
ok). `metric apply ok=false ms=76 phase=open` `reason=open-miss`
roles `inkscape,ghostty,YouTube`. Hunt: `forge log --session jwuvx`.

Cause: `align-floats-to-tiles` pulled Guake (FLOATS) onto empty
`mo0ws1`; leftover FIFO filled that window as inkscape so there was no
PH. **S8:** skip float-class align; take identity only; float-class →
FLOATS (`skeleton skip-float`).

Same session DnD: dock Nautilus then `dnd commit zone=CENTER`
`surface=insert layout=TABBED stackedOrTabbed=false`. Right head became
TABBED(Ghostty, TABBED(YT,Gmail,Voice), Nautilus). Cause: CENTER insert
set the dest H/V CON to TABBED and swallowed the tab bag. **S8:**
CENTER on H/V CON/MONITOR wraps dest+source only.

Do **not** resave `vinyl.json` / `dev`. Host needs **logout** to load
this tip; then eyes-on `forge layout vinyl` on WS2. Agents: nest only.

## Next session

**Plan:** [`plans/forge-live-layout-dnd-proof.md`](./plans/forge-live-layout-dnd-proof.md)

| Slice | Disk |
| --- | --- |
| **H5 nest** | `dnd-drop` TOP/BOTTOM onto a TABBED **slot** must not nest H/V CON inside the bag |
| **toggleTabStack nest** | CENTER drop groups; TABBED bag still soft in WS campaign (Mark 2 toggle may no-op) |
| **S8 host eyes-on** | After logout: `forge layout vinyl` on WS2; CENTER Nautilus onto dest TILE beside a TABBED bag. Not from agents. |
| **Archive (optional)** | cutover + agree-resync when operator wants |

### Do

1. Nest first for JS reload (`./install --dev` + `forge-test nested …`).
2. Hunt `forge log` only (`float-promote-denied`, `deco-disposed`, `settle-jitter`, `render-throw`, `forest-match`, `skeleton skip-float`, `PlaceNext dest`).
3. Use `_forge-test-*` in nest, never personal `dev`.

### Do not

- Twin child-list atomics
- Treat host logout as the ordinary reload loop
- Resave personal loadouts
- Commit or push unless asked

## Architecture verdict (do not rediscover)

D093 stays. No redesign meeting. Failure class was unfinished presenter
observe/chrome (bag vs Forest votes; St deco lifecycle), not kernel FLOAT
terminator. Verdict file above. Host `dev` + Nautilus DnD closed the
live-proof gate for that verdict.

## Brake

`cd prototypes/container-motion && npm test` → **154**.
`./scripts/forge/forge-test nested smoke-layout-ws` · `smoke-layout-dnd`
· `smoke-layout-occupied`.
