// Checks on a Builder shot: static ones on its code before it is rendered, and on the frame it painted.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/** How much is drawn in a frame: the mean difference between neighbouring pixels (0-255) on a 192x108 grey copy.
 *  Mean brightness only caught black frames; a blank light frame passed (SPROUT, 2026-10-16: a 2.4 s beat of empty
 *  paper). Words and shapes have edges, an empty ground or a soft gradient has almost none. null without ffmpeg. */
export function frameDetail(file) {
  if (!existsSync(file)) return null;
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', 'format=gray,scale=192:108', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 20 });
  const px = r.stdout;
  if (r.status !== 0 || !px || px.length < 192 * 108) return null;
  let sum = 0, n = 0;
  for (let y = 0; y < 107; y++) for (let x = 0; x < 191; x++) {
    const i = y * 192 + x;
    sum += Math.abs(px[i] - px[i + 1]) + Math.abs(px[i] - px[i + 192]);
    n += 2;
  }
  return sum / n;
}

/** The beat's words typed into the code as text instead of read from k.beat: a Critic fix to them would never show
 *  (2026-10-16, the Perseids: "the fix was not applied"). Only string literals are read, so `k.beat.words`, a
 *  destructuring or a comment quoting the words all pass; words of 4+ letters, so "THE" in a font name cannot trip it.
 *  (The first version was a regex whose \b turned into a backspace in an edit and rejected every shot of a Premium
 *  run, 2026-10-16: this one lives in its own file, with tests.) */
const CANVAS_WORDS = new Set(['left', 'right', 'center', 'centre', 'start', 'end', 'top', 'bottom', 'middle', 'alphabetic',
  'hanging', 'ideographic', 'bold', 'normal', 'italic', 'light', 'round', 'butt', 'square', 'miter', 'bevel', 'lighter',
  'screen', 'multiply', 'overlay', 'darken', 'lighten', 'difference', 'source-over', 'source-in', 'destination-out',
  'snappy', 'slam', 'soft', 'linear', 'evenodd', 'nonzero']);

export function typedWords(src, beat) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1 ');
  // Canvas keywords are not words on screen: LIGHTHOUSE 47's "NO ONE LEFT TO WATCH" shot was rejected twice, and its
  // re-shoot once, for g.textAlign = 'left' (2026-10-16).
  const lits = [...code.matchAll(/`([^`]*)`|"((?:\\.|[^"\\\n])*)"|'((?:\\.|[^'\\\n])*)'/g)]
    .map((m) => (m[1] ?? m[2] ?? m[3] ?? ''))
    .filter((s) => !CANVAS_WORDS.has(s.trim().toLowerCase()))
    .map((s) => s.toUpperCase());
  const words = [...(beat.words ?? []), beat.sub ?? ''].flatMap((w) => String(w).split(/\s+/))
    .map((w) => w.toUpperCase().replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length >= 4);
  const has = (lit, w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w}($|[^\\p{L}\\p{N}])`, 'u').test(lit);
  return [...new Set(words.filter((w) => lits.some((lit) => has(lit, w))))];
}
