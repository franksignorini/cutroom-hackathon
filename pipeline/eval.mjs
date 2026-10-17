#!/usr/bin/env node
// eval.mjs — the crew's quality test set: the same prompts every round, so a change to a prompt, a recipe or the
// critic can be judged before/after on the same evidence. Each prompt runs the whole crew up to the Critic's fixes
// (no MP4: SKIP_RENDER=1), then the report collects the plan, the Critic's score and notes, time, requests and the
// final contact sheet of every run.
//
//   node --env-file=.env --env-file=web/.env pipeline/eval.mjs --round baseline [--only horror,launch] [--models ...]
// Output: eval/<round>/report.md + eval/<round>/<case>.png (the settled contact sheets). Models default to the
// Groq + Gemini fallbacks, which keeps OpenRouter's 50 daily requests for the app.
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const ENGINE = resolve(process.env.ENGINE_DIR || join(REPO, '..', 'cinematic-studio'));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };

export const CASES = {
  horror: 'A launch teaser for an indie horror game: an abandoned ski resort, snow, something in the lift cabins. Out on Halloween.',
  launch: 'Launch film for Ledgerly, an app that turns receipts into tax-ready reports in one tap. For freelancers. Free on iOS and Android.',
  event: 'A night-market food festival in Naples: street food, neon signs, live music. Saturday 8pm, Via dei Tribunali.',
  kids: "A playful launch teaser for a kids' coding app called Pixel Pals: build your own robot friend, learn to code, ages 7 to 12. Available now.",
  brand: 'A brand film for a family bakery in Bologna that has baked bread by hand every night since 1952. Three generations, one oven.',
  sport: 'A hype teaser for the city marathon in Milan: 42 km, 10,000 runners, one finish line. Sunday April 6, start at 8:30.',
};

const round = arg('round', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'));
const only = arg('only')?.split(',');
const models = (arg('models') || 'gemini:gemini-3.5-flash,gemini:gemini-2.5-flash,groq:openai/gpt-oss-120b,gemini:gemini-3.8-flash,groq:qwen/qwen3.8-27b').split(',');
const OUT = join(REPO, 'eval', round);
mkdirSync(OUT, { recursive: true });

function runCase(name, prompt) {
  const id = `eval-${round}-${name}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const dir = join(ENGINE, 'projects', `cutroom-${id}`);
  rmSync(dir, { recursive: true, force: true });
  const brief = join(OUT, `${name}.brief.json`);
  writeFileSync(brief, JSON.stringify({ id, prompt, tier: 'free', duration: 10, models, requestBudget: 12 }));
  const t0 = Date.now();
  return new Promise((ok) => {
    const c = spawn(process.execPath, [join(HERE, 'pipeline.mjs'), '--brief', brief], { env: { ...process.env, SKIP_RENDER: '1', LINGER_S: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    c.stdout.on('data', (d) => { tail = (tail + d).slice(-400); });
    c.stderr.on('data', (d) => { tail = (tail + d).slice(-400); });
    const kill = setTimeout(() => c.kill(), 10 * 60_000);
    c.on('close', (code) => { clearTimeout(kill); ok({ id, dir, code, secs: (Date.now() - t0) / 1000, tail }); });
  });
}

function summarize(name, prompt, r) {
  const events = existsSync(join(r.dir, 'events.jsonl')) ? readFileSync(join(r.dir, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  const film = existsSync(join(r.dir, 'film.json')) ? JSON.parse(readFileSync(join(r.dir, 'film.json'), 'utf8')) : null;
  const notes = events.filter((e) => e.type === 'note');
  const score = notes.find((n) => n.score)?.score ?? '—';
  const requests = events.filter((e) => e.type === 'out' && / · request \d+/.test(e.text)).length;
  const models = [...new Set(events.filter((e) => e.type === 'out' && / · request \d+/.test(e.text)).map((e) => e.text.split(' · ')[0]))];
  const warns = events.filter((e) => e.type === 'out' && e.tone === 'warn').map((e) => e.text);
  const builder = events.filter((e) => e.type === 'agent' && e.agent === 'builder' && e.state === 'done').pop()?.say ?? '';
  const sheet = join(r.dir, 'out', 'stills-adhoc', 'contact.png');
  if (existsSync(sheet)) copyFileSync(sheet, join(OUT, `${name}.png`));
  const lines = [
    `## ${name} — critic ${score} · ${r.secs.toFixed(0)} s · ${requests} requests${r.code ? ` · **exit ${r.code}**` : ''}`,
    `> ${prompt}`,
    '',
    film ? `**${film.title}** — ${film.statement}` : '_no plan_',
    film ? `type ${film.kind} · peak ${film.family} at ${film.peak?.t}s (${film.peak?.beat}) · device ${film.device} · ${film.music.palette} ${film.music.mood} ${film.music.key}m ${film.bpm} BPM · ${film.type.roles.map((x) => x.face).join(' / ')} · ${film.look.ground} ${film.look.text} ${film.look.accent} ${film.look.grade}` : '',
    film ? film.beats.map((b) => `- \`${b.name}\` ${b.kind}${b.fallback ? ` (custom over ${b.fallback})` : ''} ${b.t}s+${b.dur}s: ${b.words.join(' ')}${b.sub ? ` / ${b.sub}` : ''}${b.air ? ` · ${b.air}` : ''}`).join('\n') : '',
    `- builder: ${builder}`,
    ...notes.map((n) => `- critic note ${n.n}: ${n.text}`),
    ...(warns.length ? [`- warnings: ${warns.slice(0, 4).join(' | ')}`] : []),
    `- models: ${models.join(', ')}`,
    existsSync(sheet) ? `\n![${name}](${name}.png)` : `\n_no contact sheet_ ${r.tail.replace(/\s+/g, ' ').slice(-200)}`,
    '',
  ];
  return { md: lines.join('\n'), score: Number(String(score).split('/')[0]) || null };
}

const md = [`# Eval ${round}`, '', `models: ${models.join(', ')}`, ''];
const scores = [];
for (const [name, prompt] of Object.entries(CASES)) {
  if (only && !only.includes(name)) continue;
  process.stdout.write(`${name}… `);
  const r = await runCase(name, prompt);
  const s = summarize(name, prompt, r);
  if (s.score != null) scores.push(s.score);
  md.push(s.md);
  console.log(`${r.code ? 'FAILED' : 'ok'} in ${r.secs.toFixed(0)} s, critic ${s.score ?? '—'}`);
  writeFileSync(join(OUT, 'report.md'), md.join('\n'));
}
const mean = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';
md.splice(3, 0, `critic mean **${mean}** over ${scores.length} runs`, '');
writeFileSync(join(OUT, 'report.md'), md.join('\n'));
console.log(`critic mean ${mean} -> ${join('eval', round, 'report.md')}`);
