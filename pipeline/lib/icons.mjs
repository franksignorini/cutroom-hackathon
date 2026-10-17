// Icons for the film: the Director names the concrete things in it (a telescope, a meteor), the studio fetches one
// vector icon for each from Iconify (api.iconify.design: free, no key) into icons/, and the film page draws them
// tinted in the film's colours. Hand-drawn pictures were the trailers' weak spot (2026-10-16: a 100 px palm, vague
// rectangles for a laundromat); a clean silhouette of the subject gives every film an image.
// Only sets whose license needs no on-screen credit: Apache-2.0, MIT, ISC.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ICON_SETS = { mdi: 'Apache-2.0', ph: 'MIT', 'material-symbols': 'Apache-2.0', tabler: 'MIT', lucide: 'ISC' };
const API = 'https://api.iconify.design';
const STYLE_WORDS = new Set(['fill', 'filled', 'rounded', 'sharp', 'variant', 'solid', 'outline', 'alt', '2', '3']);

/** The best icon id among search hits: a filled silhouette reads at any size, an outline or an "-off" variant does not.
 *  `skip`: ids that are not pictures of the thing (brand logos, letters). */
export function pickIcon(hits, word, skip = new Set()) {
  const slug = word.toLowerCase().replace(/\s+/g, '-');
  const score = (id) => {
    const [set, name] = id.split(':');
    if (!ICON_SETS[set] || /-(off|outline|thin|light|bold|duotone|slash|x|plus|minus|check|alert|remove|add|edit)\b/.test(name)) return -1;
    if (skip.has(id) || /^brand-|-logo(-|$)/.test(name)) return -1; // tabler:brand-ember, ph:github-logo
    if (/(^|-)(lamp|toy|cartoon|emoticon)(-|$)/.test(name) && !slug.split('-').some((w) => /lamp|toy|cartoon|emoticon/.test(w))) return -1; // "lava" found mdi:lava-lamp (FIRE MOUNTAIN)
    // every word of the thing, as a whole word of the name: "ember" then found ph:member-of
    const parts = name.split('-');
    if (!slug.split('-').every((w) => parts.some((p) => p === w || p === `${w}s` || `${p}s` === w))) return -1;
    // at most one word more than the thing (style words aside): "lantern" fetched mdi:jack-o-lantern (2026-10-16)
    if (parts.filter((p) => !STYLE_WORDS.has(p)).length - slug.split('-').length > 1) return -1;
    let s = 0;
    if (name === slug || name === `${slug}-fill` || name === `${slug}-filled` || name === `${slug}-rounded`) s += 10;
    else if (name.startsWith(slug)) s += 5;
    if (/-(fill|filled)$/.test(name) || set === 'mdi') s += 3; // filled shapes
    if (set === 'lucide' || set === 'tabler' && !/filled$/.test(name)) s -= 2; // outline sets
    return s;
  };
  return hits.map((id) => [score(id), id]).filter(([s]) => s >= 0).sort((a, b) => b[0] - a[0])[0]?.[1] ?? null;
}

// Material Design Icons files its logos under categories: "ember" found mdi:ember, the Ember.js logo, a stylised "e"
// that SALT & EMBER's drop showed as its glowing emblem (2026-10-16). Those categories are skipped.
const NOT_PICTURES = /brand|logo|alpha|numeric|developer|social/i;
async function logoIds(timeoutMs) {
  try {
    const r = await fetch(`${API}/collection?prefix=mdi`, { signal: AbortSignal.timeout(timeoutMs) });
    const cats = r.ok ? (await r.json()).categories ?? {} : {};
    return new Set(Object.entries(cats).filter(([k]) => NOT_PICTURES.test(k)).flatMap(([, names]) => names.map((n) => `mdi:${n}`)));
  } catch { return new Set(); }
}

// 3D objects: Microsoft's Fluent Emoji have a lit 3D render (MIT, no credit on screen) for ~1,600 things. The flat icons
// read as clip-art next to a film; a rendered fish or locomotive gives a shot a real object. The index (name -> path)
// ships with the pipeline (tools/fluent3d-index.mjs builds it); only the PNGs a film uses are fetched.
const FLUENT = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fluent3d.json'), 'utf8'));
// raw GitHub first: jsDelivr refuses files it has not cached from this repo (over its 50 MB package limit: 403)
const NOT_THINGS = new Set(['white flower', 'japanese symbol for beginner', 'name badge', 'japanese post office']);
const SYMBOL_PARTS = new Set(['button', 'sign', 'symbol', 'mark', 'keycap', 'flag', 'japanese', 'squared', 'circled', 'arrow', 'zodiac']);
const FLUENT_URLS = (p) => [`https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/${p}`, `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/${p}`].map(encodeURI);

/** The Fluent 3D object for a word: the same name, else the shortest name holding every word of it as a whole word
 *  ("fish" -> Fish, "pepper" -> Bell pepper, never "member" for "ember"). null when none. */
// Everyday words whose emoji has another name (and "flower" found "Wilted flower" for a bee film, 2026-10-16).
const ALIASES = { flower: 'blossom', flowers: 'blossom', bee: 'honeybee', bees: 'honeybee', phone: 'mobile phone', smartphone: 'mobile phone',
  car: 'automobile', 'electric car': 'automobile', 'sports car': 'racing car', plane: 'airplane', coffee: 'hot beverage', 'coffee cup': 'hot beverage', cup: 'hot beverage', mug: 'hot beverage', espresso: 'hot beverage', latte: 'hot beverage', cappuccino: 'hot beverage', tea: 'teacup without handle',
  ramen: 'steaming bowl', noodles: 'steaming bowl', bread: 'bread', sourdough: 'bread', loaf: 'bread', boat: 'sailboat',
  sneaker: 'running shoe', sneakers: 'running shoe', shoe: 'running shoe', earth: 'globe showing europe-africa',
  planet: 'ringed planet', star: 'glowing star', storm: 'cloud with lightning and rain', rain: 'cloud with rain', camera: 'camera',
  book: 'closed book', books: 'books', bottle: null, perfume: null, glove: 'boxing glove', gloves: 'boxing glove', ring: null, 'plant pot': 'potted plant', plant: 'potted plant', /* a boxing film got knitted winter gloves and a diamond ring (LAST ROUND, 2026-10-17) */ /* "bottle" found "Baby bottle" for a perfume (NOCTURNE, 2026-10-17) */ music: 'musical notes', guitar: 'guitar', rocket: 'rocket', lighthouse: null };
const SAD = new Set(['wilted', 'broken', 'crying', 'pouting', 'angry', 'skull', 'loudly', 'face']);

export function pick3d(word, index = FLUENT) {
  let w = word.toLowerCase().trim().replace(/\s+/g, ' ');
  if (w in ALIASES) { if (ALIASES[w] === null) return null; if (index[ALIASES[w]]) return index[ALIASES[w]]; }
  if (index[w]) return index[w];
  const toks = w.split(' ');
  // every word of the thing, and at most one more: "paper" found "Roll of paper", a toilet roll, as LEDGERLY's emblem;
  // "lantern" found "Jack-o-lantern" (2026-10-16). "pepper" -> "Hot pepper" still passes.
  const fits = Object.keys(index).filter((name) => {
    const parts = name.split(/[\s-]+/);
    // symbols, not things: "flower" found "White flower", a Japanese "well done" stamp with text in it (2026-10-16)
    if (NOT_THINGS.has(name) || parts.some((p) => SYMBOL_PARTS.has(p) || SAD.has(p))) return false;
    return parts.length - toks.length <= 1 && toks.every((t) => parts.some((p) => p === t || p === `${t}s` || `${p}s` === t));
  });
  const best = fits.sort((a, b) => a.length - b.length)[0];
  if (best) return index[best];
  // a thing named with a kind before its noun: "espresso cup" found nothing (LUNA ROSSA, 2026-10-17); its noun has an alias
  const head = toks.at(-1);
  return toks.length > 1 && head in ALIASES && ALIASES[head] ? index[ALIASES[head]] ?? null : null;
}

/** words -> [{ word, id, file, license }] written to <dir>/icons/. A word with no icon (or no network) is skipped.
 *  An entry also gets `obj`: the 3D object's PNG, when Fluent has one for the word. */
export async function fetchIcons(words, dir, { onCmd = () => {}, writeFile, timeoutMs = 8000 } = {}) {
  const out = [];
  const skip = words.length ? await logoIds(timeoutMs) : new Set();
  for (const word of words) {
    try {
      const q = encodeURIComponent(word);
      onCmd(`GET api.iconify.design/search?query=${q}`);
      const r = await fetch(`${API}/search?query=${q}&limit=40&prefixes=${Object.keys(ICON_SETS).join(',')}`, { signal: AbortSignal.timeout(timeoutMs) });
      const slug = word.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const entry = { word };
      const id = r.ok ? pickIcon((await r.json()).icons ?? [], word, skip) : null;
      if (id) {
        const [set, name] = id.split(':');
        const svg = await (await fetch(`${API}/${set}/${name}.svg?height=512`, { signal: AbortSignal.timeout(timeoutMs) })).text();
        if (svg.startsWith('<svg')) { entry.file = `icons/${slug}.svg`; writeFile(entry.file, svg); Object.assign(entry, { id, license: ICON_SETS[set] }); }
      }
      const path = pick3d(word);
      for (const url of path ? FLUENT_URLS(path) : []) {
        onCmd(`GET ${url.split('/').slice(2, 3)}/…/${decodeURI(url.split('/').pop())}`);
        const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) }).catch(() => null);
        const png = res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
        if (!png || png.readUInt32BE(0) !== 0x89504e47) continue; // a PNG, not an error page
        entry.obj = `icons/${slug}.3d.png`;
        entry.objName = path.split('/')[0];
        writeFile(entry.obj, png);
        break;
      }
      if (entry.file || entry.obj) out.push(entry);
    } catch {}
  }
  return out;
}

// Words a brief uses that are emoji names but rarely its subject.
const NOT_SUBJECTS = new Set(['one', 'top', 'new', 'up', 'on', 'free', 'next', 'end', 'back', 'soon', 'cool', 'world', 'night', 'day', 'hundred', 'film', 'trailer', 'fire', 'wireless', 'cooking', 'baby']);
/** Things the brief itself names that the studio has as 3D objects: "a dive watch" -> watch. TIDE (2026-10-17), a film
 *  for a dive watch, named an anchor and a compass and never showed the watch. A hint for the Director, not a rule: a
 *  name can also be a word ("Salt Lungs", "VORTEX CUP"). Two-word names first, only exact names or aliases. */
export function briefThings(prompt, index = FLUENT, max = 3) {
  const w = String(prompt ?? '').toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter(Boolean);
  const has = (t) => (t in ALIASES ? !!ALIASES[t] && !!index[ALIASES[t]] : !!index[t]);
  const out = [];
  for (let i = 0; i < w.length && out.length < max; i++) {
    const two = `${w[i]} ${w[i + 1] ?? ''}`.trim();
    if (w[i + 1] && has(two)) { out.push(two); i++; continue; }
    if (w[i].length >= 3 && !NOT_SUBJECTS.has(w[i]) && has(w[i]) && !out.includes(w[i])) out.push(w[i]);
  }
  return out;
}
