# video-kit

Makes hackathon demo videos from a script, so every project's video is repeatable.
It drives the app in a real browser, records it, adds captions, and exports an MP4 that Devpost and YouTube accept.

Setup once: `bun install` here (Playwright + ffmpeg-static), then `bunx playwright install chromium`.

Each project keeps its own shot list (what to click, what caption to show), e.g. `my-app/video/shots.mjs`.
`shots/example.mjs` shows the format. Steps: goto wait click hover type scroll highlight caption (all take `ms`).

More steps (defaults in `lib.mjs` planMs: media 300 ms, card 4000, device 4000):

- `card` - a full-screen title or code card: `kicker, title, titleSize, sub, lines[], code` or `codeFrom` (a JSON URL, fetched and pretty-printed) with `codeHead`, plus `codeTitle, codeSize, typeMs` (typing speed), `foot, theme, width`.
- `device` - the app inside a phone frame or on paper: `url, width, height, zoom, paper, label, note, stage`. The page loads in a same-origin iframe on a stage served at `/__vk/stage` (via `ctx.route`). Both stages leave room at the bottom for the caption.
- `media` - emulate `colorScheme`, `media` (`'print'`) and `reducedMotion`; `null` resets.
- `scroll` also takes `frame: true` (scroll the device iframe), `offset` (px above a selector) and `dur`.

Shot-list keys `bg` (any CSS background) and `accent` (a colour) set the look of dark cards and the device stage, so each project's video has its own colours. Set them for every project - the fallback is a plain bluish black.

Shot-list key `scale` (e.g. 1.3333) lays the page out smaller and captures it sharp: a CSS `zoom` on the top frame through an injected `<style id=__vkz>`. Card pages opt out with `html[data-vk-nozoom]`. `deviceScaleFactor` is not used: in recordings it crops instead of scaling.

```
node record.mjs --base http://localhost:3000 --shots ../my-app/video/shots.mjs --out out/demo.webm
node srt.mjs --timeline out/demo.timeline.json --out out/demo.srt     # captions as a subtitle file
node mux.mjs out/demo.webm --out out/demo.mp4                          # H.264, plays everywhere
node mux.mjs out/demo.webm --voice vo.mp3 --music bed.mp3 --music-vol 0.1 --trim-head 1 --trim-tail 1
node mux.mjs out/demo.webm --srt out/demo.srt [--burn]                 # soft track, or drawn into the picture
```

- `--captions off` keeps the caption box out of the picture (use it with a voice-over, or when the box covers the app); the cues still go to the timeline, so `srt.mjs` makes a subtitle file viewers can turn on.
- `--pace 1.5` slows everything by 50%. `BASE_URL` env works instead of `--base`.
- If you trim the head, pass `--offset -<ms>` to srt.mjs so captions still line up.
- ffmpeg: `$FFMPEG`, then PATH, then ffmpeg-static.
- Captions in the picture use Inter from Google Fonts; offline they fall back to a system font.
- Output goes to `out/` (git-ignored).

MIT licence - see `LICENSE`.
