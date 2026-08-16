# Media fixtures for live / residual smokes

| File | Use |
| --- | --- |
| `vlc-end-of-video.webm` | Short (~3s) silent clip for **R020**: tile VLC, play to end, assert the window stays in its tile slot (not Meta fullscreen / off-slot). |

Path from repo root:

```text
tests/fixtures/media/vlc-end-of-video.webm
```

Manual / harness smoke (post-AL8 nest PASS 2026-08-15; host eyes-on optional):

```bash
# Multi-tile desk (not lone-max), then nest or host:
# Prefer QT_QPA_PLATFORM=wayland / unset DISPLAY inside nest.
vlc --play-and-stop --no-video-title-show \
  tests/fixtures/media/vlc-end-of-video.webm
# Expect: VLC remains TILE in its slot after EOS (R020 / D026).
```

Source: operator Desktop `vlc-test.webm` (Kooha capture), trimmed/re-encoded smaller for the tree.
