# Meta probe — calibration & knobs

**Agreement semantics:** [AGREEMENT.md](./AGREEMENT.md) — **soft** disagreements (`s_title`, `s_focus`, `s_raise`) are recorded on the check timeline but **do not** reset settle duration. Only **hard** (`d_*`) resets. Calibration must not fold soft into hard to “speed up” settle.

## Why calibrate per host × session

Settle knobs trade **wall clock** against **late Meta thrash** detection. Black
Wayland pilot data (2026-08-07) showed:

| Metric | Observation |
| --- | --- |
| trials | 112 / 112 ok (`quiet_agreement`) |
| waitMs | min ~8557 · p50 ~8635 · max ~9558 |
| timeToQuiet | typically **&lt;1s** (inkscape open ~960ms) |
| wait composition | Almost pure **agreement floor** (`agreeCount × interval`), not thrash |

So on **black/wayland**, waiting for 5×2s agreement ticks mostly burns ~4s/trial
with no extra signal. Slower hosts (gray/green) or **X11** may thrash longer —
**re-run calibration** before adopting full-suite knobs there.

## Quality-preserving speedups (black/wayland evidence)

| Change | Quality impact | Wall / tokens |
| --- | --- | --- |
| `agreeCount` 5 → **3** (still 2s ticks → 6s spaced quiet) | Low on black; re-check if timeouts/thrash | **~4s/trial** |
| Keep `agreementIntervalMs=2000` | Science unit unchanged | — |
| Keep `quietMs=500` | Catches brief event gaps | — |
| `cooldownMs` 2000 → **500** | After settled, extra idle is waste | **~1.5s/trial** |
| `betweenAppsMs` 5000 → **2000** | Between apps only | small |
| Dense samples **0–1 only** (was 0–4) | Still 2 dense event series | Meta load + JSON |
| Sparse `snapshotEachPoll=false` | Counts still via events | Meta load |
| `recordDetail=summary` (default) | Drops poll spam + raw events; keeps counts, deltas, timeToQuiet | **JSON ~10–50× smaller** |

Do **not** lower `agreementIntervalMs` without a thrashy re-calibration.

Fallback suite: `--suite strict` (original agreeCount=5, dense 0–4).

## Procedure (each host × session)

```bash
cd tests/meta-probe
python3 probe_driver.py prep --host <host>

# Strict short matrix → results/<host>/<session>/calibration/
python3 probe_driver.py calibrate --host <host>
# equivalent:
# python3 probe_driver.py run --host <host> --suite calibration \
#   --apps nautilus,ghostty,inkscape,gnome-terminal

python3 analyze.py results/<host>/<session>/calibration/latest.json
python3 probe_driver.py cleanup   # returns to WS1
```

### Decision rule

For each app/op look at **timeToQuietMs** vs **waitMs**:

1. If `waitMs ≈ agreeCount × agreementIntervalMs` and `timeToQuiet ≪ wait`  
   → full-suite knobs (`agreeCount=3`) are safe for that host×session.
2. If many trials have `timeToQuiet` near multi-second or settle timeouts  
   → keep `--suite strict` or raise `agreeCount` / investigate thrash apps.
3. Write a one-line note under `config.default.json` → `calibrationNote` (or plan doc).

## Full suite after green calibration

```bash
python3 probe_driver.py prep --host black
python3 probe_driver.py run --host black --suite full-suite --samples 10
# X11 session after logout into Xorg:
python3 probe_driver.py run --host black --session x11 --suite full-suite --samples 10
python3 probe_driver.py cleanup
```

Results land under `results/black/wayland/full-suite/` or `results/black/x11/full-suite/`.

## Never mix

- Do not compare Wayland vs X11 as if one session.
- Do not reuse black full-suite knobs on gray/green without calibration.
