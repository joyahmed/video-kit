# video-kit

Makes hackathon demo videos from a script, so every project's video is repeatable.
It drives the app in a real browser, records it, adds captions, and exports an MP4 that Devpost and YouTube accept.

Setup once: `bun install` here (Playwright + ffmpeg-static), then `bunx playwright install chromium`.

Each project keeps its own shot list (what to click, what caption to show), e.g. `ring-gatelog/video/shots.mjs`.
`shots/example.mjs` shows the format. Steps: goto wait click hover type scroll highlight caption (all take `ms`).

```
node record.mjs --base http://localhost:3000 --shots ../ring-gatelog/video/shots.mjs --out out/gatelog.webm
node srt.mjs --timeline out/gatelog.timeline.json --out out/gatelog.srt     # captions as a subtitle file
node mux.mjs out/gatelog.webm --out out/gatelog.mp4                          # H.264, plays everywhere
node mux.mjs out/gatelog.webm --voice vo.mp3 --music bed.mp3 --music-vol 0.1 --trim-head 1 --trim-tail 1
node mux.mjs out/gatelog.webm --srt out/gatelog.srt [--burn]                 # soft track, or drawn into the picture
```

- `--pace 1.5` slows everything by 50%. `BASE_URL` env works instead of `--base`.
- If you trim the head, pass `--offset -<ms>` to srt.mjs so captions still line up.
- ffmpeg: `$FFMPEG`, then PATH, then ffmpeg-static.
- Captions in the picture use Inter from Google Fonts; offline they fall back to a system font.
- Output goes to `out/` (git-ignored).
