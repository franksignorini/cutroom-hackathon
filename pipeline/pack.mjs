#!/usr/bin/env node
// pack.mjs — everything the crew needs inside the CreateOS sandbox, in one archive (no node_modules: the engine and the
// pipeline use Node built-ins only):
//   engine/   the studio engine: lib/, render.mjs, the tools they import, the instruments the score uses (VSCO 2 CE, CC0)
//   pipeline/ pipeline.mjs, lib/, agents/, film/
//
//   node pipeline/pack.mjs [--out dist/cutroom-crew.tgz]     (ENGINE_DIR as for pipeline.mjs)
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCORE_INSTRUMENTS, SCORE_KEYS, SCORE_MIN_VELOCITY } from './lib/plan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const ENGINE = resolve(process.env.ENGINE_DIR || join(REPO, '..', 'cinematic-studio'));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg('out', join(REPO, 'dist', 'cutroom-crew.tgz')));
const STAGE = join(dirname(OUT), 'stage');

// 1. The engine files render.mjs and tools/sound.mjs need: follow their relative imports.
const files = new Set();
function follow(file) {
  if (files.has(file) || !existsSync(file)) return;
  files.add(file);
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) follow(resolve(dirname(file), m[1] ?? m[2]));
}
follow(join(ENGINE, 'render.mjs'));
follow(join(ENGINE, 'tools', 'sound.mjs'));
for (const f of ['motion', 'draw', 'atmos', 'particles', 'space', 'captions', 'hud', 'post', 'studio', 'theme', 'layout', 'transitions', 'type', 'fields', 'hatch'])
  follow(join(ENGINE, 'lib', `${f}.js`));

// 2. The instruments: the alias table in tools/sound.mjs -> .sfz -> the samples each one names.
const sound = readFileSync(join(ENGINE, 'tools', 'sound.mjs'), 'utf8');
const alias = Object.fromEntries([...sound.matchAll(/'?([a-z0-9.]+)'?:\s*'([^']+\.sfz)'/g)].map((m) => [m[1], m[2]]));
const libRoot = join(ENGINE, 'library', 'instruments');
function findSfz(name) {
  const stack = [libRoot];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (e === name) return p;
      if (statSync(p).isDirectory()) stack.push(p);
    }
  }
  return null;
}
// Only the regions the score can reach: its keys (SCORE_KEYS) and its velocities (>= SCORE_MIN_VELOCITY).
const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const toMidi = (v) => {
  if (v == null) return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  const m = /^([a-g])([#b]?)(-?\d)$/i.exec(v.trim());
  return m ? 12 * (Number(m[3]) + 1) + NOTE[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) : null;
};
for (const inst of SCORE_INSTRUMENTS) {
  const name = alias[inst];
  const sfz = name && findSfz(name);
  if (!sfz) { console.warn(`instrument ${inst}: no ${name ?? 'alias'} found`); continue; }
  files.add(sfz);
  const text = readFileSync(sfz, 'utf8');
  const base = dirname(sfz);
  const def = /default_path=([^\r\n]+)/.exec(text)?.[1]?.trim() ?? '';
  const keys = SCORE_KEYS[inst];
  for (const region of text.split('<region>').slice(1)) {
    const get = (k) => new RegExp(`(?:^|\\s)${k}=([^\\s]+)`).exec(region)?.[1];
    const sample = /sample=([^\r\n]+?\.(?:wav|flac|ogg))/i.exec(region)?.[1];
    if (!sample) continue;
    const lo = toMidi(get('lokey') ?? get('key')) ?? 0, hi = toMidi(get('hikey') ?? get('key')) ?? 127;
    if (keys && !keys.some((k) => k >= lo && k <= hi)) continue;
    if (Number(get('hivel') ?? 127) < SCORE_MIN_VELOCITY) continue;
    const p = resolve(base, def.replace(/\\/g, '/'), sample.trim().replace(/\\/g, '/'));
    if (existsSync(p)) files.add(p);
  }
}

// 3. Stage and archive.
rmSync(STAGE, { recursive: true, force: true });
let bytes = 0;
for (const f of files) {
  const dest = join(STAGE, 'engine', relative(ENGINE, f));
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(f, dest);
  bytes += statSync(f).size;
}
mkdirSync(join(STAGE, 'engine', 'projects'), { recursive: true });
writeFileSync(join(STAGE, 'engine', 'package.json'), JSON.stringify({ name: 'cutroom-engine', private: true, type: 'module' }));
for (const d of ['lib', 'agents', 'film']) cpSync(join(HERE, d), join(STAGE, 'pipeline', d), { recursive: true });
cpSync(join(HERE, 'pipeline.mjs'), join(STAGE, 'pipeline', 'pipeline.mjs'));
writeFileSync(join(STAGE, 'pipeline', 'package.json'), JSON.stringify({ name: 'cutroom-pipeline', private: true, type: 'module' }));
mkdirSync(dirname(OUT), { recursive: true });
const tar = spawnSync('tar', ['-czf', basename(OUT), 'engine', 'pipeline'], { cwd: STAGE, stdio: 'inherit' }); // relative names: GNU tar reads 'C:' as a host
  if (tar.status === 0) cpSync(join(STAGE, basename(OUT)), OUT);
if (tar.status !== 0) process.exit(1);
rmSync(STAGE, { recursive: true, force: true });
console.log(`${files.size} engine files (${(bytes / 1e6).toFixed(1)} MB raw) + pipeline -> ${relative(process.cwd(), OUT)} (${(statSync(OUT).size / 1e6).toFixed(1)} MB)`);
