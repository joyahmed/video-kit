// Shared helpers: shot-list loading and the planned-duration model (used by srt.mjs when no recorded timeline exists).
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export async function loadShots(file) {
  const mod = await import(pathToFileURL(resolve(file)).href);
  return mod.default;
}

// Planned milliseconds per step. record.mjs paces itself to at least these.
export function planMs(s) {
  switch (s.do) {
    case 'goto': return s.ms ?? 2500;
    case 'wait': return s.ms ?? 1000;
    case 'click': return s.ms ?? 1800;
    case 'hover': return s.ms ?? 1200;
    case 'type': return s.ms ?? Math.max(1200, (s.text?.length ?? 0) * 120 + 600);
    case 'scroll': return s.ms ?? 1800;
    case 'highlight': return s.ms ?? 2000;
    case 'media': return s.ms ?? 300;
    case 'card': return s.ms ?? 4000;
    case 'device': return s.ms ?? 4000;
    case 'caption': return 0; // overlay is non-blocking; use a following wait
    default: throw new Error(`unknown step: ${s.do}`);
  }
}

// Estimated caption cues [{start,end,text}] in ms.
export function planCues(shots) {
  let t = 0; const cues = [];
  for (const s of shots.steps) {
    if (s.do === 'caption') cues.push({ start: t, end: t + (s.ms ?? 4000), text: s.text });
    else t += planMs(s);
  }
  return cues;
}
