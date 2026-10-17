#!/usr/bin/env node
// record-run.mjs — turns a finished real run of the crew into the app's recorded run: the replay at /jobs/demo, the
// landing's hero and PIPELINE=simulate. Copies the run's stills (as JPEG), frames sampled from its MP4 (the monitor
// during the render), the video and the poster into web/public/demo/run/, and writes its events, with every URL
// rewritten to those files, to web/src/lib/recorded-run.json.
//
//   node tools/record-run.mjs ../cinematic-studio/projects/cutroom-<id> [--where local|sandbox]
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(process.argv[2] ?? '');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
if (!existsSync(join(SRC, 'events.jsonl')) || !existsSync(join(SRC, 'out', 'final.mp4'))) {
  console.error('usage: node tools/record-run.mjs <finished project folder with events.jsonl and out/final.mp4>');
  process.exit(1);
}
const OUT = join(REPO, 'web', 'public', 'demo', 'run');
const URL_ = '/demo/run';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const ffmpeg = (args) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}: ${r.stderr}`);
};
const jpeg = (from, to, width = 960) => ffmpeg(['-i', from, '-vf', `scale=${width}:-2`, '-q:v', '4', to]);

const film = JSON.parse(readFileSync(join(SRC, 'film.json'), 'utf8'));
const events = readFileSync(join(SRC, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

// Stills: every one the studio showed, as JPEG.
for (const e of events.filter((x) => x.type === 'still')) {
  const file = join(SRC, 'out', 'cut', `${e.id}.png`);
  if (!existsSync(file)) continue;
  jpeg(file, join(OUT, `${e.id}.jpg`));
  e.src = `${URL_}/${e.id}.jpg`;
}
// The film itself, its poster, and frames along it for the monitor while the replay "renders".
copyFileSync(join(SRC, 'out', 'final.mp4'), join(OUT, 'final.mp4'));
const poster = existsSync(join(SRC, 'out', 'poster.png')) ? join(SRC, 'out', 'poster.png') : null;
if (poster) jpeg(poster, join(OUT, 'poster.jpg'), 1280);
const frames = [];
for (let t = 0.5; t < film.duration; t += 0.75) {
  const name = `f-${t.toFixed(2)}.jpg`;
  ffmpeg(['-ss', String(t), '-i', join(SRC, 'out', 'final.mp4'), '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '4', join(OUT, name)]);
  frames.push({ t: +t.toFixed(2), src: `${URL_}/${name}` });
}
for (const e of events.filter((x) => x.type === 'done')) {
  if (arg('where', 'local') === 'local') e.post = e.post.replace(' in a CreateOS sandbox', ''); // never claim a sandbox it did not use
  e.video = `${URL_}/final.mp4`;
  e.poster = poster ? `${URL_}/poster.jpg` : frames.at(-1).src;
}
// The crew's files (pipeline/lib/crew.mjs): a run from before 2026-10-16 has none, so they are written from what the
// run left (film.json, shots/, sound.json, the critic's notes on the feed), without the words only the agents wrote then.
if (!events.some((e) => e.type === 'crew')) {
  const { directorMd, builderMd, criticMd, soundMd } = await import('../pipeline/lib/crew.mjs');
  const at = events.find((e) => e.type === 'done')?.at ?? events.at(-1).at;
  const custom = film.beats.filter((b) => b.kind === 'custom' && existsSync(join(SRC, 'shots', `${b.name}.js`)));
  const notes = events.filter((e) => e.type === 'note');
  const files = {
    director: directorMd(film),
    sound: existsSync(join(SRC, 'sound.json')) ? soundMd(film, JSON.parse(readFileSync(join(SRC, 'sound.json'), 'utf8'))) : null,
    builder: builderMd(custom.map((b) => ({ name: b.name, kind: b.fallback ?? 'card', code: readFileSync(join(SRC, 'shots', `${b.name}.js`), 'utf8'), attempts: 1, errors: [], kept: true }))),
    critic: criticMd({
      score: Number.parseFloat(notes.find((n) => n.score)?.score) || null,
      notes: notes.map((n) => ({ n: n.n, text: n.text, field: 'note', value: '', status: events.some((e) => e.type === 'fix' && e.n === n.n) ? 'applied' : 'not applied' })),
    }),
  };
  const crew = Object.entries(files).filter(([, md]) => md).map(([agent, md]) => ({ at: at - 0.01, type: 'crew', agent, path: `crew/${agent.toUpperCase()}.md`, md }));
  events.splice(events.findIndex((e) => e.type === 'done'), 0, ...crew);
}
// Feed URLs and local paths do not belong in a replay.
const keep = events.filter((e) => e.type !== 'out' || !/localhost|[A-Z]:\\/.test(e.text));
for (const e of keep) if (e.type === 'out' || e.type === 'cmd') e.text = e.text.replace(/\\(?=\S)/g, '/'); // as the sandbox shows them

const prompt = film.prompt || events.find((e) => e.type === 'plan')?.logline || film.title;
writeFileSync(
  join(REPO, 'web', 'src', 'lib', 'recorded-run.json'),
  JSON.stringify({
    source: basename(SRC),
    where: arg('where', 'local'),
    recordedAt: new Date().toISOString(),
    job: { prompt, duration: Math.round(film.duration) },
    beats: film.beats.map(({ name, t, dur, words }) => ({ name, t, dur, words })),
    frames,
    events: keep,
  }),
);
console.log(`${keep.length} events, ${frames.length} frames, ${events.filter((e) => e.type === 'still').length} stills from ${basename(SRC)} -> web/public/demo/run/ + web/src/lib/recorded-run.json`);
