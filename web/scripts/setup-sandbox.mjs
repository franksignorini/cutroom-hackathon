#!/usr/bin/env node
// setup-sandbox.mjs — prepares the warm CreateOS sandbox the crew runs in. Run it once from the PC (and again after the
// pipeline or the engine change):
//   1. creates the sandbox (devbox:1, ingress on) or reuses CREATEOS_SANDBOX_ID
//   2. uploads dist/cutroom-crew.tgz (node pipeline/pack.mjs) in chunks and unpacks it in /workspace
//   3. installs ffmpeg and Google Chrome (+ a --no-sandbox wrapper: the VM runs as root)
//   4. proves it: renders a still and a score inside the sandbox, with the times (the CreateOS spike numbers)
//   5. prints the CREATEOS_SANDBOX_ID to put in web/.env and on Vercel
//
//   cd web && node scripts/setup-sandbox.mjs [--skip-install] [--mock]
// The key: CREATEOS_SANDBOX_API_KEY, or CREATEOS_PROJECT_API_KEY from Stripe Projects (repo root .env).
// --mock talks to the app's mock API (http://localhost:3000/api/mock/createos) to test this script without credit.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CreateosSandboxClient } from '@nodeops-createos/sandbox';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(WEB, '..');
for (const f of [join(WEB, '.env'), join(REPO, '.env')]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*([^#\s]*)/.exec(line);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const flag = (k) => process.argv.includes(`--${k}`);
const MOCK = flag('mock');
const apiKey = MOCK ? 'mock' : process.env.CREATEOS_SANDBOX_API_KEY || process.env.CREATEOS_PROJECT_API_KEY;
if (!apiKey) throw new Error('No CreateOS key: CREATEOS_SANDBOX_API_KEY, or `stripe projects add createos/project`');
const client = new CreateosSandboxClient({
  apiKey,
  baseUrl: MOCK ? 'http://localhost:3000/api/mock/createos' : process.env.CREATEOS_SANDBOX_BASE_URL || undefined,
  timeoutMs: 600_000,
});
const PACK = join(REPO, 'dist', 'cutroom-crew.tgz');
if (!existsSync(PACK)) throw new Error('No dist/cutroom-crew.tgz: run `node pipeline/pack.mjs` first');

const t0 = performance.now();
const step = async (label, fn) => {
  const t = performance.now();
  process.stdout.write(`${label}… `);
  const r = await fn();
  console.log(`${Math.round(performance.now() - t)} ms`);
  return r;
};
const sh = async (sb, script, timeoutMs = 900_000) => {
  const r = await sb.runCommand('bash', ['-lc', script], { timeoutMs });
  if (r.result.exit_code !== 0) throw new Error(`failed (${r.result.exit_code}): ${script.slice(0, 80)}\n${(r.result.stderr || r.result.stdout).slice(-800)}`);
  return r.result.stdout.trim();
};

const me = await step('whoami', () => client.whoami());
console.log(`  ${JSON.stringify(me).slice(0, 160)}`);

const sb = await step('sandbox', async () => {
  if (process.env.CREATEOS_SANDBOX_ID) {
    const s = await client.getSandbox(process.env.CREATEOS_SANDBOX_ID);
    if (s.status === 'paused') await s.resume();
    return s;
  }
  return client.createSandbox({
    shape: process.env.CREATEOS_SHAPE || 's-2vcpu-4gb',
    rootfs: 'devbox:1',
    region: process.env.CREATEOS_REGION || 'eu',
    name: 'cutroom-crew',
    ingress_enabled: true,
    auto_pause_after_seconds: 900,
  });
});
console.log(`  ${sb.id} · ${sb.data.shape} · VM up in ${sb.data.spawn_ms ?? '?'} ms`);

// Upload in 16 MB parts (one PUT of 220 MB is asking for a timeout), then join and unpack.
const buf = readFileSync(PACK), PART = 16 * 1024 * 1024, parts = Math.ceil(buf.length / PART);
await step(`upload ${(buf.length / 1e6).toFixed(0)} MB in ${parts} parts`, async () => {
  for (let i = 0; i < parts; i++) await sb.files.upload(`/workspace/upload/pack.${String(i).padStart(3, '0')}`, buf.subarray(i * PART, (i + 1) * PART), { timeoutMs: 300_000 });
});
await step('unpack', () => sh(sb, 'cd /workspace && cat upload/pack.* > crew.tgz && rm -rf upload engine/lib engine/tools pipeline && tar -xzf crew.tgz && rm crew.tgz && mkdir -p briefs engine/projects && ls'));

if (!flag('skip-install')) {
  await step('ffmpeg + Chrome (apt)', () => sh(sb, [
    'export DEBIAN_FRONTEND=noninteractive',
    'command -v ffmpeg >/dev/null || (apt-get update -qq && apt-get install -y -qq ffmpeg >/dev/null)',
    'command -v google-chrome >/dev/null || (cd /tmp && curl -fsSLo chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && apt-get install -y -qq ./chrome.deb >/dev/null && rm chrome.deb)',
    "printf '#!/bin/sh\\nexec google-chrome --no-sandbox --disable-dev-shm-usage \"$@\"\\n' > /usr/local/bin/chrome-nosandbox && chmod +x /usr/local/bin/chrome-nosandbox",
  ].join(' && ')));
}
console.log(`  ${await sh(sb, 'node --version; ffmpeg -version | head -n1 | cut -d" " -f1-3; /usr/local/bin/chrome-nosandbox --version; nproc')}`.replace(/\n/g, ' · '));

// The proof: one still and one score, timed inside the VM.
const proof = JSON.stringify({ title: 'CUTROOM', statement: 'setup check', duration: 4, fps: 24, bpm: 100, formats: ['16x9'],
  look: { key: 'low', ground: '#0A0A0B', text: '#ECE7DE', accent: '#FF4D1A', grade: 'neutral' },
  type: { roles: [{ role: 'DISPLAY', face: 'Bebas Neue', weight: '400', job: 'display' }, { role: 'TEXT', face: 'Inter', weight: '500', job: 'text' }] },
  beats: [{ name: 'hook', kind: 'statement', t: 0, dur: 2, words: ['EVERY', 'FRAME', 'IS', 'CODE'] }, { name: 'title', kind: 'title', t: 2, dur: 2, words: ['CUTROOM'] }],
  peak: { t: 2, beat: 'title' }, music: { mood: 'epic', key: 'D', palette: 'hybrid' }, family: 'triumph', rev: 0 });
await sb.files.upload('/workspace/engine/projects/setup-check/film.json', proof);
await step('render a still in the sandbox', () => sh(sb, 'cd /workspace/engine && cp ../pipeline/film/index.html projects/setup-check/ && CHROME_PATH=/usr/local/bin/chrome-nosandbox node render.mjs projects/setup-check --stills markers --scale 0.5', 300_000));
await step('render 4 s of video in the sandbox', () => sh(sb, 'cd /workspace/engine && CHROME_PATH=/usr/local/bin/chrome-nosandbox node render.mjs projects/setup-check --scale 0.6667 --sub 1', 600_000));

let url = '';
try { url = sb.previewUrl(8080); } catch {}
console.log(`\nready in ${((performance.now() - t0) / 1000).toFixed(0)} s. Put this in web/.env (and on Vercel):\n  CREATEOS_SANDBOX_ID=${sb.id}\n  PIPELINE=live\n  CREATEOS_MOCK=off${url ? `\npreview URL of the crew's feed: ${url}` : ''}`);
