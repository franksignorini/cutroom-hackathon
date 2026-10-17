#!/usr/bin/env node
// record-screen.mjs — films the studio replaying the recorded run (the demo's backup video): headless Chrome opens
// /jobs/demo at a replay speed, a screenshot every frame for the length of the run, then ffmpeg makes an MP4.
// Uses the studio engine's Chrome driver (../cinematic-studio/tools/bin.mjs) and needs the app running.
//
//   node tools/record-screen.mjs [--url http://localhost:3000/jobs/demo] [--speed 6] [--fps 8] [--out dist/demo-screen.mp4]
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = resolve(process.env.ENGINE_DIR || join(REPO, '..', 'cinematic-studio'));
const { launch, openPage } = await import(pathToFileURL(join(ENGINE, 'tools', 'bin.mjs')).href);
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };

const speed = Number(arg('speed', 6)), fps = Number(arg('fps', 8));
const url = `${arg('url', 'http://localhost:3000/jobs/demo')}?speed=${speed}`;
const out = resolve(arg('out', join(REPO, 'dist', 'demo-screen.mp4')));
const W = 1440, H = 900;

// The run's length at this speed, plus the wrap screen.
const recorded = JSON.parse((await import('node:fs')).readFileSync(join(REPO, 'web', 'src', 'lib', 'recorded-run.json'), 'utf8'));
const seconds = Math.max(...recorded.events.map((e) => e.at)) / speed + 6;

const frames = join(dirname(out), 'screen-frames');
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const browser = await launch(W, H);
try {
  // openPage waits for a film page (window.__studio): the app has none, so give it a stand-in before navigating.
  const target = await openPage(browser, 'data:text/html,<script>window.__studio={ready:Promise.resolve()}</script>', W, H);
  await target.send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 4000));
  const n = Math.round(seconds * fps);
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const due = t0 + (i * 1000) / fps;
    if (Date.now() < due) await new Promise((r) => setTimeout(r, due - Date.now()));
    writeFileSync(join(frames, `${String(i).padStart(5, '0')}.jpg`), await target.shot(1, 'jpeg', 80));
    if (i % (fps * 5) === 0) process.stdout.write(`\r${Math.round((i / n) * 100)}%`);
  }
} finally {
  await browser.close();
}
const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(fps), '-i', join(frames, '%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-vf', 'scale=1440:-2', '-r', '30', out], { stdio: 'inherit' });
rmSync(frames, { recursive: true, force: true });
if (r.status !== 0) process.exit(1);
console.log(`\r${out} (${seconds.toFixed(0)} s of the studio at ${speed}x)`);
