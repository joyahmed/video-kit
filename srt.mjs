#!/usr/bin/env node
// Make an .srt from the caption steps. Uses recorded timings (out/<name>.timeline.json) when given, else the planned ones.
// Usage: node srt.mjs [--shots shots/example.mjs] [--timeline out/demo.timeline.json] [--out out/demo.srt] [--offset ms]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadShots, planCues } from './lib.mjs';
const { values: a } = parseArgs({ options: { shots: { type: 'string', default: 'shots/example.mjs' },
  timeline: { type: 'string' }, out: { type: 'string', default: 'out/demo.srt' }, offset: { type: 'string', default: '0' } } });
const cues = a.timeline ? JSON.parse(readFileSync(a.timeline, 'utf8')) : planCues(await loadShots(a.shots));
const ts = (ms) => { ms = Math.max(0, Math.round(ms + Number(a.offset))); const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
const body = cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n');
mkdirSync(dirname(resolve(a.out)), { recursive: true }); writeFileSync(a.out, body);
console.log(`${cues.length} cues -> ${a.out} (${a.timeline ? 'recorded' : 'planned'} timings)`);
