#!/usr/bin/env node
// pipeline.mjs — one trailer, start to finish: Director → Sound → Builder → Critic → Render, with the studio's engine
// (lib/, render.mjs, tools/sound.mjs). Runs on the PC (PIPELINE=local, started by the app) or inside the CreateOS
// sandbox (PIPELINE=live). Every step is an event on the feed (lib/feed.mjs) that the studio page shows live.
//
//   node pipeline/pipeline.mjs --brief path/to/brief.json [--port 0]
//   brief.json: { id, prompt, tier, duration, models: [...] | { director, builder, critic }, requestBudget, maxUsd }
// env: OPENROUTER_API_KEY (required), ENGINE_DIR (the studio engine; default ../cinematic-studio next to this repo),
//      CUTROOM_URL + JOB_TOKEN (heartbeat and done; optional), PUBLIC_URL (how browsers reach this feed), HOST, FEED_PORT,
//      RENDER_SCALE (default 0.6667 = 720p), LINGER_S (keep serving the video after the end, default 1800)
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFeed } from './lib/feed.mjs';
import { BudgetError, createLLM, tool, toolArgs } from './lib/llm.mjs';
import { DEVICES, DISPLAY_FONTS, PLAN_SCHEMA, applyPatch, normalize, score } from './lib/plan.mjs';
import { cast, castingText } from './lib/casting.mjs';
import { builderMd, criticMd, directorMd, soundMd } from './lib/crew.mjs';
import { briefThings, fetchIcons } from './lib/icons.mjs';
import { fetchPhotos } from './lib/photos.mjs';
import { frameDetail, typedWords } from './lib/shotcheck.mjs';
import { unpackNotes } from './lib/notes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const env = process.env;

const brief = JSON.parse(readFileSync(arg('brief'), 'utf8'));
const ENGINE = resolve(env.ENGINE_DIR || join(HERE, '..', '..', 'cinematic-studio'));
if (!existsSync(join(ENGINE, 'render.mjs'))) throw new Error(`no studio engine at ${ENGINE} (set ENGINE_DIR)`);
const NAME = `cutroom-${brief.id}`;
const DIR = join(ENGINE, 'projects', NAME);
mkdirSync(join(DIR, 'out', 'cut'), { recursive: true });
mkdirSync(join(DIR, 'audio'), { recursive: true });
mkdirSync(join(DIR, 'shots'), { recursive: true });

const feed = createFeed({ dir: DIR, port: Number(arg('port', env.FEED_PORT ?? 0)), host: env.HOST || '127.0.0.1' });
const PORT = await feed.ready;
const PUBLIC = (env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const fileUrl = (rel) => `${PUBLIC}/files/${rel.split('\\').join('/')}`;
console.log(`CUTROOM_FEED ${PUBLIC}`); // the app reads this line

const emit = feed.emit;
const say = (agent, text) => emit({ type: 'say', agent, text });
// Paths as the sandbox shows them (forward slashes), wherever the crew runs.
const out = (text, tone) => emit({ type: 'out', text: String(text).replace(/\\(?=\S)/g, '/'), tone });
const write = (rel, data) => {
  writeFileSync(join(DIR, rel), data);
  emit({ type: 'fs', op: 'write', path: rel.split('\\').join('/'), bytes: Buffer.byteLength(data) });
};
const agent = (id, state, text) => emit({ type: 'agent', agent: id, state, ...(text ? { say: text } : {}) });
// Each agent's file for the viewer (lib/crew.mjs): written to crew/ like any other file, and sent whole on the feed.
mkdirSync(join(DIR, 'crew'), { recursive: true });
const crewFile = (id, md) => {
  const path = `crew/${id.toUpperCase()}.md`;
  write(path, md);
  emit({ type: 'crew', agent: id, path, md });
};
const models_ = {}; // the model that answered for each role, for the crew files
// The casting draw (lib/casting.mjs): rolled from the job id, so a retry of the same job gets the same film.
// brief.seed: the casting draw of another job, so two crews can be compared on the same draw (default: this job)
const casting = cast(brief.seed ?? brief.id, { devices: Object.keys(DEVICES), fonts: Object.keys(DISPLAY_FONTS) });

// ---------------------------------------------------------------- stop: CUT from the app, or a signal
let stopped = false;
const children = new Set();
class Stopped extends Error {}
function stop(why) {
  if (stopped) return;
  stopped = true;
  out(`stop: ${why}`, 'warn');
  for (const c of children) c.kill('SIGTERM');
}
const check = () => { if (stopped) throw new Stopped('stopped'); };
process.on('SIGTERM', () => { stop('SIGTERM'); setTimeout(() => process.exit(0), 500); });
process.on('SIGINT', () => { stop('SIGINT'); setTimeout(() => process.exit(0), 500); });

async function report(path, body) {
  if (!env.CUTROOM_URL || !env.JOB_TOKEN) return null;
  try {
    const r = await fetch(`${env.CUTROOM_URL}/api/jobs/${brief.id}/${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-job-token': env.JOB_TOKEN }, body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(10_000),
    });
    return await r.json().catch(() => null);
  } catch { return null; }
}
/** Publishes a finished file on Cloudinary with a signature from the app (the secret never reaches the crew).
 *  null when the app has no Cloudinary or the upload fails: the caller keeps serving the file itself. */
async function publish(rel, kind, name) {
  if (!env.CUTROOM_URL || !env.JOB_TOKEN) return null;
  try {
    const r = await fetch(`${env.CUTROOM_URL}/api/jobs/${brief.id}/upload`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-job-token': env.JOB_TOKEN }, body: JSON.stringify({ kind, name }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const { url, fields } = await r.json();
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    form.append('file', new Blob([readFileSync(join(DIR, rel))]), rel.split('/').pop());
    emit({ type: 'cmd', text: `upload ${rel} → Cloudinary (signed by the app)` });
    const up = await fetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(120_000) });
    const j = await up.json().catch(() => ({}));
    if (!up.ok || !j.secure_url) { out(`cloudinary: ${j.error?.message ?? up.status}`, 'warn'); return null; }
    out(`${rel} → ${new URL(j.secure_url).host} · ${(j.bytes / 1e6).toFixed(1)} MB`, 'ok');
    return j.secure_url;
  } catch (err) {
    out(`cloudinary: ${err.message}`, 'warn');
    return null;
  }
}

const beat = setInterval(async () => {
  const r = await report('heartbeat');
  if (r?.stop) stop(`the job is ${r.status ?? 'stopped'} (CUT)`);
}, 15_000);

// ---------------------------------------------------------------- the engine, as child processes
function run(args, { label, onLine } = {}) {
  check();
  emit({ type: 'cmd', text: label ?? `node ${args.join(' ')}` });
  return new Promise((ok) => {
    const c = spawn(process.execPath, args, { cwd: ENGINE, env: { ...env, FORCE_COLOR: '0' } });
    children.add(c);
    let stdout = '', stderr = '', buf = '';
    const line = (l) => { l = l.trim(); if (l) onLine?.(l); };
    c.stdout.on('data', (d) => { const s = d.toString(); stdout += s; buf += s; const parts = buf.split(/\r|\n/); buf = parts.pop(); parts.forEach(line); });
    c.stderr.on('data', (d) => { stderr += d.toString(); });
    c.on('close', (code) => { children.delete(c); line(buf); ok({ code, stdout, stderr }); });
  });
}
const rel = (p) => relative(ENGINE, p).split('\\').join('/');

let film;
const stillIds = {};
// The studio's rule: judge settled frames. A still at the start of a shot catches letters still flying in (the Critic
// then reads "SILNC"); near the end it catches the transition. So each beat is shot once it has landed: a slam on its
// last word, any other shot 0.3 s before its end.
const stillTime = (b) => {
  const each = b.kind === 'slams' ? b.dur / Math.max(1, b.words.length) : 0;
  const at = each ? b.t + b.dur - each * 0.15 : b.t + Math.max(Math.min(b.dur - 0.3, b.dur * 0.8), Math.min(0.6, b.dur / 2));
  return +Math.min(at, film.duration - 0.05).toFixed(3);
};

/** Render one settled still per beat, publish the ones that changed. */
async function shootStills(changed = null) {
  const times = film.beats.map(stillTime);
  const shoot = () => run(['render.mjs', rel(DIR), '--stills', times.join(','), '--scale', '0.5'], {
    label: `node render.mjs ${NAME} --stills ${times.join(',')} --scale 0.5`,
    onLine: (l) => /stills ->|contact sheet/.test(l) && out(l.replace(/\s+\[.*$/, ''), 'dim'),
  });
  let r = await shoot();
  if (r.code !== 0) { // Chrome sometimes dies on start (eval 2026-10-16, not reproducible): one more try
    out(`stills render failed (${(r.stderr || r.stdout).trim().split(/\r?\n/).pop()?.slice(0, 80)}), retrying`, 'warn');
    r = await shoot();
  }
  const errors = r.stderr.split(/\r?\n/).filter((l) => /\[page error\]|\[shot /.test(l)).map((l) => l.replace(/^\[page error\]\s*/, '').trim());
  if (r.code !== 0) throw new Error(`render failed: ${(r.stderr || r.stdout).trim().split(/\r?\n/).slice(-3).join(' ')}`);
  const dir = join(DIR, 'out', 'stills-adhoc');
  film.beats.forEach((b, i) => {
    const f = `t${times[i].toFixed(3).padStart(8, '0')}.png`;
    if (!existsSync(join(dir, f)) || (changed && !changed.has(b.name))) return;
    const rev = (stillIds[b.name]?.rev ?? 0) + 1, id = `${b.name}-r${rev}`, dest = `out/cut/${id}.png`;
    copyFileSync(join(dir, f), join(DIR, dest));
    emit({ type: 'still', id, src: fileUrl(dest), t: times[i], beat: b.name, rev, ...(stillIds[b.name] ? { replaces: stillIds[b.name].id } : {}) });
    stillIds[b.name] = { id, rev };
  });
  return { errors, contact: join(dir, 'contact.png') };
}

/** The Builder's shot, rendered at its start, middle and settled frame: a crash part-way (eval: "signs is not
 *  defined" at 1.6 s) or a black frame (eval: the horror world shot) goes back to the Builder as feedback. */
async function checkShot(b) {
  const times = [b.t + 0.15, b.t + b.dur * 0.5, stillTime(b)].map((t) => +Math.min(t, film.duration - 0.05).toFixed(3));
  const r = await run(['render.mjs', rel(DIR), '--stills', times.join(','), '--scale', '0.25', '--dir', 'shotcheck'], {
    label: `node render.mjs ${NAME} --stills ${times.join(',')} --dir shotcheck`,
  });
  const problems = r.stderr.split(/\r?\n/).filter((l) => /\[page error\]|\[shot /.test(l)).map((l) => l.replace(/^\[page error\]\s*/, '').trim());
  // The error line, not the last one: a crash ends on "Node.js v22.20.0", which told the Builder nothing (KITE, 2026-10-16).
  const said = (r.stderr || r.stdout).trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const why = said.find((l) => /(Error|error:|Timeout|timed out|exceeded)/.test(l) && !/^at /.test(l)) ?? said.filter((l) => !/^Node\.js v/.test(l)).pop();
  if (r.code !== 0 && !problems.length) problems.push(`the render failed: ${why ?? 'no output'}`);
  if (!problems.length) {
    const still = join(DIR, 'out', 'shotcheck', `t${times[2].toFixed(3).padStart(8, '0')}.png`);
    const luma = meanLuma(still);
    // Calibrated on the eval stills (grayscale): a wordless black shot 0.19, the darkest readable horror card 3.0.
    if (luma != null && luma < 1.5) problems.push(`the frame at ${times[2]} s is almost black (mean brightness ${luma.toFixed(2)} of 255): the words must be clearly visible`);
    // An empty frame of any colour: calibrated on 40 stills (2026-10-16): blank paper 0.46-0.55, a 100 px palm in the
    // dark 0.28, the quietest real drop 1.6, words and pictures 2-8.
    const detail = frameDetail(still);
    if (!problems.length && detail != null && detail < 1) problems.push(`the frame at ${times[2]} s is almost empty (detail ${detail.toFixed(2)}; a readable frame is 2 or more): draw the words big in a colour that contrasts with the ground (k.C.bone on k.C.ink), and make the picture fill the frame`);
    // Only the settled frame was measured, so a shot that sat black or empty for its first second passed (AURORA,
    // 2026-10-16: the hud beat black 3.6-5.1 s, the rush beat empty for 1 s of 1.8, 2.5 s of 15 dead, and the Critic's
    // sheet only shows settled frames). The early frame (the cut is over by then) and the middle must carry something.
    const early = +(b.t + Math.min(0.6, b.dur * 0.3)).toFixed(3);
    // ...and the end: TIDEWATER's lamp shot (2026-10-16) faded to black for its last 1.3 s, the next beat came out of
    // black too: a dip to black is fine, a second of it is a dead frame.
    const late = +Math.min(b.t + b.dur - 0.45, film.duration - 0.05).toFixed(3);
    if (!problems.length) {
      const more = await run(['render.mjs', rel(DIR), '--stills', `${early},${late}`, '--scale', '0.25', '--dir', 'shotcheck'], { label: `node render.mjs ${NAME} --stills ${early},${late} --dir shotcheck` });
      const at = (t) => join(DIR, 'out', 'shotcheck', `t${t.toFixed(3).padStart(8, '0')}.png`);
      for (const t of more.code === 0 ? [early, times[1], late] : [times[1]]) {
        const d = frameDetail(at(t));
        if (d != null && d < 1.2) {
          problems.push(`the frame at ${t} s (${(t - b.t).toFixed(1)} s into the shot) is almost empty (detail ${d.toFixed(2)}; a readable frame is 2 or more): something big must be on screen from the first half second: draw the picture already in place at frame 0 of the shot and fill the frame with it (solid or glowing shapes, not 1 px lines), and bring the words in by 40% of the beat, and keep them on screen to the end of the shot (no fade to black)`);
          break;
        }
      }
    }
    // A hand-written shot is there for its picture: rendered without its words, the middle frame must still hold
    // something. BLUE NOTE NIGHTS' "NAPLES ROOFTOPS" (2026-10-17) was two words on a flat ground (0.09 once the words
    // were off), ORBITAL DRIFT a small panel in an empty frame (0.55); shots with a real picture measured 1.2-7.
    if (!problems.length) {
      const mid = times[1];
      const bare = await run(['render.mjs', rel(DIR), '--stills', String(mid), '--scale', '0.25', '--dir', 'shotcheck-bare', '--words', 'off'], { label: `node render.mjs ${NAME} --stills ${mid} --words off` });
      const d = bare.code === 0 ? frameDetail(join(DIR, 'out', 'shotcheck-bare', `t${mid.toFixed(3).padStart(8, '0')}.png`)) : null;
      // 1.15: SALT WATER (2026-10-17) passed at 1.10 with a flat teal rectangle; the faintest real picture (LEVAIN) is 1.20
      if (d != null && d < 1.15) problems.push(`without its words the shot is almost empty (detail ${d.toFixed(2)} at ${mid} s; a picture is 1.2 or more): this beat is written by hand for its picture: draw the subject itself big (the thing, the place, the person, built from filled shapes and light), filling at least half the frame, with the words over or beside it`);
    }
  }
  return problems;
}

/** Mean luma (0-255) of an image in grayscale, from ffmpeg's signalstats; null if ffmpeg is not there. */
function meanLuma(file) {
  if (!existsSync(file)) return null;
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-vf', 'format=gray,scale=480:-1,signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /YAVG=([\d.]+)/.exec(`${r.stdout}${r.stderr}`);
  return m ? Number(m[1]) : null;
}

const saveFilm = () => write('film.json', JSON.stringify(film, null, 1));
// Premium agents get the studio's fuller craft (agents/premium/*.md); Free keeps the short, recipe-like prompts.
const PREMIUM = brief.tier === 'premium';
const prompt = (name, vars = {}) => {
  const premium = join(HERE, 'agents', 'premium', `${name}.md`);
  const file = PREMIUM && existsSync(premium) ? premium : join(HERE, 'agents', `${name}.md`);
  return readFileSync(file, 'utf8').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
};
const planText = () => JSON.stringify({ title: film.title, logline: film.statement, type: film.kind, device: film.device, peak: { ...film.peak, family: film.family }, ...(film.story ? { story: film.story } : {}), look: film.look, icons: (film.icons ?? []).map((i) => i.word), beats: film.beats.map(({ name, kind, t, dur, words, sub, air, image, icon }) => ({ name, kind, t, dur, words, sub, air, image, icon, ...((film.photos ?? []).some((p) => p.beat === name) ? { photo: film.photos.find((p) => p.beat === name).query } : {}) })) });

// ---------------------------------------------------------------- the run
const t0 = Date.now();
// One chain for every agent, or one per role (Premium: Opus thinks for the Director and the Critic, DeepSeek builds).
const models = Array.isArray(brief.models) ? (brief.models.length ? brief.models : (env.MODELS || 'openrouter/free').split(',')) : brief.models ?? (env.MODELS || 'openrouter/free').split(',');
const modelsText = Array.isArray(models) ? models.join(', ') : Object.entries(models).map(([r, l]) => `${r}: ${l[0]}`).join(' · ');
const llm = createLLM({
  key: env.OPENROUTER_API_KEY,
  models,
  budget: Number(brief.requestBudget ?? env.REQUEST_BUDGET ?? 25),
  maxUsd: Number(brief.maxUsd ?? env.MAX_USD ?? 1),
  onUsage: (u) => {
    emit({ type: 'cost', usd: +u.usd.toFixed(4), vcpuSeconds: Math.round((Date.now() - t0) / 1000), tokens: u.tokens });
    out(`${u.model} · ${u.last} tokens · ${(u.ms / 1000).toFixed(1)} s · request ${u.requests}`, 'dim');
  },
  onLog: (m, tone) => out(m, tone),
});
const costNow = () => emit({ type: 'cost', usd: +llm.total.usd.toFixed(4), vcpuSeconds: Math.round((Date.now() - t0) / 1000), tokens: llm.total.tokens });

async function director() {
  agent('director', 'working', 'Reading the brief');
  const duration = Number(brief.duration) || 10;
  // TIDE (2026-10-17): a dive watch film named an anchor and a compass and never showed the watch
  const things = brief.photos === 'all' ? [] : briefThings(brief.prompt);
  const messages = [
    { role: 'system', content: prompt('director', { DURATION: duration, PHOTOS: env.PIXABAY_API_KEY ? '' : '(Photos are off in this run: every beat is drawn, leave `photo` out.)' }) },
    { role: 'user', content: `The idea: ${brief.prompt}\n\n${castingText(casting)}${things.length ? `\n\nThings in the idea the studio has as lit 3D objects: ${things.join(', ')}. When one of them is what the film is about (the product, the subject) and a cheerful 3D render suits the film (not luxury, drama or horror), name it FIRST in \`icons\`, in these words: it becomes the film's object in the reveal, the drop and the end card.` : ''}${brief.photos === 'all' && env.PIXABAY_API_KEY ? '\n\nThis film is told in real photos: put a `photo` on EVERY beat except the title (the hook and the drop too), each a search for a real scene, place or material of the idea (for a product: the product itself, its material, the life around it), graded under the words. Leave `icons` empty: no cartoon, no emoji, no clip-art; the photos and the type carry the film. Keep the words few and big.' : ''}` },
  ];
  out(`casting draw: ${casting.looks.map((l) => l.name).join(' / ')} · shape "${casting.shape.name}" · layout ${casting.layout} · cuts ${casting.cuts.join('+')}`, 'dim');
  const tools = [tool('write_plan', 'Write the plan of the trailer', PLAN_SCHEMA)];
  let lastModel, usable; // usable: the last plan that only had problems, if a later answer brings none
  for (let attempt = 1; attempt <= 3; attempt++) {
    check();
    let reply;
    try {
      reply = await llm.chat({ messages, tools, toolChoice: { type: 'function', function: { name: 'write_plan' } }, maxTokens: 8000, avoid: lastModel, role: 'director', timeoutMs: 90_000 }); // thinking takes longer
    } catch (err) {
      // Without a plan there is no trailer: when every model is busy, wait out the cooldown and ask again.
      if (err instanceof Stopped || ((err instanceof BudgetError || attempt === 3) && !usable)) throw err;
      if (err instanceof BudgetError || attempt === 3) break;
      out(`director: ${err.message.slice(0, 120)} · waiting 45 s`, 'warn');
      await new Promise((r) => setTimeout(r, 45_000));
      continue;
    }
    const { message, model } = reply;
    const raw = toolArgs(message, 'write_plan');
    mkdirSync(join(DIR, 'out', 'debug'), { recursive: true });
    writeFileSync(join(DIR, 'out', 'debug', `plan.attempt${attempt}.json`), JSON.stringify(raw ?? message, null, 1));
    if (!raw) {
      lastModel = model; // the next try goes to another model first
      out(`${model}: no plan in the answer, asking again`, 'warn');
      continue;
    }
    models_.director = model;
    const { film: f, problems } = normalize(raw, { duration, prompt: brief.prompt, casting, photos: env.PIXABAY_API_KEY ? brief.photos : false });
    if (problems.length && attempt < 3) {
      usable = f;
      out(`plan check: ${problems.join('; ')}`, 'warn');
      // The retry is a plain message, not a replayed tool call: the next model may be another provider, and Gemini
      // refuses a tool call in the history that it did not sign (thought_signature).
      messages.splice(2, Infinity, { role: 'user', content: `Your previous plan:\n${JSON.stringify(raw)}\n\nFix these and call write_plan again with the whole plan: ${problems.join('; ')}` });
      continue;
    }
    film = f;
    break;
  }
  // a plan with problems beats no film: a third answer with no plan in it ended the run with a plan in hand
  if (!film && usable) { film = usable; out('director: keeping the last plan, with its problems', 'warn'); }
  if (!film) throw new Error('the Director could not write a plan');
  // The things the Director named, as vector icons (lib/icons.mjs): the picture the type alone could not give.
  if (film.iconWords?.length) {
    mkdirSync(join(DIR, 'icons'), { recursive: true });
    film.icons = await fetchIcons(film.iconWords, DIR, { onCmd: (text) => emit({ type: 'cmd', text }), writeFile: write });
    out(film.icons.length ? `icons: ${film.icons.map((i) => `${i.word} → ${[i.id, i.obj && `3D ${i.objName}`].filter(Boolean).join(' + ')}`).join(', ')}` : 'icons: none found', film.icons.length ? 'ok' : 'dim');
  }
  await syncPhotos();
  saveFilm();
  copyFileSync(join(HERE, 'film', 'index.html'), join(DIR, 'index.html'));
  emit({ type: 'fs', op: 'write', path: 'index.html', bytes: statSync(join(DIR, 'index.html')).size });
  emit({ type: 'plan', title: film.title, logline: film.statement, duration: film.duration, beats: film.beats.map(({ name, t, dur, words }) => ({ name, t, dur, words })) });
  const peak = film.beats.find((b) => b.name === film.peak.beat);
  say('director', `${film.title}: ${film.statement}`);
  crewFile('director', directorMd(film, { model: models_.director, casting }));
  agent('director', 'done', `Plan locked:${film.beats.length} beats, peak on ${peak?.name ?? 'the title'} at ${film.peak.t.toFixed(1)} s`);
}

/** The real photos the beats ask for (lib/photos.mjs), only with a Pixabay key: without one every beat is drawn. Called
 *  after the plan and after the Critic's notes (a new search, or "none" back to drawn); a photo already fetched for the
 *  same search is kept. */
async function syncPhotos() {
  const want = film.beats.filter((b) => b.photo && b.kind !== 'title');
  film.photos = (film.photos ?? []).filter((p) => want.some((b) => b.name === p.beat && b.photo === p.query));
  const asks = want.filter((b) => !film.photos.some((p) => p.beat === b.name)).map((b) => ({ beat: b.name, query: b.photo }));
  if (!asks.length || !env.PIXABAY_API_KEY) return;
  mkdirSync(join(DIR, 'photos'), { recursive: true });
  const got = await fetchPhotos(asks, { used: new Set(film.photos.map((p) => p.id)), key: env.PIXABAY_API_KEY, cacheDir: join(ENGINE, 'projects', '.cache', 'pixabay'), writeFile: write, onCmd: (text) => emit({ type: 'cmd', text }) });
  film.photos.push(...got);
  out(got.length ? `photos: ${got.map((p) => `${p.beat} → "${p.query}" by ${p.user} (Pixabay)`).join(', ')}` : `photos: none found for ${asks.map((a) => `"${a.query}"`).join(', ')}`, got.length ? 'ok' : 'dim');
}

async function sound() {
  agent('sound', 'working', `Scoring ${film.music.mood}, ${film.music.key} minor, ${film.bpm} BPM`);
  const sheet = score(film);
  write('sound.json', JSON.stringify(sheet, null, 1));
  const r = await run(['tools/sound.mjs', `${rel(DIR)}/sound.json`], { label: `node tools/sound.mjs ${NAME}/sound.json`, onLine: (l) => out(l.replace(/ -> .*$/, ''), 'dim') });
  if (r.code !== 0) throw new Error(`sound failed: ${r.stderr.trim().split('\n').pop()}`);
  emit({ type: 'fs', op: 'write', path: 'audio/mix.wav', bytes: statSync(join(DIR, 'audio', 'mix.wav')).size });
  crewFile('sound', soundMd(film, sheet));
  agent('sound', 'done', `Score on the grid: ${film.music.mood}, hit on the peak at ${film.peak.t.toFixed(1)} s`);
}

// Free models sometimes send the module with escaped newlines, inside a code fence, or with prose around it.
function cleanCode(code) {
  let c = String(code ?? '').trim();
  const fence = /```(?:js|javascript|mjs)?\s*\n([\s\S]*?)```/.exec(c);
  if (fence) c = fence[1];
  if (!c.includes('\n') && c.includes('\\n')) c = c.replace(/\\n/g, '\n').replace(/\\t/g, '  ').replace(/\\"/g, '"');
  // Prose before the module goes; code before `export default` stays. Cutting at `export default` threw away the
  // helpers and constants a module declares above draw(): every Claude shot of the A/B (2026-10-16) died with
  // "ember is not defined" / "SMOKE is not defined", while DeepSeek, which nests everything in draw(), never hit it.
  const lines = c.split('\n');
  const first = lines.findIndex((l) => /^\s*(export|const|let|var|function|class|async|import|\/\/|\/\*|\*)/.test(l));
  return first > 0 ? lines.slice(first).join('\n') : c;
}

const BAD = [[/\bimport\s*[({\w*]/, 'no import'], [/\bdocument\./, 'no document'], [/\bwindow\./, 'no window'], [/\bfetch\s*\(/, 'no fetch'], [/Math\.random/, 'no Math.random(): use k.rng(seed)'], [/export\s+default/, null]];
// The checks read the code, not what it draws: DeepSeek's HUD shot showed the line "import { Agent } from 'createos';"
// on screen, and a check on the raw source threw away three good shots (2026-10-16). Strings and comments go first.
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1 ')
  .replace(/`(?:\\[\s\S]|\$\{[^}]*\}|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, '""');
// Free writes one shot by hand; Premium (a stronger coder, ~1 cent a shot on DeepSeek) writes two.
async function builder() {
  const order = ['world', 'card', 'hud', 'rush', 'slams', 'statement'];
  const all = film.beats.filter((b, i) => i > 0 && i < film.beats.length - 1 && b.kind !== 'drop' && order.includes(b.kind));
  // a beat with a real photo already has its picture: HOUND & HEIRLOOM's Builder (2026-10-17) painted a drawn parkland
  // over its misty English countryside, and the photo never showed
  const photo = new Set((film.photos ?? []).map((p) => p.beat)), free = all.filter((b) => !photo.has(b.name));
  // a photo-led film keeps its photos clean: no beat left without one, no shot drawn by hand
  // every beat on a photo: the Director chose real pictures throughout, nothing is drawn by hand over them
  const middle = free;
  const targets = [...middle].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).slice(0, 1);
  // One hand-written shot for both tiers: Premium's is Claude Sonnet (~$0.065 an attempt), and a second Sonnet shot took
  // the trailer to $0.27 (KITE, 2026-10-16); the recipes around it now carry the 3D objects and a full HUD.
  if (!targets.length) { crewFile('builder', builderMd([])); agent('builder', 'done', 'Every shot comes from a recipe'); return; }
  // Premium's Builder is Claude Sonnet, ~$0.07 an attempt: two per shot (NIGHT FERRY, 2026-10-16: three attempts on one
  // shot took the trailer to $0.29). Free attempts cost nothing and keep three.
  for (const target of targets) await buildShot(target, targets.length, { tries: PREMIUM ? 2 : 3 });
  crewFile('builder', builderMd(shots, { model: models_.builder }));
}
const shots = []; // what the Builder wrote, for BUILDER.md

/** A hand-written shot for a beat -> true if it rendered clean. With `fix` (the Critic's words on the shot already
 *  there), one more try at that shot instead of a fresh one. */
async function buildShot(target, of, { tries = 3, fix = null } = {}) {
  agent('builder', 'working', fix ? `Re-shooting ${target.name} after the Critic's note` : `Writing ${of > 1 ? 'a' : 'the'} signature shot: ${target.name}`);
  if (!fix) say('builder', `Shot ${target.name}: ${target.image ?? target.words.join(' ')}`);
  const messages = [
    { role: 'system', content: prompt('builder') },
    { role: 'user', content: `The film: ${planText()}\n\nWrite the shot for the beat "${target.name}" (${target.dur} s): ${target.image ?? ''}. Words on screen: ${JSON.stringify(target.words)}${target.sub ? `, small line: "${target.sub}"` : ''}. Its weather: ${target.air ?? 'your choice'}. The film's signature device: ${film.device} (${DEVICES[film.device]}).` },
  ];
  if (fix) {
    const prev = existsSync(join(DIR, 'shots', `${target.name}.js`)) ? readFileSync(join(DIR, 'shots', `${target.name}.js`), 'utf8') : '';
    messages.push({ role: 'user', content: `${prev ? `Your shot:\n\`\`\`js\n${prev}\n\`\`\`\n\n` : ''}The Critic watched its frame on a phone and said: "${fix}". It is the film's only hand-drawn picture: rewrite the shot so that note no longer applies (big, bright, readable, the picture filling the frame) and call write_shot.` });
  }
  const tools = [tool('write_shot', 'Write the shot module', { type: 'object', required: ['code'], properties: {
    code: { type: 'string', description: 'The full ES module source' },
    note: { type: 'string', description: 'One or two sentences, first person: the idea of the shot' },
  } })];
  const kind = target.kind === 'custom' ? target.fallback : target.kind;
  const rec = { name: fix ? `${target.name} (re-shot)` : target.name, kind, note: '', code: '', attempts: 0, errors: [], kept: false };
  shots.push(rec);
  let lastError = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    check();
    let reply;
    try {
      reply = await llm.chat({ messages, tools, toolChoice: { type: 'function', function: { name: 'write_shot' } }, maxTokens: 20000, temperature: 0.7, role: 'builder', fast: true }); // the hackathon take: 12k went on reasoning, no code
    } catch (err) {
      // Any model failure (budget, every model busy) keeps the recipe: a hand-written shot is a bonus, never a blocker
      // (eval 2026-10-16: every model was busy and the whole brand run died here).
      if (err instanceof Stopped) throw err;
      out(`builder: ${err.message.slice(0, 140)}`, 'warn');
      break;
    }
    const { message } = reply;
    const args = toolArgs(message, 'write_shot');
    let code = args?.code;
    rec.attempts = attempt;
    models_.builder = reply.model;
    if (args?.note) rec.note = String(args.note).slice(0, 400);
    if (!code && /export\s+default/.test(message.content ?? '')) code = message.content;
    if (code) {
      code = cleanCode(code);
      mkdirSync(join(DIR, 'out', 'debug'), { recursive: true });
      writeFileSync(join(DIR, 'out', 'debug', `${target.name}.attempt${attempt}.js`), code);
      rec.code = code;
    }
    const problems = !code ? ['no code in the answer: call write_shot with { code }'] : BAD.filter(([re, why]) => (why ? re.test(codeOnly(code)) : !re.test(code))).map(([, why]) => why ?? 'it needs `export default function draw(g, t, k)`');
    // The words come from the plan, not from the code: the Critic's word fixes on a hand-written shot never showed
    // (2026-10-16, the Perseids: "the fix was not applied"), because the shot had its words typed in.
    // an icon or 3D object named in the code ('ocean' for k.icon) is not a typed word: EUROPA DIVE's shot was rejected
    // twice for it (2026-10-16)
    const named = new Set((film.icons ?? []).flatMap((i) => i.word.toUpperCase().split(/\s+/)));
    const typed = code ? typedWords(code, target).filter((w) => !named.has(w)) : [];
    if (typed.length) problems.push(`the words ${typed.join(", ")} are typed into the code: draw k.beat.words and k.beat.sub instead (the Critic may change them)`);
    let feedback;
    if (!problems.length) {
      write(`shots/${target.name}.js`, code);
      target.kind = 'custom';
      target.fallback = kind;
      film.rev++;
      saveFilm();
      const mine = await checkShot(target);
      if (!mine.length) await shootStills(new Set([target.name]));
      if (!mine.length) {
        rec.kept = true;
        agent('builder', 'done', `Shot ${target.name} ${fix ? 're-shot' : 'written'} by hand: ${code.split('\n').length} lines of canvas code`);
        return true;
      }
      // Point at the failing line of the module: a bare "non-finite value" came back three times unchanged (2026-10-16).
      const at = Number(/\(line (\d+)\)/.exec(mine[0])?.[1]);
      const src = at ? code.split('\n')[at - 1]?.trim() : '';
      feedback = `The render reported: ${mine.slice(0, 3).join(' | ')}.${src ? ` Line ${at} is: ${src}` : ''} Fix the cause (not only that line) and call write_shot again.`;
      out(`shot ${target.name}: ${mine[0].slice(0, 160)}`, 'warn');
      rec.errors.push(`attempt ${attempt}: ${mine[0].slice(0, 200)}`);
      target.kind = kind;
      delete target.fallback;
      // The same error twice means the model cannot see it: stop paying for attempts and keep the recipe. Compared
      // without its numbers: "detail 0.91" then "detail 0.99" is the same empty frame (INKWELL, 2026-10-16: a third
      // free attempt, two more minutes).
      const kindOf = (e) => String(e).replace(/[\d.]+/g, '#');
      if (lastError && kindOf(mine[0]) === kindOf(lastError)) { out(`shot ${target.name}: the same error twice, keeping the ${kind} recipe`, 'warn'); break; }
      lastError = mine[0];
    } else {
      feedback = `Rejected before rendering: ${problems.join('; ')}. Fix it and call write_shot again.`;
      out(`shot ${target.name}: ${problems.join('; ')}`, 'warn');
      rec.errors.push(`attempt ${attempt}: ${problems.join('; ')}`);
      // The same rejection twice: the model cannot see it (or the check is wrong). Keep the recipe, stop paying.
      if (problems[0] === lastError) { out(`shot ${target.name}: rejected twice for the same reason, keeping the ${kind} recipe`, 'warn'); break; }
      lastError = problems[0];
    }
    // A plain message, not a replayed tool call (see the Director): any provider can take the retry.
    messages.splice(2, Infinity, { role: 'user', content: `${code ? `Your previous shot:\n\`\`\`js\n${code}\n\`\`\`\n\n` : ''}${feedback}` });
  }
  // A failed shot leaves the film without a picture: HUSH ONE (2026-10-17) went out as five type cards at 5.8 with a 3D
  // pair of headphones in its icons. When the film has a thing to show and no reveal yet, the beat becomes the reveal.
  // (not a slams beat: its words are a rhythm, and RIDE THE ALPS held "ONE BY ONE" beside a mountain for 5.7 s)
  const reveal = !fix && kind !== 'slams' && film.beats.indexOf(target) > 0 && !film.beats.some((b) => b.kind === 'reveal') && (film.icons ?? []).some((i) => i.obj || i.file);
  target.kind = reveal ? 'reveal' : kind;
  film.rev++;
  saveFilm();
  await shootStills(new Set([target.name]));
  agent('builder', 'done', reveal ? `The hand-written shot did not render clean: ${target.name} becomes the reveal, the subject as a lit object` : `Kept the ${kind} recipe for ${target.name}: the hand-written shot did not render clean`);
  return false;
}

async function critic(contact) {
  agent('critic', 'working', 'Watching the contact sheet');
  const img = readFileSync(contact).toString('base64');
  const messages = [
    { role: 'system', content: prompt('critic') },
    { role: 'user', content: [
      { type: 'text', text: `The brief: ${brief.prompt}\nThe plan: ${planText()}\nThe beats on the sheet, left to right: ${film.beats.map((b) => b.name).join(', ')}.` },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${img}` } },
    ] },
  ];
  const tools = [tool('review', 'Score the trailer and list up to 3 fixes', {
    type: 'object', required: ['score', 'notes'],
    properties: {
      summary: { type: 'string', description: 'Two sentences, first person: what you saw on the sheet' },
      score: { type: 'number' },
      notes: { type: 'array', maxItems: 3, items: { type: 'object', required: ['text', 'field', 'value'], properties: {
        beat: { type: 'string' }, field: { type: 'string' }, value: {}, text: { type: 'string' } } } },
    },
  })];
  let review, firstEmpty;
  try {
    // A free model that thinks past its token limit answers nothing: one more try on the next model of the chain
    // (THE QUIET FLOOR and VOLT 9, 2026-10-16: two of ten free films shipped with no review).
    for (let tryN = 0, avoid; tryN < 2 && !review; tryN++) {
      let reply;
      try { reply = await llm.chat({ messages, tools, toolChoice: { type: 'function', function: { name: 'review' } }, vision: true, maxTokens: 12000, temperature: 0.3, role: 'critic', avoid }); }
      // the first answer had no notes and every other model is busy: that answer is still a review
      catch (err) { if (tryN && firstEmpty && !(err instanceof Stopped)) break; throw err; }
      const { message, model } = reply;
      models_.critic = model;
      review = toolArgs(message, 'review');
      if (review && !Array.isArray(review.notes))
        review.notes = Array.isArray(review.fixes) ? review.fixes : typeof review.notes === 'string' ? [{ text: review.notes }] : review.notes ? [review.notes] : [];
      if (!review) { out(`critic: unusable answer from ${model}${tryN ? '' : ', asking the next model'}: ${String(message.content ?? JSON.stringify(message.tool_calls ?? '')).slice(0, 160)}`, 'warn'); avoid = model; }
      // No notes at all is a sign-off without looking: CRUX's free Critic (2026-10-17) gave 8 and zero notes while its own
      // summary named a near-empty drop. The next model gets one try; an empty review that stays empty is a 7 at most.
      else if (!review.notes?.length && tryN === 0) {
        out(`critic: ${model} gave no notes, asking the next model`, 'warn');
        firstEmpty = review; review = null; avoid = model;
      }
    }
    if (!review && firstEmpty) review = firstEmpty;
    if (review && !review.notes?.length && Number(review.score) > 7) review.score = 7;
    if (review?.notes) review.notes = unpackNotes(review.notes); // a notes list packed into one note's text
  } catch (err) {
    // Any model failure (budget, every model busy, none sees images) skips the review: the plan's shots still ship.
    if (!(err instanceof Stopped)) {
      crewFile('critic', criticMd({ skipped: err.message.slice(0, 160) }));
      agent('critic', 'done', `Skipped the review: ${err.message.slice(0, 120)}`);
      return;
    }
    throw err;
  }
  if (!review?.notes) { crewFile('critic', criticMd({ skipped: 'the answer had no usable notes' }, { model: models_.critic })); agent('critic', 'done', 'No usable review this time'); return; }
  const record = { summary: review.summary ? String(review.summary).slice(0, 500) : '', score: Number.isFinite(Number(review.score)) ? Number(review.score) : null, notes: [] };
  // A film with no hand-drawn picture is a 7 at most: the free Critic gave type-only films 8 even with that rule in its prompt.
  // (real photos are pictures too)
  if (record.score != null && !film.beats.some((b) => b.kind === 'custom') && !film.photos?.length) record.score = Math.min(record.score, 7);
  if (record.score != null) review.score = record.score;
  const writeReview = () => crewFile('critic', criticMd(record, { model: models_.critic }));
  const before = structuredClone(film);
  const beforeSheet = join(DIR, 'out', 'critic-before.png');
  copyFileSync(contact, beforeSheet);
  const changed = new Set(), applied = [];
  let n = 0;
  for (let note of review.notes.slice(0, 3)) {
    n++;
    const target = film.beats.find((b) => b.name === note.beat);
    // A note that "sets" a hand-written shot's words to the words it already has means the shot does not show them
    // (blank, garbled, hidden): new words cannot repair a drawing, the recipe can. SPROUT and BRIDGE BALL
    // (2026-10-16): the Critic saw the broken shot both times, re-sent the same words, and the second look rightly
    // found nothing changed and rolled the fix back.
    // Line by line: ["ONE MOVE", "LEFT."] is a new layout of ["ONE MOVE LEFT."], not the same words (ENDGAME, 2026-10-17:
    // the Critic's split into lines was refused as "the value it already has", on NEON KITCHEN's hook too).
    const norm = (v) => [v].flat().map((w) => String(w).toUpperCase().replace(/\s+/g, ' ').trim()).join('\n');
    const same = (a, b) => norm(a) === norm(b);
    if (target?.kind === 'custom' && target.fallback && ['words', 'sub'].includes(note.field) && same(note.value, target[note.field] ?? '')) {
      note = { ...note, field: 'kind', value: target.fallback, recipe: true };
      out(`note ${n}: the shot ${target.name} does not show its own words, back to the ${target.fallback} recipe`, 'warn');
    }
    emit({ type: 'note', n, text: String(note.text ?? `${note.field} → ${JSON.stringify(note.value)}`).slice(0, 200), ...(target && stillIds[target.name] ? { still: stillIds[target.name].id } : {}), ...(n === 1 && Number.isFinite(Number(review.score)) ? { score: `${review.score}/10` } : {}) });
    // Premium keeps a picture: when the note would send the film's last hand-written shot back to its recipe, the
    // Builder gets one more try with the Critic's words first (SALT & EMBER, 2026-10-16: one shot crashed, the Critic
    // sent the other to a type card, and the film about fish on open flames ended as five text cards). The new shot
    // stays only if it renders clean; otherwise the recipe, as the note asked.
    if (PREMIUM && note.field === 'kind' && target?.kind === 'custom' && !film.beats.some((b) => b !== target && b.kind === 'custom')) {
      out(`note ${n}: ${target.name} is the film's last hand-drawn picture: the Builder gets one more try first`, 'dim');
      const ok = await buildShot(target, 1, { tries: 1, fix: String(note.text ?? 'the frame does not read on a phone') });
      crewFile('builder', builderMd(shots, { model: models_.builder }));
      agent('critic', 'working', 'Watching the contact sheet');
      if (ok) {
        record.notes.push({ n, text: note.text, beat: note.beat, field: 'kind', value: 'custom', status: 're-shot by the Builder' });
        applied.push({ n, note: { ...note, value: 'a new hand-written shot', recipe: true, reshot: true } }); // stays: the old shot is gone
        changed.add(target.name);
        emit({ type: 'fix', n });
        continue;
      }
      // buildShot put the shot's own recipe back; it stays on that one (SUMMIT, 2026-10-16: the note's "rush" was then kept
      // although the second look rejected it, because a recipe note is never rolled back)
      note = { ...note, value: target.kind, recipe: true };
    }
    // A recipe beat "rewritten" with the words it already has changes nothing: not a fix (SALT & EMBER, 2026-10-16: the
    // note asked for a contradiction in the hook's second line and sent the same two lines back, counted as kept).
    // a sub is shown as written, so its case counts: "5 AM · MANCHester" -> "MANCHESTER" was refused as unchanged (IRON HOUR)
    const unchanged = target && !note.recipe && (note.field === 'words' ? same(note.value, target.words ?? '') : note.field === 'sub' && String(note.value ?? '').trim() === String(target.sub ?? '').trim());
    // A sub is made shorter or clearer, never emptied: THE NINTH KEY's Critic removed the release date as "too small" (2026-10-16).
    const emptied = note.field === 'sub' && !String(note.value ?? '').trim() && String(target?.sub ?? '').trim();
    const r = unchanged ? { ok: false, why: 'the new value is the one it already has' } : emptied ? { ok: false, why: 'a sub is shortened, never emptied' } : applyPatch(film, note);
    record.notes.push({ n, text: note.text, beat: note.beat, field: note.field, value: note.value, status: r.ok ? 'applied' : `not applied: ${r.why}` });
    if (r.ok) {
      film = r.film;
      applied.push({ n, note });
      if (note.beat) changed.add(note.beat); else film.beats.forEach((b) => changed.add(b.name));
      emit({ type: 'fix', n });
    } else out(`note ${n} not applied: ${r.why}`, 'warn');
  }
  say('critic', `${review.score ?? '?'}/10 · ${n} note${n === 1 ? '' : 's'}`);
  if (!applied.length) { writeReview(); agent('critic', 'done', 'Signed off'); return; }
  await syncPhotos(); // before the save: the stills read film.json, and the Critic's new photos never showed (HOUND & HEIRLOOM)
  saveFilm();
  const after = await shootStills(changed);

  // The studio's pairwise rule (cinematic-studio, trailer-critic): "better or not" next to the last version is more
  // reliable than a new score. Round 1 of the eval: the critic's own fixes made films worse (a big hook turned into a
  // small title). A second look compares the sheets and every fix it calls worse is rolled back.
  const keep = await secondLook(beforeSheet, after.contact, applied, record);
  // A broken hand-written shot replaced by its recipe stays replaced: the recipe is the known-good render.
  // A words or sub fix that pushed one of the beat's words out of the picture is undone whatever the second look says
  // (TIDEWATER, 2026-10-16: the shot laid out three words around its lamp; cut to two, LIGHTS sat above the frame).
  const lost = new Set(after.errors.map((e) => /\[shot ([\w-]+)\] (?:off-frame|overlap)/.exec(e)?.[1]).filter(Boolean));
  const pushedOut = (a) => a.note.beat && lost.has(a.note.beat) && ['words', 'sub'].includes(a.note.field);
  for (const a of applied.filter(pushedOut)) out(`note ${a.n}: the new words leave the frame in ${a.note.beat}`, 'warn');
  // A sub on an end card that had none (the date, the call to action) stays: the card lays it out inside the frame, and
  // RIDE THE ALPS' second look (2026-10-17) rolled back "REGISTRATION OPENS MAY 1" as cut off when it was whole
  const added = (a) => a.note.field === 'sub' && before.beats.find((b) => b.name === a.note.beat)?.kind === 'title' && !before.beats.find((b) => b.name === a.note.beat)?.sub;
  const rejected = applied.filter((a) => !a.note.recipe && (pushedOut(a) || (keep && !keep.includes(a.n) && !added(a))));
  if (rejected.length) {
    let f = before;
    for (const a of applied.filter((x) => !rejected.includes(x))) {
      if (!a.note.reshot) { f = applyPatch(f, a.note).film; continue; }
      const now = film.beats.find((b) => b.name === a.note.beat), was = f.beats.find((b) => b.name === a.note.beat);
      if (now && was) Object.assign(was, { kind: now.kind, fallback: now.fallback }); // the re-shot module is on disk
    }
    f.rev = film.rev + 1;
    film = f;
    saveFilm();
    const why = (a) => (pushedOut(a) ? 'its words left the frame or overlap' : 'the second look found the film worse with it');
    for (const a of rejected) out(`note ${a.n} rolled back: ${why(a)}`, 'warn');
    for (const a of rejected) { const x = record.notes.find((r) => r.n === a.n); if (x) x.status = pushedOut(a) ? 'rolled back: its words left the frame or overlap' : 'rolled back after the second look'; }
    await syncPhotos();
    saveFilm();
    await shootStills(new Set(rejected.flatMap((a) => (a.note.beat ? [a.note.beat] : film.beats.map((b) => b.name)))));
  }
  const kept = applied.length - rejected.length;
  for (const x of record.notes) if (x.status === 'applied') x.status = keep ? 'kept after the second look' : 'applied';
  writeReview();
  agent('critic', 'done', `${kept} fix${kept === 1 ? '' : 'es'} kept${rejected.length ? `, ${rejected.length} rolled back` : ''}${keep ? ' after a second look' : ''}`);
}

/** Before and after sheets side by side: which fixes made it better? -> the note numbers to keep, or null (keep all). */
async function secondLook(beforeSheet, afterSheet, applied, record) {
  const img = (f) => ({ type: 'image_url', image_url: { url: `data:image/png;base64,${readFileSync(f).toString('base64')}` } });
  // No verdict (a free model that thinks to its token limit anyway: YOGA's Nemotron, 2026-10-17, and three fixes went
  // through unchecked, one of them on a shot with a black shape over its word) gets one more model.
  for (let tryN = 0, avoid; tryN < 2; tryN++) try {
    const { message, model } = await llm.chat({
      avoid,
      messages: [{ role: 'user', content: [
        { type: 'text', text: `You are the critic of a trailer studio. The first image is the contact sheet BEFORE these fixes, the second is AFTER:\n${applied.map((a) => `${a.n}. ${a.note.text ?? ''} (${a.note.beat ? `${a.note.beat}: ` : ''}${a.note.field} → ${JSON.stringify(a.note.value)})`).join('\n')}\nFor each fix, look at the beat it touched in both sheets. Keep it only if the AFTER is more readable, clearer or stronger for a muted phone viewer. A slams beat shows one word at a time: its frame on the sheet holds only the word on screen at that instant, so for a slams fix check that word against the new list, not the whole list. For a words fix, read the AFTER frame letter by letter: every word of the new value must be on screen, whole; if one is missing or cut, reject it (2026-10-16: a fix to LIGHTS FAIL was kept though LIGHTS had left the frame). Call verdict with the numbers to keep.` },
        img(beforeSheet),
        img(afterSheet),
      ] }],
      tools: [tool('verdict', 'The fixes to keep', { type: 'object', required: ['keep'], properties: { keep: { type: 'array', items: { type: 'number' } }, why: { type: 'string' } } })],
      toolChoice: { type: 'function', function: { name: 'verdict' } },
      vision: true,
      // 6000, 12000 and then 20000 tokens all ran out while the Critic thought (2026-10-16): no verdict, every fix kept
      // unchecked, and the AURORA rerun kept a fix that pushed a giant sub off the frame. A yes/no per fix needs no thinking.
      think: false,
      maxTokens: 4000,
      temperature: 0.2,
      role: 'critic',
    });
    const v = toolArgs(message, 'verdict');
    if (!Array.isArray(v?.keep)) { avoid = model; if (!tryN) out(`critic: no verdict from ${model}, asking the next model`, 'warn'); continue; }
    if (v.why) say('critic', `Second look: ${String(v.why).slice(0, 160)}`);
    if (v.why) record.secondLook = String(v.why).slice(0, 500);
    return v.keep.map(Number);
  } catch (err) {
    if (err instanceof Stopped) throw err;
    out(`critic: no second look (${err.message.slice(0, 100)}): the fixes stay`, 'dim');
    return null;
  }
  return null;
}

async function render() {
  emit({ type: 'job', status: 'rendering' });
  agent('render', 'working', 'Rendering every frame in Chrome, then ffmpeg');
  const frames = Math.round(film.duration * film.fps);
  let last = 0;
  const scale = env.RENDER_SCALE || '0.6667';
  const once = () => run(['render.mjs', rel(DIR), '--scale', scale, '--sub', '1', '--audio', `${rel(DIR)}/audio/mix.wav`, '--out', `${rel(DIR)}/out/final.mp4`], {
    label: `node render.mjs ${NAME} --scale ${scale} --audio audio/mix.wav`,
    onLine: (l) => {
      const m = /(\d+)\/(\d+) frames/.exec(l);
      if (m) { const f = Number(m[1]); if (f - last >= 12 || f === Number(m[2])) { last = f; emit({ type: 'render', frame: f, of: Number(m[2]) || frames }); } }
      else if (!/^\d+%/.test(l)) out(l.replace(/ -> .*$/, ''), 'dim');
    },
  });
  let r = await once();
  // Chrome can die on start or ffmpeg read an empty pipe (2026-10-16: "Error opening input file -" once, while another
  // render ran on the same machine; the same render then worked): one more try before the trailer is lost.
  if (r.code !== 0 || !existsSync(join(DIR, 'out', 'final.mp4'))) {
    out(`render failed (${(r.stderr || r.stdout).trim().split(/\r?\n/).pop()?.slice(0, 80)}), retrying`, 'warn');
    last = 0;
    r = await once();
  }
  if (r.code !== 0 || !existsSync(join(DIR, 'out', 'final.mp4'))) throw new Error(`render failed: ${(r.stderr || r.stdout).trim().split('\n').slice(-2).join(' ')}`);
  emit({ type: 'fs', op: 'write', path: 'out/final.mp4', bytes: statSync(join(DIR, 'out', 'final.mp4')).size });
  const peak = film.beats.find((b) => b.name === film.peak.beat) ?? film.beats.at(-1);
  const posterT = +(peak.t + Math.min(peak.dur * 0.7, 1.6)).toFixed(2);
  await run(['render.mjs', rel(DIR), '--poster', String(posterT), '--scale', '0.5'], { label: `node render.mjs ${NAME} --poster ${posterT}` });
  agent('render', 'done', `${frames} frames · ${(statSync(join(DIR, 'out', 'final.mp4')).size / 1e6).toFixed(1)} MB`);
}

let ok = false;
try {
  emit({ type: 'job', status: 'shooting' });
  emit({ type: 'fs', op: 'mkdir', path: '.' });
  out(`workspace projects/${NAME} · engine ${ENGINE} · models ${modelsText} · cap ${brief.requestBudget ?? 25} requests, $${Number(brief.maxUsd ?? env.MAX_USD ?? 1).toFixed(2)}`, 'dim');
  await director();
  await sound();
  const first = await shootStills();
  out(`${film.beats.length} stills from the recipes`, 'ok');
  await builder();
  await critic(first.contact); // the same path: every stills render refreshes it
  if (env.SKIP_RENDER === '1') { // pipeline/eval.mjs: the stills are what it judges
    console.log(`CUTROOM_END ok ${llm.total.requests} requests ${llm.total.tokens} tokens (no render)`);
    clearInterval(beat);
    feed.close();
    process.exit(0);
  }
  await render();
  const posterRel = existsSync(join(DIR, 'out', 'poster.png')) ? 'out/poster.png' : stillIds[film.beats.at(-1).name] ? `out/cut/${stillIds[film.beats.at(-1).name].id}.png` : null;
  // Cloudinary when the app has it (the link outlives this process and the sandbox), else this feed's own URLs.
  const video = (await publish('out/final.mp4', 'video', 'final')) ?? fileUrl('out/final.mp4');
  const poster = (posterRel && (await publish(posterRel, 'image', 'poster'))) ?? (posterRel ? fileUrl(posterRel) : '');
  costNow();
  emit({ type: 'done', video, poster, post: `${film.title}. ${film.statement} Rendered from code by an agent crew${env.CREW_WHERE === 'local' ? '' : ' in a CreateOS sandbox'}.` });
  await report('done', { ok: true, video, poster });
  ok = true;
} catch (err) {
  const msg = err instanceof Stopped ? 'stopped' : err.message;
  out(`pipeline: ${msg}`, 'warn');
  if (!(err instanceof Stopped)) await report('done', { ok: false, error: msg });
} finally {
  clearInterval(beat);
  costNow();
  console.log(`CUTROOM_END ${ok ? 'ok' : 'failed'} ${llm.total.requests} requests ${llm.total.tokens} tokens $${llm.total.usd.toFixed(4)}`);
  const linger = stopped ? 0 : Number(env.LINGER_S ?? 1800); // keep serving the video and the stills for a while
  setTimeout(() => { feed.close(); process.exit(ok ? 0 : 1); }, linger * 1000);
}
