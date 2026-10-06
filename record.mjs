#!/usr/bin/env node
// Record a scripted walkthrough to WebM (1920x1080).
// Usage: node record.mjs [--shots shots/example.mjs] [--base http://localhost:3000] [--out out/demo.webm] [--headed] [--pace 1.0]
// Base URL: --base, else $BASE_URL, else http://localhost:3000. --pace 1.5 = 50% slower.
import { chromium } from 'playwright';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadShots, planMs } from './lib.mjs';

const { values: a } = parseArgs({ options: {
  shots: { type: 'string', default: 'shots/example.mjs' }, base: { type: 'string' },
  out: { type: 'string', default: 'out/demo.webm' }, headed: { type: 'boolean', default: false },
  pace: { type: 'string', default: '1' } } });
const base = (a.base ?? process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const pace = Number(a.pace);
const shots = await loadShots(a.shots);
const W = shots.viewport?.width ?? 1920, H = shots.viewport?.height ?? 1080;
const out = resolve(a.out); mkdirSync(dirname(out), { recursive: true });
const tmpDir = resolve(dirname(out), '.rec'); mkdirSync(tmpDir, { recursive: true });

const OVERLAY_JS = `(() => {
  if (window.__gl) return; window.__gl = true;
  const f = document.createElement('link'); f.rel = 'stylesheet';
  f.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@500;600&display=swap'; document.head.appendChild(f);
  const st = document.createElement('style'); st.textContent = \`
   #__cap{position:fixed;left:50%;bottom:56px;transform:translate(-50%,12px);max-width:1400px;padding:20px 36px;border-radius:14px;
     background:rgba(15,23,42,.92);color:#f8fafc;font:600 38px/1.3 Inter,system-ui,sans-serif;text-align:center;opacity:0;
     transition:opacity .4s,transform .4s;z-index:2147483647;pointer-events:none;box-shadow:0 8px 30px rgba(0,0,0,.35)}
   #__cap.on{opacity:1;transform:translate(-50%,0)}
   .__hl{outline:4px solid rgba(45,212,191,.95)!important;outline-offset:6px!important;border-radius:8px;
     box-shadow:0 0 0 10px rgba(45,212,191,.22)!important;transition:outline .3s,box-shadow .3s}\`;
  document.head.appendChild(st);
  const c = document.createElement('div'); c.id='__cap'; document.body.appendChild(c);
  window.__caption = (t, ms) => { c.textContent = t; c.classList.add('on'); clearTimeout(window.__capT);
    window.__capT = setTimeout(() => c.classList.remove('on'), ms); };
  window.__clearHl = () => document.querySelectorAll('.__hl').forEach(e => e.classList.remove('__hl'));
})()`;

const browser = await chromium.launch({ headless: !a.headed });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1,
  recordVideo: { dir: tmpDir, size: { width: W, height: H } } });
const t0 = Date.now();
const page = await ctx.newPage();
const ensure = () => page.evaluate(OVERLAY_JS).catch(() => {});
const sleep = (ms) => page.waitForTimeout(ms);
const timeline = [];

try {
  for (const s of shots.steps) {
    const start = Date.now(); const ms = planMs(s) * pace;
    const loc = s.selector ? page.locator(s.selector).first() : null;
    if (s.do === 'goto') { await page.goto(s.url.startsWith('http') ? s.url : base + s.url, { waitUntil: 'load' }); await ensure(); }
    else if (s.do === 'click') { await ensure(); await loc.scrollIntoViewIfNeeded(); await loc.hover(); await sleep(500); await loc.click(); await page.waitForLoadState('load').catch(() => {}); await ensure(); }
    else if (s.do === 'hover') { await loc.scrollIntoViewIfNeeded(); await loc.hover(); }
    else if (s.do === 'type') { await loc.click(); await loc.pressSequentially(s.text, { delay: 90 }); }
    else if (s.do === 'scroll') { // smooth scroll to y px (or to selector)
      await page.evaluate(([y, sel, dur]) => new Promise(res => {
        const from = scrollY; const to = sel ? document.querySelector(sel).getBoundingClientRect().top + scrollY - 80 : y;
        const t = performance.now(); const step = (n) => { const p = Math.min(1, (n - t) / dur); const e = p < .5 ? 2*p*p : 1 - Math.pow(-2*p+2, 2)/2;
          scrollTo(0, from + (to - from) * e); p < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); }),
        [s.y ?? 0, s.selector ?? null, Math.min(1500, ms * .8)]); }
    else if (s.do === 'highlight') { await ensure(); await loc.scrollIntoViewIfNeeded(); await page.evaluate(() => window.__clearHl());
      await loc.evaluate(e => e.classList.add('__hl')); }
    else if (s.do === 'caption') { await ensure(); await page.evaluate(([t, d]) => window.__caption(t, d), [s.text, (s.ms ?? 4000) * pace]);
      timeline.push({ start: Date.now() - t0, end: Date.now() - t0 + (s.ms ?? 4000) * pace, text: s.text }); }
    else if (s.do !== 'wait') throw new Error('unknown step ' + s.do);
    if (s.do === 'highlight' || s.do === 'scroll') {} 
    const rest = ms - (Date.now() - start); if (rest > 0) await sleep(rest);
    if (s.do === 'highlight' && s.keep !== true) await page.evaluate(() => window.__clearHl?.());
    console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s.do} ${s.selector ?? s.url ?? s.text ?? s.y ?? ''}`);
  }
} finally {
  const vid = page.video(); await ctx.close();
  if (vid) { renameSync(await vid.path(), out); console.log('video:', out); }
  await browser.close();
}
writeFileSync(out.replace(/\.webm$/, '') + '.timeline.json', JSON.stringify(timeline, null, 1));
console.log('timeline:', timeline.length, 'caption cues');
