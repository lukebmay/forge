# Manual check inventory — host vs nest

**Plan weight:** [forge-proof-regression-loop.md](../forge-proof-regression-loop.md)
(sibling spine — create if missing; not present at this write).
**Updated:** 2026-09-03
**Sources:** [HANDOFF.md](../../HANDOFF.md) § Human host load,
[PRIORITY.md](../../PRIORITY.md), [testing.md](../../testing.md) nest
`smoke-*`, [forge-tab-share-close-reflow.md](../forge-tab-share-close-reflow.md),
[forge-mark2-user-ops-surface.md](../forge-mark2-user-ops-surface.md) U4,
`scripts/forge/live_matrix.py` `LIVE_CASES`, nest campaigns under
`scripts/forge/nest_*.py`.

**Scope:** what the human still **eyes-on** after `./install --dev` +
Wayland re-login vs what nest/unit already proves. Nest dummy mons are
1920×1080 @ scale 1; host dual-4K / chrome open-leaf RC stays host
authority ([testing.md](../../testing.md) D022).

**Existing nest smoke ids** (`./scripts/forge/forge-test nested smoke-*`):

| Id | What it already asserts |
| --- | --- |
| `smoke-mark2` | Two TILES → `join.right` → GetTree fingerprint changed |
| `smoke-toggle-tab` | H/V pair → TABBED ↔ STACKED; bag kids WINDOW-only |
| `smoke-layout-dnd` | Dual-mon `_forge-test-ghosttys` + occupied dest-mon drop |
| `smoke-layout-ws` | 8-step WS A→B→back → open → move → CENTER tab → **close ids gone** → re-layout A; CTS tree + settle tokens |
| `smoke-layout-occupied` | WS2 occupied 2-slot apply; no open-miss / PlaceNext mon-root |
| `smoke-layout-tabbed-edge` | TABBED × LEFT/RIGHT/TOP/BOTTOM; bag WINDOW-only; dragged is H/V sibling |
| `smoke-geom-epsilon` | sent↔observed Meta ε samples (nest tapes) |
| `smoke-nest-apps` | Nautilus / Ghostty / TextEditor / Chrome map **in-nest** |
| `smoke-close-reflow` | 3 TILE → close → pair `percent≈0.5` + Meta width ~1/2 (fail stuck ~1/3); tab slot ~1/2; no `forge-ph` |

`smoke-layout-ws` step 7 still only checks closed window ids absent +
forest oracles (no nested bag CON child). Share 3→2 is
`smoke-close-reflow`.

---

## 1. Inventory table

| Manual check | How human does it today | Existing nest / unit coverage | Gap | Proposed automation |
| --- | --- | --- | --- | --- |
| Close one of **three** TILES; siblings fill (~1/2 each), no stuck 1/3 | After tip + logout: three tiles on a MONITOR HSPLIT; close one; **eyes** Meta frames. Hunt `forgetHost` / `window-destroy` | **Unit:** `tests/unit/tom/sizing-repair.test.js` MONITOR 3→2 percents → 0.5; `forget-host-window.test.js` Forest remove + unary settle + `commitLayout(force)`. **Presenter:** `pane-rect.test.js` 0.33+0.33 → 960/960. **Nest:** `smoke-layout-ws` **closes** extra (+optional other) and asserts **id gone**, not share. **Live:** `L1.close-focus-lft` (close chrome → LFT focus; **no** share). **R0xx:** none tagged for 3→2 reflow | Forest math + forget identity covered; **live Meta / GetTree.rect after 3→2** not. Human repeats this every tip load | **`smoke-close-reflow`** (new): seed 3 ghostty TILES on **one** MONITOR HSPLIT (nest 1920×1080); `close_window_id` one; CTS: closed id gone; remaining two `percent≈0.5`; GetTree `rect.width` each ≈ 960 ± nest ε (not ~640); hunt `forgetHost` / `repairShares`. Optional: Shell.Eval `get_frame_rect` if tree `rect` is GObject-stale |
| Tab-click a group that should be ~1/2; Meta ≈ 1/2 not ~1/3 | Same desk: leftover 0.33 percents; click tab in the ~1/2 group; **eyes** Meta. Same as close-reflow host row | **Unit:** `action-pipeline.test.js` R025 raise-then-reassert; R026 pin-adopt. `tom-live.test.js` `forestSlotPaintRect`. Seeded `collectChromeKids` Forest-only. **Live notes:** `L1.r026-tab-click-adopts-pin`, `L1.r032-tab-click-responsive` are **note-only** (human clicks strip). **R025** (tab at FLOAT/old size) and **R043** (Grok body click → ~⅓) have **no** `LIVE_CASES` row | Nest cannot click St tab chips. Reveal via dbus-focus exists in units, not nest. Width after reveal unasserted | Same **`smoke-close-reflow`** step 2: CENTER-join two half-width TILES → TAB; `nested invoke` dbus-focus / `revealGroupChild` on sibling (`source=tab-click`); CTS Meta/GetTree width still ~1/2. Full **St click** stays later (`smoke-tab-click` + AT-SPI or Shell.Eval chip actor) |
| `forge tree` no ghost WINDOW after close | `forge tree` after close; hunt `forgetHost` | **Nest:** `smoke-layout-ws` 7-close `still present after delete`. **Unit:** `forget-host-window` idempotent + Forest id gone. **R049** shipped Forest-aware destroy; live matrix does not re-run close-ghost | Identity covered in nest WS campaign; not wired as a dedicated close-reflow CTS + log token | Fold into `smoke-close-reflow` CTS: closed id ∉ GetTree; no `forge-ph`; hunt `forgetHostWindow` |
| Borders: only focused; tab groups **green**; hide hostBag orphans | Eyes-on after tip. PRIORITY: soft if desk already looks right | **Unit:** `WindowManager-borders.test.js` (hostBag hide D096, tabbed green class, single-window skip). **R031** float-border L0 + `L1.r031-float-border-follows` note. **R050** tab chrome restack; nest `smoke-toggle-tab` | Nest GetTree has no St class / border actor. Host CSS color is eyes-on | Later: Shell.Eval `border` style class on focused vs peers. **Do not** tonight — low ROI vs share |
| Unary TAB/STACK no strip (R053) | Eyes: one-child group has no tab chrome | **L0:** `bug-unary-tab-chrome`. Nest: none dedicated | Nest does not count strip actors | Cheap add-on: after close leaves unary TAB, CTS `chrome-unary` hunt token (already in L0) |
| Open leaf after `layout` matches profile `active` (R054) | `layout dev`; visible tab is Grok not Chrome | **L0:** `bug-r054-r055-open-leaf`. **Live:** `L1.ghosttys-only` / `L1.left-chrome` / `L1.right-ghostty` / `L1.settled-rerun` / `L2.true-cold-dev` tagged **R054**. Host dual-4K still authority | Nest dummy ≠ host chrome PWA identity | Keep host live `--from-work open-leaf`; nest layout ghosttys only |
| Tab strip clicks switch open leaf (R032); first sibling click stays (R026) | After `layout`, click **strip** (not body) | **L0:** `bug-tab-click-activate`, action-pipeline R026/R032. **Live:** `L1.r026-*` / `L1.r032-*` **note-only**. Nest `smoke-toggle-tab` does **not** click chips | St click synthesis missing | `smoke-tab-click` later (chip actor hit). Not tonight |
| DnD CENTER into existing TAB raises joiner + kbd focus (R055) | Super-drag TILE onto TAB CENTER | **L0:** `bug-r054-r055-open-leaf`. **Nest:** `smoke-layout-tabbed-edge` + `smoke-toggle-tab` (structure). **Live:** `L1.r055-dnd-center-join-raise` **note-only**. Hunt `revealGroupChild source=dnd-join` | Nest proves bag structure, **not** raise/focus | Extend tabbed-edge CTS: focused id == joiner after CENTER. Cheap follow-up, not the close-share pain |
| Group / pointer first-try CENTER (U4 optional) | Nautilus below Ghostty CENTER groups first try | **U2/U3** L0 + proto. Nest `dnd-drop --zone center` harness. Host checkbox still open on mark2 plan | Host flake if any; nest already has CENTER drop in `smoke-layout-ws` step 6 | Skip unless cheap; U4 is optional |
| Dual-mon layout / open-leaf / chrome map | `forge layout` `_forge-test-*` or personal `dev` after logout | **Live catalog** (scripted setup+checks): `L1.ghosttys-only` R005/R007/R008/R011/R013/R014/R054; `L1.left-chrome`; `L1.right-ghostty`; `L1.ghosttys-multi` R010; `L2.true-cold-dev`; `L1.settled-rerun`. **Nest:** `smoke-layout-ws` / `smoke-layout-occupied` / `smoke-layout-dnd` | Host 4K + real Chrome/PWA still human/live-matrix; nest proves JS tip structure | Do not replace with nest; keep `forge-test live run --from-work open-leaf` |
| Cross-mon / empty-mon / nested-leaf DnD | Super-drag on host dual | **Live (harnessed):** `L1.r012-cross-mon-tab-dnd`, `L1.r015-empty-mon-dnd`, `L1.r022-nested-empty-mon-dnd`, `L1.r023-bottom-nest-hsplit`. **Nest:** `smoke-layout-dnd` occupied dest; `nested dnd-drop` | Host maze / Ctrl+hjkl reconnect **parked**. Nest dummy geometry ≠ 4K | Parked; not tonight |
| Empty-head dock open (R021); first layout TILE (R024); reuse no-double (R029/R030) | Dock on empty right; layout twice | **Live notes:** `L1.r021-*`, `L1.r024-*`, `L1.r029-*` (R021/R024/R029 **note-only** or weak checks). L0 exists | Host RC | Keep live notes; nest occupied already covers PlaceNext miss |
| Workareas no-op / scale retile (R016/R017) | `gdisplays load` | **Live notes only** (`L1.r016-*`, `L1.r017-*`). L0 `workareas-policy` | No ApplyMonitorsConfig inject | Low automatability in nest tonight |
| Tiled VLC EOS stays in slot (R020) | Play fixture to EOS | Nest mon=1 historical PASS; vout weak. Live **note-only** | Host eyes optional | Skip |
| Float app (Kooha) no blank TILE; border follows (R031) | Open Kooha on tiled desk | L0 `bug-r031-float-border-ghost-tile`; live note | Nest can launch if app installed | Low frequency vs close-share |
| Apply overlay until ready (R027) | Watch overlay during `forge layout` | L0 chrome-show; live **note-only** | Overlay is host chrome | Skip nest |
| Client isolation (apps map in nest) | Human used to see host spill | **`smoke-nest-apps`** | Done | — |
| Geom sent↔observed ε (D095) | Human used to “frame ≠ border” | **`smoke-geom-epsilon`** | Measurement, not close-share contract | Reuse ε helper inside `smoke-close-reflow` |
| Mark 2 join/move/group keyboard | Super+keys on host | **`smoke-mark2`** + `nested invoke` | Host chords vs dbus invoke | Nest invoke is enough for JS tip |

---

## 2. Gap rank (pain frequency × nest automatability)

Score 1–5 each; product is the rank key. “Pain” = how often the human
is asked to re-login + stare after a JS tip (PRIORITY / HANDOFF now).

| Rank | Gap | Pain | Auto | Product | Why |
| --- | --- | --- | --- | --- | --- |
| **1** | Close 3→2 Meta/Forest share stuck ~1/3 | 5 | 5 | **25** | Open host-verify row every tip. Nest already launches TILES, `close_window_id`, GetTree `rect`/`percent`. Units prove math; **e2e share missing** |
| **2** | Tab-select then Meta width ~1/2 (not 1/3) | 5 | 4 | **20** | Same campaign as (1). Reveal via invoke is nest-ready; St chip click is not required to kill the 1/3 class |
| **3** | Ghost WINDOW / leftover chrome after close | 4 | 5 | **20** | Same close path; `smoke-layout-ws` already has identity CTS — fold into dedicated close-reflow so the share smoke cannot pass with a ghost |
| 4 | R055 joiner raise+focus after CENTER | 3 | 4 | 12 | Structure already nest-green; add focused-id CTS on tabbed-edge |
| 5 | R032/R026 strip click (St) | 4 | 2 | 8 | High host pain historically; needs chip hit-test. Live still note-only |
| 6 | Host dual-4K chrome open-leaf / R054 | 4 | 2 | 8 | Nest dummy mons; keep live matrix |
| 7 | Focus borders / tab green | 2 | 2 | 4 | Soft PRIORITY; L0 strong; St class query later |
| 8 | R016/R017 gdisplays | 2 | 1 | 2 | No inject path |
| 9 | U4 first-try CENTER host | 2 | 4 | 8 | Optional; nest CENTER already in WS campaign |
| 10 | R020 VLC / R031 Kooha | 1 | 2 | 2 | Rare |

Ties at 20: (2) and (3) ride **the same new smoke** as (1). That is why
tonight is one campaign, not three.

---

## 3. Tonight — single best nest smoke

**Add `smoke-close-reflow`**
(`./scripts/forge/forge-test nested smoke-close-reflow`).

This is the check PRIORITY still parks on the human after every
close-reflow / adapter tip. It removes the **repeated** “close one of
three; is it 1/2?” plus the sibling tab-width stare, without waiting on
St click or dual-4K.

**Campaign (mon=1 is enough):**

1. Seed **3** ghostty TILES on MONITOR HSPLIT (equal ~1/3).
1. CTS0: three kids; `percent` sum 1; each `rect.width` ~640 on 1920.
1. `close_window_id` one TILE.
1. **CTS close:** closed id gone; remaining two `percent≈0.5`; each
   `rect.width` ≈ 960 ± geom-ε (fail if ~640); hunt
   `forgetHost` / `window-destroy` / `repairShares`; no `forge-ph`.
1. CENTER-join the two survivors → TABBED (reuse `dnd-drop` / invoke).
1. **CTS tab:** dbus-focus / reveal sibling (`source=tab-click` or
   `dbus-focus`); group Meta/GetTree width still ~1/2 (not 1/3).
1. Always-stop like other `smoke-*`.

**Do not** retarget `smoke-layout-ws` (8-step dual-mon; close is
identity-only). Keep that campaign; add a **narrow** share contract.

**L0 already green** for the math (`sizing-repair`, `pane-rect`,
`forget-host-window`). Nest is the missing **user-visible** invert:
Meta/GetTree width after the user close/reveal sequence
([testing.md](../../testing.md) real-regression rule).

After nest PASS, host logout is **occasional tip load**, not the
ordinary 1/3 proof.

---

## 4. `LIVE_CASES` R0xx ↔ these manual checks

Catalog: `scripts/forge/live_matrix.py` `LIVE_CASES`. Many R0xx are
**note-only** actions (human still clicks / drags / gdisplays).

| Live case | R0xx tags | Maps to which manual check |
| --- | --- | --- |
| `L1.ghosttys-only` | R005 R007 R008 R011 R013 R014 **R054** | Dual layout + chrome open-leaf (host) |
| `L1.left-chrome` | R005 R007 R054 | Same, left chrome kept |
| `L1.right-ghostty` | R001 R005 R011 R013 R014 R054 | Same, mon0 chrome closed |
| `L1.t1-nautilus` | (none) | Nautilus layout shape |
| `L2.true-cold-dev` | R005 R007 R008 R054 | True-cold open-leaf |
| `L2.layout-clean` | R009 | Empty profile |
| `L1.settled-rerun` | R007 R054 | Settled re-apply |
| `L1.close-focus-lft` | **(none)** | Close → LFT **focus**, **not** 3→2 share |
| `L1.ghosttys-multi` | R010 | Multi-instance mon claim |
| `L1.r012-cross-mon-tab-dnd` | R012 | Cross-mon CENTER tab-join (harnessed) |
| `L1.r015-empty-mon-dnd` | R015 | Empty mon1 drop (harnessed) |
| `L1.r021-empty-head-open` | R021 | Dock/open empty head (**note**) |
| `L1.r022-nested-empty-mon-dnd` | R022 | Nested leaf to empty mon (harnessed) |
| `L1.r023-bottom-nest-hsplit` | R023 | BOTTOM nest vs 3-wide (harnessed) |
| `L1.r024-first-layout-tiles` | R024 | First apply TILE (**note**) |
| `L1.r029-reuse-no-double` | R029 R030 | Second apply no extra chrome (**note**) |
| `L1.r016-noop-workareas` | R016 | gdisplays no-op (**note**) |
| `L1.r017-gdisplays-scale-retile` | R017 | Scale retile (**note**) |
| `L1.r026-tab-click-adopts-pin` | R026 | Tab click stays (**note** — strip click) |
| `L1.r027-chrome-until-ready` | R027 | Apply overlay (**note**) |
| `L1.r032-tab-click-responsive` | R032 | Strip clicks switch leaf (**note**) |
| `L1.r020-vlc-end-of-video` | R020 | VLC EOS slot (**note**) |
| `L1.r031-float-border-follows` | R031 | Float border / no ghost TILE (**note**) |
| `L1.r055-dnd-center-join-raise` | R055 | CENTER join raise+focus (**note**; nest structure only) |

**Not in `LIVE_CASES` but on the current human close/tab list:**

| Regression / plan | Why it matters | Live gap |
| --- | --- | --- |
| Close 3→2 stuck 1/3 (tab-share plan; no R0xx yet) | Tonight’s host verify | **No live case, no nest share CTS** |
| R025 tab at old/FLOAT size | Ancestor of tab-width | L0 only |
| R043 body-click ~⅓ + Chrome behind | Same ⅓ class | L0 + host logout note; no live tag |
| R049 close GetTree ghosts | Ghost WINDOW | Nest WS close identity; no live close-ghost case |
| R046 MONITOR-direct half slots | Layout 1/2 vs full-bleed | L0 `pane-rect`; host layout |
| R050 tab chrome off | Strips | Nest `smoke-toggle-tab`; host `groups=2` |
| R053 unary no strip | Chrome after close | L0 only |

`--from-work close` selects **`close-focus`** (LFT), **not** share
reflow. A new live tag (e.g. R056) should land with `smoke-close-reflow`
if the 1/3 class is filed as a regression row.

---

## Handoff (inventory author)

**Wrote:** this file. **Did not commit.** Sibling spine
`agents/plans/forge-proof-regression-loop.md` was **absent** at write
time — cross-link reserved; if it exists now, it should point here as
the manual-vs-nest map.

**Top 3 gaps:** (1) close 3→2 Meta share ~1/2, (2) tab-select width
~1/2, (3) ghost WINDOW after close — all one nest smoke.

**Tonight:** implement `smoke-close-reflow` (not a host logout, not
`smoke-layout-ws` rewrite, not border St query).

**Do not:** dual-write Forest←GObject; grow `live-handle.js`; invent
`Mark2Drop*`; host `layout` from the agent; force-push.

---

## Landed (2026-09-03) — `smoke-close-reflow`

Wired as `./scripts/forge/forge-test nested smoke-close-reflow`
(always-stop, default mon=1). Stage 2 CENTER-joins the two survivors
(dnd, else `toggleTabStack`) → TABBED. Revealed Meta must not be ~1/3
(pair slot is ≥ ~1/2; full-width after joining two halves is ok).

```bash
./install --dev
./scripts/forge/forge-test nested doctor
./scripts/forge/forge-test nested smoke-close-reflow
./scripts/forge/forge-test nested status   # running: False
```

L0: `tests/unit/cli/test_nest_close_reflow.py`,
`tests/unit/cli/test_nest_proof.py` (share/percent/placeholder).
**Nest PASS** 2026-09-03: `close-reflow ok … axis=hsplit tab=True`;
nest stopped.
