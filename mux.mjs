#!/usr/bin/env node
// WebM -> H.264 MP4 (yuv420p, faststart); optional voice-over, music, subtitles, trim.
// Usage: node mux.mjs <in.webm> [--out out/demo.mp4] [--voice v.mp3] [--music m.mp3] [--music-vol 0.12]
//        [--srt out/demo.srt] [--burn] [--trim-head s] [--trim-tail s] [--crf 20]
// --srt alone attaches a soft mov_text track; with --burn it is drawn into the picture (needs ffmpeg with libass).
// ffmpeg: $FFMPEG, else PATH, else the ffmpeg-static npm binary.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
const { values: a, positionals: [inp] } = parseArgs({ allowPositionals: true, options: {
  out: { type: 'string', default: 'out/demo.mp4' }, voice: { type: 'string' }, music: { type: 'string' },
  'music-vol': { type: 'string', default: '0.12' }, srt: { type: 'string' }, burn: { type: 'boolean', default: false },
  'trim-head': { type: 'string', default: '0' }, 'trim-tail': { type: 'string', default: '0' }, crf: { type: 'string', default: '20' } } });
if (!inp) { console.error('usage: node mux.mjs <in.webm> [options]'); process.exit(2); }
const req = createRequire(import.meta.url);
const which = (b) => spawnSync('which', [b], { encoding: 'utf8' }).stdout.trim();
const ffmpeg = process.env.FFMPEG || which('ffmpeg') || (() => { try { return req('ffmpeg-static'); } catch { return ''; } })();
if (!ffmpeg) { console.error('ffmpeg not found (install it or run bun install in tools/video)'); process.exit(1); }
const probe = (f) => Number(spawnSync(ffmpeg, ['-i', f], { encoding: 'utf8' }).stderr.match(/Duration: (\d+):(\d+):([\d.]+)/)?.slice(1).reduce((s, v, i) => s + v * [3600, 60, 1][i], 0));
const head = Number(a['trim-head']), tail = Number(a['trim-tail']);
const dur = probe(inp) - head - tail;
const args = ['-y', '-ss', String(head), '-t', String(dur), '-i', inp];
let n = 1; const idx = {};
for (const k of ['voice', 'music']) if (a[k]) { args.push('-i', a[k]); idx[k] = n++; }
if (a.srt && !a.burn) { args.push('-i', a.srt); idx.srt = n++; }
let vf = 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p';
if (a.srt && a.burn) vf += `,subtitles='${a.srt.replace(/[\\':]/g, '\\$&')}':force_style='FontName=Inter,FontSize=22,Outline=2,MarginV=40'`;
const fc = [`[0:v]${vf}[v]`]; let amap = null;
if (idx.voice && idx.music) { fc.push(`[${idx.music}:a]volume=${a['music-vol']}[m]`, `[${idx.voice}:a]apad[vo];[vo][m]amix=inputs=2:duration=first:normalize=0[a]`); amap = '[a]'; }
else if (idx.voice) { fc.push(`[${idx.voice}:a]apad[a]`); amap = '[a]'; }
else if (idx.music) { fc.push(`[${idx.music}:a]volume=${a['music-vol']}[a]`); amap = '[a]'; }
args.push('-filter_complex', fc.join(';'), '-map', '[v]');
if (amap) args.push('-map', amap, '-c:a', 'aac', '-b:a', '192k', '-t', String(dur));
if (idx.srt) args.push('-map', `${idx.srt}:s`, '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng');
args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', a.crf, '-r', '30', '-movflags', '+faststart', a.out);
console.log(ffmpeg, args.join(' '));
const r = spawnSync(ffmpeg, args, { stdio: ['ignore', 'ignore', 'inherit'] });
if (r.status) process.exit(r.status);
console.log(`ok: ${a.out} (~${dur.toFixed(1)}s)`);
