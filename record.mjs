#!/usr/bin/env node
// Record a scripted walkthrough to WebM (default 1920x1080).
// Usage: node record.mjs [--shots shots/example.mjs] [--base http://localhost:3000] [--out out/demo.webm] [--headed] [--pace 1.0] [--captions on|off]
// --captions off: no caption box in the picture (it can cover the app); cues still go to the timeline for srt.mjs.
// Base URL: --base, else $BASE_URL, else http://localhost:3000. --pace 1.5 = 50% slower.
// Shot-list keys: viewport {width,height} = output video size; scale (default 1) = CSS zoom on the top page, so text
// reads bigger at 1080p (scale 1.33 makes a 1152px-wide app column fill 1536px). Frames in a device step keep their own
// width and media queries. (deviceScaleFactor is not used: Playwright's video does not scale it, it crops.)
import { chromium } from 'playwright';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadShots, planMs } from './lib.mjs';

const { values: a } = parseArgs({ options: {
  shots: { type: 'string', default: 'shots/example.mjs' }, base: { type: 'string' },
  out: { type: 'string', default: 'out/demo.webm' }, headed: { type: 'boolean', default: false },
  pace: { type: 'string', default: '1' }, captions: { type: 'string', default: 'on' } } });
if (!['on', 'off'].includes(a.captions)) throw new Error('--captions must be on or off');
const base = (a.base ?? process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const pace = Number(a.pace);
const shots = await loadShots(a.shots);
const W = shots.viewport?.width ?? 1920, H = shots.viewport?.height ?? 1080;
const scale = shots.scale ?? 1;
// Per-project look for dark cards and the device stage: shot-list keys bg (any CSS background) and accent (kicker, bullets).
const BG = (at) => shots.bg ?? `radial-gradient(1200px 700px at ${at} 10%,#134e4a 0%,#0b1220 60%)`;
const ACCENT = shots.accent ?? '#5eead4';
const out = resolve(a.out); mkdirSync(dirname(out), { recursive: true });
const tmpDir = resolve(dirname(out), '.rec'); mkdirSync(tmpDir, { recursive: true });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const FONT = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap';

// Caption + highlight overlay. Sizes are divided by the page zoom so captions look the same everywhere.
const OVERLAY_JS = `(() => {
  if (document.getElementById('__cap')) return; const k = 1 / (parseFloat(getComputedStyle(document.documentElement).zoom) || 1);
  const f = document.createElement('link'); f.rel = 'stylesheet'; f.href = '${FONT}'; document.head.appendChild(f);
  const st = document.createElement('style'); st.textContent = \`
   #__cap{position:fixed;left:50%;bottom:\${48*k}px;transform:translate(-50%,\${12*k}px);max-width:\${1500*k}px;padding:\${18*k}px \${34*k}px;
     border-radius:\${14*k}px;background:rgba(15,23,42,.94);color:#f8fafc;font:600 \${36*k}px/1.3 Inter,system-ui,sans-serif;text-align:center;
     opacity:0;transition:opacity .4s,transform .4s;z-index:2147483647;pointer-events:none;box-shadow:0 8px 30px rgba(0,0,0,.35)}
   #__cap.on{opacity:1;transform:translate(-50%,0)}
   .__hl{outline:\${4*k}px solid rgba(45,212,191,.95)!important;outline-offset:\${6*k}px!important;border-radius:8px;
     box-shadow:0 0 0 \${10*k}px rgba(45,212,191,.22)!important;transition:outline .3s,box-shadow .3s}\`;
  document.head.appendChild(st);
  const c = document.createElement('div'); c.id='__cap'; document.body.appendChild(c);
  window.__caption = (t, ms) => { c.textContent = t; c.classList.add('on'); clearTimeout(window.__capT);
    window.__capT = setTimeout(() => c.classList.remove('on'), ms); };
  window.__clearHl = () => document.querySelectorAll('.__hl').forEach(e => e.classList.remove('__hl'));
})()`;

// Full-screen card (title card, terminal, JSON panel). Laid out in output pixels, independent of the app.
function cardHtml(s, code) {
  const dark = s.theme !== 'light';
  const lines = (s.lines ?? []).map((l) => `<li>${esc(l)}</li>`).join('');
  const codeBlock = code == null ? '' : `<figure class="term"><div class="bar"><i></i><i></i><i></i><span>${esc(s.codeTitle ?? '')}</span></div>
    <pre>${String(code).split('\n').map((l, i) => `<span style="animation-delay:${(s.typeMs ?? 0) * i}ms">${esc(l) || ' '}</span>`).join('\n')}</pre></figure>`;
  return `<!doctype html><html data-vk-nozoom><head><meta charset="utf-8"><link rel="stylesheet" href="${FONT}"><style>
  *{box-sizing:border-box;margin:0} html,body{height:100%}
  body{background:${dark ? BG('20%') : '#f6f8f9'};color:${dark ? '#f1f5f9' : '#0f172a'};
    font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;padding-bottom:170px}
  main{width:${s.width ?? 1480}px;display:flex;flex-direction:column;gap:28px}
  .kicker{font:700 26px/1 Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:${dark ? ACCENT : '#0f766e'}}
  h1{font:800 ${s.titleSize ?? 84}px/1.08 Inter,sans-serif;letter-spacing:-.02em}
  .sub{font:500 38px/1.4 Inter,sans-serif;color:${dark ? '#cbd5e1' : '#334155'};max-width:1400px}
  ul{list-style:none;display:flex;flex-direction:column;gap:16px;font:500 34px/1.35 Inter,sans-serif;color:${dark ? '#e2e8f0' : '#1e293b'}}
  li::before{content:'';display:inline-block;width:14px;height:14px;border-radius:50%;background:${dark ? ACCENT : '#0f766e'};margin:0 22px 4px 0}
  .term{background:#0b1020;border:1px solid #1e293b;border-radius:18px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.45)}
  .bar{display:flex;gap:10px;align-items:center;padding:16px 22px;background:#111827;color:#94a3b8;font:500 22px/1 Inter,sans-serif}
  .bar i{width:14px;height:14px;border-radius:50%;background:#334155}.bar i:nth-child(1){background:#ef4444}.bar i:nth-child(2){background:#f59e0b}.bar i:nth-child(3){background:#22c55e}
  .bar span{margin-left:14px}
  pre{padding:26px 32px;font:400 ${s.codeSize ?? 28}px/1.5 'JetBrains Mono',ui-monospace,monospace;color:#e2e8f0;white-space:pre-wrap;word-break:break-all}
  pre span{opacity:${s.typeMs ? 0 : 1};animation:in .25s forwards}@keyframes in{to{opacity:1}}
  .foot{font:500 26px/1.4 Inter,sans-serif;color:${dark ? '#94a3b8' : '#64748b'}}
  </style></head><body><main>
  ${s.kicker ? `<div class="kicker">${esc(s.kicker)}</div>` : ''}
  ${s.title ? `<h1>${esc(s.title)}</h1>` : ''}${s.sub ? `<p class="sub">${esc(s.sub)}</p>` : ''}
  ${lines ? `<ul>${lines}</ul>` : ''}${codeBlock}${s.foot ? `<p class="foot">${esc(s.foot)}</p>` : ''}
  </main></body></html>`;
}

// A same-origin stage page that shows the app in a framed iframe (phone, paper sheet). Same origin keeps
// emulated media (dark, print) applying inside the frame.
function stageHtml(s) {
  const w = s.width ?? 390, h = s.height ?? 844, z = s.zoom ?? 1, paper = s.paper === true;
  const dark = s.stage !== 'light';
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONT}"><style>
  *{box-sizing:border-box;margin:0} html,body{height:100%;overflow:hidden}
  body{background:${dark ? BG('30%') : '#e5e7eb'};display:flex;align-items:center;justify-content:center;gap:${60 / scale}px;padding-bottom:${140 / scale}px;font-family:Inter,system-ui,sans-serif}
  .dev{width:${w * z + (paper ? 0 : 28)}px;height:${h * z + (paper ? 0 : 28)}px;padding:${paper ? 0 : 14}px;border-radius:${paper ? 2 : 48}px;
    background:${paper ? '#fff' : '#0f172a'};box-shadow:0 30px 90px rgba(0,0,0,.5);${paper ? '' : 'border:2px solid #334155;'}overflow:hidden}
  iframe{width:${w}px;height:${h}px;border:0;border-radius:${paper ? 0 : 36}px;transform:scale(${z});transform-origin:0 0;background:#fff;display:block}
  .label{color:#e2e8f0;font:700 ${30 / scale}px/1.3 Inter,sans-serif;max-width:${520 / scale}px}
  .label small{display:block;color:#94a3b8;font:500 ${22 / scale}px/1.4 Inter,sans-serif;margin-top:${10 / scale}px}
  </style></head><body><div class="dev"><iframe src="${esc(s.url)}"></iframe></div>
  ${s.label ? `<div class="label">${esc(s.label)}${s.note ? `<small>${esc(s.note)}</small>` : ''}</div>` : ''}</body></html>`;
}

const browser = await chromium.launch({ headless: !a.headed });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1,
  recordVideo: { dir: tmpDir, size: { width: W, height: H } } });
// Zoom as a stylesheet (an inline style on <html> is dropped by React hydration). Top frame only; cards opt out.
const ZOOM_JS = `(() => { if (window.top !== window || document.getElementById('__vkz')) return;
  const z = document.createElement('style'); z.id = '__vkz'; z.textContent = 'html:not([data-vk-nozoom]){zoom:${scale}}';
  (document.head || document.documentElement).appendChild(z); })()`;
if (scale !== 1) await ctx.addInitScript(`document.addEventListener('DOMContentLoaded', () => ${ZOOM_JS})`);
let stage = '';
await ctx.route(base + '/__vk/stage**', (r) => r.fulfill({ contentType: 'text/html', body: stage }));
const t0 = Date.now();
const page = await ctx.newPage();
const ensure = () => page.evaluate((scale !== 1 ? ZOOM_JS + ';' : '') + OVERLAY_JS).catch(() => {});
const sleep = (ms) => page.waitForTimeout(ms);
const frameOf = (s) => (s.frame ? page.mainFrame().childFrames()[0] ?? page.mainFrame() : page.mainFrame());
const timeline = [];

try {
  for (const s of shots.steps) {
    const start = Date.now(); const ms = planMs(s) * pace;
    const fr = frameOf(s);
    const loc = s.selector ? fr.locator(s.selector).first() : null;
    if (s.do === 'goto') { await page.goto(s.url.startsWith('http') ? s.url : base + s.url, { waitUntil: 'load' }); await ensure(); }
    else if (s.do === 'click') { await ensure(); await loc.scrollIntoViewIfNeeded(); await loc.hover(); await sleep(500); await loc.click(); await page.waitForLoadState('load').catch(() => {}); await ensure(); }
    else if (s.do === 'hover') { await loc.scrollIntoViewIfNeeded(); await loc.hover(); }
    else if (s.do === 'type') { await loc.click(); await loc.pressSequentially(s.text, { delay: 90 }); }
    else if (s.do === 'scroll') { // smooth scroll to y px (or to selector), in the page or (frame: true) the stage iframe
      await fr.evaluate(([y, sel, dur, off]) => new Promise(res => {
        const from = scrollY; const to = sel ? document.querySelector(sel).getBoundingClientRect().top + scrollY - off : y;
        const t = performance.now(); const step = (n) => { const p = Math.min(1, (n - t) / dur); const e = p < .5 ? 2*p*p : 1 - Math.pow(-2*p+2, 2)/2;
          scrollTo(0, from + (to - from) * e); p < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); }),
        [s.y ?? 0, s.selector ?? null, Math.min(s.dur ?? 1500, ms * .8), s.offset ?? 80]); }
    else if (s.do === 'highlight') { await ensure(); await loc.scrollIntoViewIfNeeded(); await page.evaluate(() => window.__clearHl());
      await loc.evaluate(e => e.classList.add('__hl')); }
    else if (s.do === 'caption') { await ensure(); if (a.captions === 'on') await page.evaluate(([t, d]) => window.__caption(t, d), [s.text, (s.ms ?? 4000) * pace]);
      timeline.push({ start: Date.now() - t0, end: Date.now() - t0 + (s.ms ?? 4000) * pace, text: s.text }); }
    else if (s.do === 'media') { // emulate colorScheme ('dark'|'light'|null) and/or media ('print'|'screen'|null)
      const m = {}; for (const k of ['colorScheme', 'media', 'reducedMotion']) if (k in s) m[k] = s[k];
      await page.emulateMedia(m); }
    else if (s.do === 'card') { // full-screen card; code from `code` or fetched JSON from `codeFrom` (pretty-printed)
      let code = s.code ?? null;
      if (s.codeFrom) { const r = await page.request.get(s.codeFrom.startsWith('http') ? s.codeFrom : base + s.codeFrom);
        code = JSON.stringify(await r.json(), null, 2); if (s.codeHead) code = `${s.codeHead}\n${code}`; }
      await page.setContent(cardHtml(s, code), { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready); await ensure(); }
    else if (s.do === 'device') { // the app inside a phone (default 390x844) or paper sheet (paper: true) frame
      stage = stageHtml({ ...s, url: s.url.startsWith('http') ? s.url : base + s.url });
      await page.goto(base + '/__vk/stage?' + start, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready); await ensure(); }
    else if (s.do !== 'wait') throw new Error('unknown step ' + s.do);
    const rest = ms - (Date.now() - start); if (rest > 0) await sleep(rest);
    if (s.do === 'highlight' && s.keep !== true) await page.evaluate(() => window.__clearHl?.());
    console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s.do} ${s.selector ?? s.url ?? s.text ?? s.title ?? s.y ?? ''}`);
  }
} finally {
  const vid = page.video(); await ctx.close();
  if (vid) { renameSync(await vid.path(), out); console.log('video:', out); }
  await browser.close();
}
writeFileSync(out.replace(/\.webm$/, '') + '.timeline.json', JSON.stringify(timeline, null, 1));
console.log('timeline:', timeline.length, 'caption cues');
