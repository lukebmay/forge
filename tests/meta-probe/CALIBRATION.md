# Meta probe — calibration

See [AGREEMENT.md](./AGREEMENT.md) for hard/soft settle semantics.

## Bootstrap + per-op calibration

1. **First calibration** in a run (any app+op):  
   - `checkIntervalMs = 50`  
   - `settleDurationMs = 10000` (bootstrap)  
2. **Derive session knobs** from that result (`derive_knobs_from_calibration`):  
   - Slow / thrashy → **raise** `settleDurationMs` (never below 3000)  
   - Clean → may raise full-suite `checkIntervalMs` (up to ~500ms)  
3. **Each later op:** still 1× cal @ **50ms** checks with session `settleDurationMs`, then N full samples with derived interval.  
4. Soft disagreements never affect derivation of “stable” (they do not reset).

## Full suite

```bash
python3 probe_driver.py prep --host black
python3 probe_driver.py run --host black --suite full-suite --samples 10
python3 probe_driver.py cleanup
```

## Hosts / sessions

Re-bootstrap on each **host × session** (black/wayland, black/x11, gray/…).  
Do not copy derived knobs across sessions without a new bootstrap.
