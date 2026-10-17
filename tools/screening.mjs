// Builds the landing's Screening Room from finished crew runs: a web copy of each film, its poster, one still per beat
// and the making-of (prompt, crew, time, cost, the Critic's notes and what happened to them).
//   node tools/screening.mjs <run-id>...      (run ids as in cinematic-studio/projects/cutroom-<id>)
// Writes web/public/screening/<id>/ and web/src/lib/screening.json (the list, in the order given).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = process.env.ENGINE_DIR ?? join(ROOT, '..', 'cinematic-studio', 'projects');
const PUB = join(ROOT, 'web', 'public', 'screening');
const ff = (...a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);

const header = (md) => md.match(/^> \*\*\w+\*\* · `([^`]+)`/m)?.[1] ?? null;
function criticNotes(md) {
  const notes = [];
  for (const block of md.split(/^## /m).find((s) => s.startsWith('Notes'))?.split(/^\d+\. /m).slice(1) ?? []) {
    const [text, ...rest] = block.trim().split('\n');
    const status = rest.join(' ').match(/\*\*([^*]+)\*\*/)?.[1] ?? 'applied';
    notes.push({ text: text.trim(), status });
  }
  return notes;
}

const films = [];
for (const id of process.argv.slice(2)) {
  const D = join(ENGINE, `cutroom-${id}`);
  if (!existsSync(join(D, 'out', 'final.mp4'))) { console.error(`skip ${id}: no final.mp4`); continue; }
  const film = JSON.parse(readFileSync(join(D, 'film.json'), 'utf8'));
  const ev = readFileSync(join(D, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const cost = ev.filter((e) => e.type === 'cost').pop() ?? {};
  const done = ev.find((e) => e.type === 'done');
  const crew = (n) => { const f = join(D, 'crew', `${n}.md`); return existsSync(f) ? readFileSync(f, 'utf8') : ''; };
  const critic = crew('CRITIC');
  const out = join(PUB, id);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  // 720p, small enough to autoplay on hover: ~1-2 MB for 15 s
  ff('-i', join(D, 'out', 'final.mp4'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p',
    '-vf', 'scale=1280:-2', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', join(out, 'film.mp4'));
  // the poster is the title card, settled (the run's poster.png is sometimes a mid-film frame: ENDGAME's was a lone "A"),
  // 60% into the title beat: the films end by dissolving back into the hook (a loop seam), so the last frame mixed the
  // two (ISLAY 25's poster read "25 YEARS 900" over the name)
  const tb = film.beats.at(-1);
  ff('-ss', String(+(tb.t + tb.dur * 0.6).toFixed(2)), '-i', join(D, 'out', 'final.mp4'), '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '4', join(out, 'poster.jpg'));
  // the last take of each beat, in film order; "takes" counts how many the crew shot
  const cuts = existsSync(join(D, 'out', 'cut')) ? readdirSync(join(D, 'out', 'cut')) : [];
  const beats = film.beats.map((b) => {
    const takes = cuts.filter((f) => f.startsWith(`${b.name}-r`)).sort((a, z) => parseInt(a.split('-r')[1]) - parseInt(z.split('-r')[1]));
    const still = takes.at(-1);
    if (still) ff('-i', join(D, 'out', 'cut', still), '-vf', 'scale=480:-2', '-q:v', '5', join(out, `${b.name}.jpg`));
    return { name: b.name, kind: b.kind === 'custom' ? 'hand-written' : b.kind, words: [b.words ?? []].flat().join(' '), takes: takes.length, still: still ? `/screening/${id}/${b.name}.jpg` : null };
  });
  const score = critic.match(/· ([\d.]+)\/10/)?.[1];
  films.push({
    id,
    title: film.title,
    prompt: film.prompt,
    tier: /premium/i.test(film.tier ?? '') || cost.usd > 0 ? 'premium' : 'free',
    duration: film.duration,
    accent: film.look?.accent ?? '#ff4d1a',
    ground: film.look?.ground ?? '#000000',
    seconds: Math.round(done?.at ?? 0),
    usd: Number(cost.usd ?? 0),
    requests: cost.requests ?? null,
    tokens: cost.tokens ?? null,
    models: { director: header(crew('DIRECTOR')), builder: header(crew('BUILDER')), critic: header(critic) },
    score: score ? Number(score) : null,
    summary: critic.match(/^> (?!\*\*)(.+)$/m)?.[1]?.trim() ?? null,
    notes: criticNotes(critic),
    beats,
    video: `/screening/${id}/film.mp4`,
    poster: `/screening/${id}/poster.jpg`,
  });
  console.log(`${id} · ${film.title} · ${films.at(-1).seconds} s · $${films.at(-1).usd} · ${score ?? '-'}/10`);
}
writeFileSync(join(ROOT, 'web', 'src', 'lib', 'screening.json'), JSON.stringify(films, null, 1) + '\n');
console.log(`${films.length} films → web/public/screening, web/src/lib/screening.json`);
