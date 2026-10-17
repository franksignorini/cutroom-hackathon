// The plan: what the Director writes (a small, checkable JSON), how it becomes film.json for the film page
// (pipeline/film/index.html), and the score derived from it (sound.json for the studio's tools/sound.mjs).
// Free models make mistakes, so normalize() repairs what it can and only reports what it cannot guess.

export const KINDS = ['statement', 'world', 'slams', 'card', 'rush', 'hud', 'reveal', 'drop', 'title', 'custom'];
export const AIRS = ['none', 'beam', 'dust', 'fog', 'smoke', 'bokeh', 'rain', 'snow', 'embers', 'sparks', 'light'];
export const GRADES = ['neutral', 'teal-orange', 'warm-film', 'cold-steel', 'bleach', 'noir', 'matte'];
export const MOODS = ['dark', 'epic', 'tense', 'hopeful', 'playful', 'melancholic'];
export const KEYS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
// From the studio (cinematic-studio/docs/TRAILER_CRAFT.md): the request type sets the shape, the peak family sets
// where the chill comes from, the palette is one track from what is on screen.
export const TYPES = ['teaser', 'launch', 'game', 'event', 'brand', 'story', 'explainer'];
export const FAMILIES = ['awe', 'moved', 'triumph', 'dread', 'insight'];
export const PALETTES = ['orchestral', 'hybrid', 'electronic'];
// Signature devices this pipeline can build (docs/SIGNATURES.md, the canvas ones): one idea through the whole film.
export const DEVICES = {
  'light-narrator': 'one moving light reveals everything, darkness hides the rest',
  'type-choreography': 'words are the actors: they push, collide, carry each other',
  'weather-as-emotion': 'the air changes with the story (rain, then snow, then clear)',
  'inside-a-device': 'the film plays out on a screen or HUD: brackets, trackers, decoding text',
  'silhouette-theatre': 'everything backlit, shapes and type as silhouettes over a glow',
  'subject-rhythm': "a pattern native to the subject (a heartbeat, a lighthouse's flash, a machine cycle) times every cut",
  'scale-shift': 'open on an extreme detail, reveal the whole only at the title',
};

// Google Fonts faces with the weight they really have (a weight a face lacks makes lib/type.js load it lighter).
export const DISPLAY_FONTS = {
  'Bebas Neue': '400', Oswald: '700', 'Big Shoulders Display': '800', 'Archivo Black': '400', 'Playfair Display': '800',
  Cinzel: '700', 'Abril Fatface': '400', Bungee: '400', 'Rubik Mono One': '400', Unbounded: '800', 'DM Serif Display': '400',
  Syne: '800', 'Space Grotesk': '700', Teko: '600', 'Black Ops One': '400', Righteous: '400', Creepster: '400',
  Fredoka: '700', Orbitron: '800', 'Cormorant Garamond': '700', Monoton: '400', 'Russo One': '400',
};
export const TEXT_FONTS = {
  Inter: '500', 'Courier Prime': '400', 'IBM Plex Mono': '500', 'Space Mono': '400', Manrope: '600',
  'Cormorant Garamond': '500', 'DM Sans': '500', 'Work Sans': '500', Lora: '500',
};

// The JSON schema of the Director's write_plan tool.
export const PLAN_SCHEMA = {
  type: 'object',
  required: ['title', 'logline', 'look', 'fonts', 'bpm', 'music', 'beats'],
  properties: {
    title: { type: 'string', description: 'The film title as it appears on screen, 1-3 words' },
    logline: { type: 'string', description: 'The film in one sentence' },
    look: {
      type: 'object',
      required: ['ground', 'text', 'accent', 'grade'],
      properties: {
        ground: { type: 'string', description: 'Background colour, hex: dark, light (paper) or a saturated colour, from the subject' },
        text: { type: 'string', description: 'Main text colour, hex, high contrast with ground' },
        accent: { type: 'string', description: 'One accent colour, hex, used sparingly' },
        grade: { type: 'string', enum: GRADES },
        letterbox: { type: 'boolean' },
        layout: { type: 'string', enum: ['centre', 'left', 'low'], description: 'Where the type sits: centred, flush left (editorial), or low under an open frame' },
      },
    },
    fonts: {
      type: 'object',
      required: ['display', 'text'],
      // names in the description, not an enum: Groq rejects the whole plan when a model writes a font outside the list
      // ("/fonts/text: value", 400, in most free runs of 2026-10-17); normalize() maps any name to the nearest one
      properties: { display: { type: 'string', description: `One of: ${Object.keys(DISPLAY_FONTS).join(', ')}` }, text: { type: 'string', description: `One of: ${Object.keys(TEXT_FONTS).join(', ')}` } },
    },
    type: { type: 'string', enum: TYPES, description: 'What kind of film the request is' },
    family: { type: 'string', enum: FAMILIES, description: 'Where the chill at the peak comes from' },
    device: { type: 'string', enum: Object.keys(DEVICES), description: 'The one signature idea that runs through every beat' },
    bpm: { type: 'number', description: 'Tempo, 70-140' },
    music: {
      type: 'object',
      required: ['mood', 'key'],
      properties: {
        mood: { type: 'string', enum: MOODS },
        key: { type: 'string', enum: KEYS },
        palette: { type: 'string', enum: PALETTES, description: 'orchestral for human, epic or dark stories; hybrid for action and games; electronic for tech and products' },
      },
    },
    beats: {
      type: 'array',
      minItems: 3,
      maxItems: 7,
      items: {
        type: 'object',
        required: ['kind', 'words'],
        properties: {
          kind: { type: 'string', enum: KINDS.filter((k) => k !== 'custom') },
          words: { type: 'array', items: { type: 'string' }, description: 'The words on screen, UPPERCASE, short' },
          sub: { type: 'string', description: 'Optional small line under the words' },
          air: { type: 'string', enum: AIRS },
          image: { type: 'string', description: 'What the viewer sees, one sentence' },
          icon: { type: 'string', description: 'Optional: one of the film\'s `icons` to show big in this beat' },
          photo: { type: 'string', description: 'Optional, at most 2 beats, never the title or the drop: 1-4 English words to search a real stock photo for this beat\'s ground (a place, a landscape, a texture, a thing: "misty alpine road", "opera house stage"); never a face, a logo or text' },
        },
      },
    },
    icons: { type: 'array', maxItems: 4, items: { type: 'string' }, description: 'Up to 4 concrete things in the film, 1-2 English words each (telescope, meteor, coffee cup): the studio fetches a vector icon of each for the picture' },
    treatment: { type: 'string', description: "Your director's note to the crew, first person, 3-5 sentences: the idea, why this device, this look and this peak" },
    peak: { type: 'number', description: 'Index of the beat that is the emotional peak (usually the title)' },
    story: {
      type: 'object',
      description: 'Optional (the Premium Director fills it): the emotional core and the design of the peak',
      properties: {
        core: { type: 'string', description: 'What it wants, what it could lose, what the film is really about' },
        technique: { type: 'array', items: { type: 'string' }, description: 'build-release, silence-drop, swell, one-line, callback, slow-motion, title-hit' },
        line: { type: 'string', description: 'The peak line, 6 words at most' },
        obvious: { type: 'string', description: 'The obvious version this film avoids' },
      },
    },
  },
};

const HEX = /^#[0-9a-f]{6}$/i;
export const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const clampN = (v, a, b, d) => (Number.isFinite(Number(v)) ? Math.min(b, Math.max(a, Number(v))) : d);
const pickKey = (v, list, d) => {
  const s = String(v ?? '').trim().toLowerCase();
  return list.find((k) => k.toLowerCase() === s) ?? d;
};
// The small line: up to 80 characters, cut at a word, never ending on a separator (the hackathon trailer's end card
// once read "SATURDAY OCTOBER 17 ·" after a 60-character cut ate "12:00 PT").
const subline = (v) => {
  // quotes around the whole line are the model's, not the film's: CASE 113's Critic sent "\"ALL EPISODES NOVEMBER 1\"" (2026-10-17)
  let t = String(v ?? '').replace(/\s+/g, ' ').trim().replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, '').trim();
  if (t.length > 80) t = t.slice(0, 81).replace(/\s+\S*$/, '');
  // A line in capitals is all capitals: "5 AM · MANCHester" came from a free Director (IRON HOUR, 2026-10-17). A line in
  // sentence case ("Inside Iceland's newest volcano") stays as written.
  const letters = t.replace(/[^\p{L}]/gu, ''), caps = letters.replace(/[^\p{Lu}]/gu, '').length;
  if (letters.length && caps / letters.length >= 0.5) t = t.toUpperCase();
  return t.replace(/[\s·•|,;:—–-]+$/, '') || undefined;
};
// The end card's line is read in a second: NIGHT MARKET's "300 STALLS • OPEN UNTIL 2AM • FRIDAY & SATURDAY" (47
// characters) shrank to a speck under the name (2026-10-17). Over 34 characters it keeps the parts that fit, in order.
export const endSub = (v) => {
  const t = subline(v);
  if (!t || t.length <= 34) return t;
  const parts = t.split(/\s*[•·|]\s*/).filter(Boolean);
  // the date (or a number) is kept first, then the rest in order; the line reads in the original order
  const dated = (p) => /\d|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC/i.test(p);
  const kept = new Set();
  for (const p of [...parts.filter(dated), ...parts.filter((p) => !dated(p))])
    if ([...parts.filter((q) => kept.has(q) || q === p)].join(' · ').length <= 34) kept.add(p);
  return kept.size ? parts.filter((p) => kept.has(p)).join(' · ') : t;
};
// a decade keeps its small s in capitals: "1940s", not "1940S" (CASE 113, 2026-10-17)
const clean = (w) => String(w ?? '').replace(/\s+/g, ' ').trim().toUpperCase().replace(/\b(\d{4}|'\d{2}|\d{2})S\b/g, '$1s').slice(0, 28);
// Words from a plan or a Critic patch. Both once sent an array as text ('["IT NEVER","REACHES THE ISLAND"]'), and it
// went on screen brackets and all (the Night Ferry, 2026-10-16): parse it; brackets and straight quotes never reach
// the frame. A plain string is split into words.
const unpack = (w) => {
  const s = String(w ?? '').trim();
  if (s.startsWith('[') && s.endsWith(']')) try { const a = JSON.parse(s); if (Array.isArray(a)) return a.map(String); } catch {}
  return [s];
};
const wordList = (v) => {
  const parsed = Array.isArray(v) ? v.flatMap(unpack) : unpack(v);
  const plain = !Array.isArray(v) && parsed.length === 1 && parsed[0] === String(v ?? '').trim();
  return (plain ? parsed[0].split(/\s+/) : parsed).map((w) => clean(w.replace(/[[\]"]/g, ''))).filter(Boolean);
};

// Seconds of screen each kind wants, before fitting the film's length.
// The title is the longest hold (TRAILER_CRAFT.md, Rhythm): its weight is the biggest.
const WEIGHT = { statement: 2.4, world: 2.4, card: 1.9, rush: 1.7, hud: 2.0, reveal: 2.3, drop: 0.6, title: 3.0, custom: 2.4 };
const weightOf = (b) => (b.kind === 'slams' ? 0.6 * Math.max(2, b.words.length) : WEIGHT[b.kind]);

/** Director output -> { film, problems }. `problems` are what it could not repair (the Director gets them back). */
// photos: 'all' is a photo-led film (a luxury brand: HOUND & HEIRLOOM, 2026-10-17): a real photo under every beat but the
// title, the drop included, and no icons or 3D emoji (a cartoon puppy read as a toy next to gold and leather).
export function normalize(raw, { duration = 10, prompt = '', casting = null, photos = false } = {}) {
  const photoLed = photos === 'all';
  const problems = [];
  const p = typeof raw === 'string' ? JSON.parse(raw) : { ...(raw ?? {}) };
  // DeepSeek V4 Pro sometimes sends nested fields as JSON text ("beats": "[{...}]"): the first plan of 3 runs in 4
  // came back with "0 usable beats" (2026-10-16). Parse them instead of asking again.
  // The text is not always clean JSON: AURORA's beats came with one stray "}" after the array (2026-10-16), so the
  // text is cut back to its last closing bracket until it parses.
  const loose = (s) => {
    const close = s.trimStart().startsWith('[') ? ']' : '}';
    for (let end = s.length; end > 0; end = s.lastIndexOf(close, end - 1)) {
      try { return JSON.parse(s.slice(0, end === s.length ? end : end + 1)); } catch {}
    }
    return s;
  };
  for (const k of ['beats', 'look', 'fonts', 'music', 'story']) {
    if (typeof p[k] === 'string' && /^\s*[[{]/.test(p[k])) p[k] = loose(p[k]);
  }
  // ...and not always under its name: the next AURORA plan called them "beasts". A list of things with a `kind` is
  // the beats, whatever the key.
  if (!Array.isArray(p.beats)) {
    for (const v of Object.values(p)) {
      const a = typeof v === 'string' && /^\s*\[/.test(v) ? loose(v) : v;
      if (Array.isArray(a) && a.length && a.every((b) => b && typeof b === 'object' && 'kind' in b)) { p.beats = a; break; }
    }
  }

  const title = clean(p.title) || 'UNTITLED';
  const look = p.look ?? {};
  // What the plan leaves out or gets wrong falls back on the casting draw (lib/casting.mjs), not on the house black
  // and orange: a light or coloured ground is a look, and the text flips to whatever reads on it.
  const fallback = casting?.looks?.[0] ?? { ground: '#0A0A0B', text: '#ECE7DE', accent: '#FF4D1A' };
  let ground = HEX.test(look.ground) ? look.ground : fallback.ground;
  // A dark or tense film sits on a dark ground: DEAD AIR, a true-crime podcast (mood tense, family dread), came on
  // amber #FFAA33 and played as a bright yellow poster (2026-10-17). The ground keeps its hue, darkened. (look.key is
  // not the signal: the plan never sends it, the output always says "low".) A hopeful sunrise on amber stays.
  const dim = ['dark', 'tense', 'melancholic'].includes(String(p.music?.mood ?? '').toLowerCase()) || p.family === 'dread';
  if (dim && lum(ground) > 0.25) {
    const k = Math.sqrt(0.012 / lum(ground));
    ground = '#' + [1, 3, 5].map((i) => Math.round(parseInt(ground.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  let textC = HEX.test(look.text) ? look.text : fallback.text;
  if (contrast(ground, textC) < 7) textC = lum(ground) > 0.18 ? '#121212' : '#ECE7DE';
  if (contrast(ground, textC) < 7) [ground, textC] = [fallback.ground, fallback.text];
  // The accent marks a word: the same colour as the text marks nothing (DEAD AIR again, #111111 for both).
  const ok = (c) => HEX.test(c) && contrast(ground, c) >= 3.5 && c.toUpperCase() !== textC.toUpperCase();
  const accent = ok(look.accent) ? look.accent : ok(fallback.accent) ? fallback.accent : lum(ground) <= 0.18 ? '#FF4D1A' : '#B3261E';

  const display = pickKey(p.fonts?.display, Object.keys(DISPLAY_FONTS), 'Bebas Neue');
  const textFace = pickKey(p.fonts?.text, Object.keys(TEXT_FONTS), 'Inter');

  // Beats: known kinds, words cleaned, a hook first and the title last.
  let beats = (Array.isArray(p.beats) ? p.beats : []).map((b, src) => {
    const kind = pickKey(b?.kind, KINDS, 'card');
    // A free Director sent ['["IT NEVER","REACHES THE ISLAND"]'] (an array as text inside the array), and it went on
    // screen brackets and all (2026-10-16): parse it; brackets and straight quotes never reach the frame.
    // and a word is a word: DEAD AIR's drop held "..." under its icon (2026-10-17)
    let words = wordList(b?.words).filter((w) => /[\p{L}\p{N}]/u.test(w));
    if (kind === 'slams') {
      // a small word rides with the next one: ORBIT (2026-10-17) slammed "AT" and "A" alone for half a second each
      const SMALL = /^(A|AN|THE|AT|OF|TO|IN|ON|BY|MY|YOUR|OUR|NO|IS|IT'?S)$/;
      words = words.flatMap((w) => w.split(' ')).reduceRight((acc, w) => (SMALL.test(w) && acc.length ? [`${w} ${acc[0]}`, ...acc.slice(1)] : [w, ...acc]), []).slice(0, 5);
    }
    if (kind === 'statement') words = words.flatMap((w) => w.split(' ')).slice(0, 7);
    if (kind === 'title') words = words.slice(0, 3);
    if (kind !== 'drop' && kind !== 'slams' && kind !== 'statement') words = words.slice(0, 4);
    return {
      kind,
      words,
      sub: kind === 'title' ? endSub(b?.sub) : subline(b?.sub),
      air: pickKey(b?.air, AIRS, undefined),
      image: b?.image ? String(b.image).slice(0, 200) : undefined,
      icon: b?.icon ? String(b.icon).toLowerCase().trim().slice(0, 24) : undefined,
      // a real photo under the beat (lib/photos.mjs): a short search, never on the end card or the drop
      photo: b?.photo && kind !== 'title' ? String(b.photo).replace(/[^\p{L}\p{N} -]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || undefined : undefined,
      src, // the Director's index: its `peak` counts in its own list, before beats are merged, moved or dropped
    };
  }).filter((b) => b.words.length || b.kind === 'drop');
  // Slams in a row are one escalation: the Director sometimes writes SIZZLE, MELODY, VIBES as three one-second beats
  // (eval 2026-10-16). One beat keeps the words on the grid and leaves room for the rest.
  beats = beats.reduce((acc, b) => {
    const prev = acc.at(-1);
    if (prev?.kind === 'slams' && b.kind === 'slams' && prev.words.length + b.words.length <= 4) {
      prev.words.push(...b.words);
      prev.airs = [...(prev.airs ?? [prev.air]), b.air].filter(Boolean);
      return acc;
    }
    acc.push(b);
    return acc;
  }, []);
  // Every beat says something new: a line already on screen, as words or as a small line, wastes a beat (2026-10-16:
  // "THE LAUNDROMAT" as a beat and again under the next one). The title may echo a name, so it is not checked.
  const seen = new Map();
  beats.forEach((b, i) => {
    if (b.kind === 'title') return;
    for (const line of [b.words.join(' '), b.sub].filter((x) => x && x.includes(' '))) {
      const key = line.toUpperCase();
      if (seen.has(key) && seen.get(key) !== i) problems.push(`beats[${i}] repeats "${line}" from beats[${seen.get(key)}]: every beat must say something new`);
      else seen.set(key, i);
    }
  });
  // A reveal shows a thing: with no thing named it is a card.
  const named = (Array.isArray(p.icons) ? p.icons : String(p.icons ?? '').split(',')).some((w) => String(w).trim()) || beats.some((b) => b.icon);
  for (const b of beats) if (b.kind === 'reveal' && !named) b.kind = 'card';
  if (beats.length < 3) problems.push(`beats: ${beats.length} usable beats, at least 3 needed (a hook, the middle, the title)`);
  // (the beat count is checked below, once repeats of the title are gone)
  // A long film on few beats is slow: DEEP SIGNAL (15 s, 2026-10-17) held a two-word hook for 3.9 s and three slams for 3.9.
  if (!beats.some((b) => b.kind === 'title')) beats.push({ kind: 'title', words: title.split(' ').slice(0, 3) });
  else if (beats.at(-1).kind !== 'title') { const t = beats.find((b) => b.kind === 'title'); beats = [...beats.filter((b) => b !== t), t]; }
  if (['drop', 'title'].includes(beats[0]?.kind)) problems.push('beats[0] is the hook: it must be statement, slams, card, rush or world, with words readable at frame 0');
  for (const [i, b] of beats.entries()) if (b.kind !== 'drop' && !b.words.length) problems.push(`beats[${i}] (${b.kind}) has no words`);
  // The brief's facts, not new ones: a free Director turned "6 days, 5 huts, 80 km" into "212 KM OF SUMMER" and the
  // trek into a horror film with another title (DOLOMITES, 2026-10-17). Every number on screen must be in the brief, and
  // the name the brief writes in capitals (FIRE MOUNTAIN, IRON HOUR) is the title.
  if (prompt) {
    // numbers as values: 80K = 80,000; a countdown digit or the 2 of O2 is not a fact
    const expand = (t) => String(t).replace(/(\d),(\d{3})/g, '$1$2').replace(/(\d+)([KM])\b/gi, (m, n, k) => String(Number(n) * (k.toUpperCase() === 'K' ? 1e3 : 1e6)));
    const nums = (t) => (expand(t).match(/\d+/g) ?? []).map(Number);
    const briefNums = new Set([...nums(prompt), ...(String(prompt).replace(/(\d),(\d{3})/g, '$1$2').match(/\d+/g) ?? []).map(Number)]);
    for (const [i, b] of beats.entries()) {
      const odd = nums([...b.words, b.sub ?? ''].join(' ')).filter((n) => n > 3 && !briefNums.has(n) && !(n >= 1900 && n <= 2100));
      if (odd.length) problems.push(`beats[${i}] shows ${odd.join(', ')}, which is not in the brief: use only the brief's numbers`);
    }
    // the brief's name: its first word group in capitals of 4+ letters (not BBC, not EV); without one, the title shares
    // at least one word with the brief
    const name = (prompt.match(/\b[A-Z0-9][A-Z0-9&'’.-]*(?:\s+[A-Z0-9&'’.-]+)*\b/g) ?? []).find((m) => /[A-Z]{4}/.test(m) || /[A-Z]{2}.*\s/.test(m));
    const T = title.toUpperCase(), P = prompt.toUpperCase();
    if (name ? !T.includes(name.toUpperCase()) && !name.toUpperCase().includes(T) : !T.split(/\s+/).some((w) => w.length >= 4 && P.includes(w)))
      problems.push(`the title is "${title}", but the brief calls it ${name ? `"${name}"` : 'something else'}: the film is called what the brief calls it`);
  }
  // A number alone does not say what it counts: READ TO ME (2026-10-17) slammed a bare "50,000" (books, said the brief).
  for (const [i, b] of beats.entries())
    if (b.kind !== 'title' && b.words.length && b.words.join(' ').replace(/[\s$€£#%+.,]/g, '').match(/^\d+[KM]?$/i) && !b.sub)
      problems.push(`beats[${i}] is a number alone ("${b.words.join(' ')}"): give it its noun ("${b.words.join(' ')} BOOKS", "${b.words.join(' ')} FANS") so a muted viewer knows what it counts`);
  // A line that stops on a function word is half a sentence on screen: ROBO CAMP's "BUILD YOUR" (2026-10-17).
  const DANGLING = /^(THE|A|AN|YOUR|MY|OUR|THEIR|HIS|HER|ITS|OF|TO|AND|OR|BUT|WITH|FOR|IN|ON|AT|FROM|INTO|BY|IS|ARE|WILL|CAN)$/;
  for (const [i, b] of beats.entries()) {
    const last = b.words.join(' ').trim().split(/\s+/).pop()?.toUpperCase().replace(/[^\p{L}]/gu, '');
    if (b.kind !== 'slams' && last && DANGLING.test(last) && b.words.join(' ').split(/\s+/).length > 1)
      problems.push(`beats[${i}] ends on "${last}": every beat's words are a whole phrase, finish it or cut it`);
  }
  // A middle beat that only says the title spends the end card early: THE LAST TRAIN (2026-10-17) showed "THE LAST
  // TRAIN" twice in a row, 1.5 s apart. Dropped while the film keeps a hook, a middle and the title.
  const say = (b) => b.words.join(' ').toUpperCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const tKey = beats.at(-1)?.kind === 'title' ? say(beats.at(-1)) : '';
  for (let i = beats.length - 2; i > 0 && tKey; i--) if (beats.length > 4 && beats[i].kind !== 'drop' && say(beats[i]) === tKey) beats.splice(i, 1);
  // ...and a hook that only says the title gives the end card away in the first second: THE HOLLOW (2026-10-17) opened
  // on its own name, and its real hook ("THE KNOCKS START INSIDE") came second. The next beat becomes the hook.
  if (tKey && beats.length > 4 && say(beats[0]) === tKey && !['drop', 'title'].includes(beats[1]?.kind)) beats.shift();
  // ...counted after those removals: RIDE THE ALPS (2026-10-17) opened on its own name, lost that hook here, and went
  // out as four beats in 15 s
  const minBeats = duration >= 14 ? 5 : 4;
  if (beats.length >= 3 && beats.length < minBeats) problems.push(`beats: ${beats.length} beats for ${duration} s once the repeats of the title are gone, at least ${minBeats} needed: something new every 2-3 s, and the hook is never the title`);
  // A line said twice in one beat says nothing new: ["ONE BY ONE", "ONE BY ONE", "ONE BY ONE"] (RIDE THE ALPS)
  for (const [i, b] of beats.entries()) if (b.words.length > 1 && new Set(b.words).size < b.words.length && b.words.some((w) => w.includes(' ')))
    problems.push(`beats[${i}] repeats its own words (${b.words.join(' / ')}): every line says something new`);
  // The end card carries the brief's date, place or call to action when the brief has one (RIDE THE ALPS had none,
  // and "REGISTRATION OPENS MAY 1" came only from the Critic)
  const endCard = beats.at(-1);
  if (prompt && endCard?.kind === 'title' && !endCard.sub && (/\d/.test(prompt) || /\b(now|today|soon|pre-?order|available|register|registration|donate|book|join|opens?|streaming|coming)\b/i.test(prompt)))
    problems.push("the title has no sub: put the brief's date, place or call to action under the name");
  // the Director decides beat by beat (a photo, or drawn): no quota beyond the beats themselves
  beats.filter((b) => b.photo).slice(6).forEach((b) => delete b.photo);
  if (photoLed) for (const b of beats) if (b.kind === 'reveal') b.kind = 'card';  // a reveal shows an object: there is none
  const maxBeats = duration >= 15 ? 7 : 6;
  if (beats.length > maxBeats) beats = [...beats.slice(0, maxBeats - 1), beats.at(-1)];

  // Time: weights fitted to the duration, snapped to the beat grid, the last beat takes the rest.
  const bpm = clampN(p.bpm, 70, 140, 100), beat = 60 / bpm;
  // Cuts get shorter toward the peak (TRAILER_CRAFT.md, Rhythm): the middle beats ramp from 1.25x to 0.7x their
  // weight. Durations snap to half beats, not whole ones: whole beats made every middle beat 2.12 s in both test
  // trailers of 2026-10-16, a metronome. A drop with words holds long enough to read them.
  const middle = beats.map((b, i) => i > 0 && i < beats.length - 1 && b.kind !== 'drop');
  const nMid = middle.filter(Boolean).length;
  let k = 0;
  const weights = beats.map((b, i) => weightOf(b) * (middle[i] ? 1.25 - (0.55 * k++) / Math.max(1, nMid - 1) : 1));
  const sum = weights.reduce((a, w) => a + w, 0), half = beat / 2;
  // A wordless drop holds 0.8 s: at half a second the cut ate most of it and the frames read black (BLUE NOTE NIGHTS'
  // moon, LOOP's bike, 2026-10-17: detail 0.2-0.8 on the drop).
  const minOf = (b, i) => (b.kind === 'drop' ? Math.max(beat, b.words.length ? 1 : 0.8) : i === 0 ? beat * 2 : beat * 1.5);
  const durs = beats.map((b, i) => {
    let dur = b.kind === 'drop' ? minOf(b, i) : Math.max(minOf(b, i), Math.round(((weights[i] / sum) * duration) / half) * half);
    // A slammed word needs ~0.45 s to be read: four words in 1.18 s showed "FO" and "KNO" (the Night Ferry, 2026-10-16).
    if (b.kind === 'slams') dur = Math.max(dur, Math.ceil((0.45 * b.words.length) / half) * half);
    return dur;
  });
  // The title is the longest hold: what the other beats took beyond their share comes back out of the longest middle
  // beats, half a beat at a time (the slams' minimum once left the end card 1.6 s).
  const titleMin = Math.max(beat * 3, 2.2);
  const rest = () => duration - durs.slice(0, -1).reduce((a, d) => a + d, 0);
  for (let guard = 0; rest() < titleMin && guard < 40; guard++) {
    const i = durs.map((d, j) => [d - minOf(beats[j], j), j]).filter(([room, j]) => room >= half - 1e-9 && j < durs.length - 1 && beats[j].kind !== 'slams').sort((a, b) => b[0] - a[0])[0]?.[1];
    if (i === undefined) break;
    durs[i] -= half;
  }
  let t = 0;
  const names = {};
  const timed = beats.map((b, i) => {
    let dur = durs[i];
    if (i === beats.length - 1) dur = Math.max(beat * 2, duration - t);
    names[b.kind] = (names[b.kind] ?? 0) + 1;
    const name = i === 0 ? 'hook' : names[b.kind] > 1 ? `${b.kind}${names[b.kind]}` : b.kind;
    const { src, ...rest } = b;
    const out = { ...rest, name, t: +t.toFixed(3), dur: +dur.toFixed(3) };
    t += dur;
    return out;
  });
  const total = +t.toFixed(3);
  if (Math.abs(total - duration) > 1.5) problems.push(`the beats add up to ${total} s, the film is ${duration} s`);

  const mood = pickKey(p.music?.mood, MOODS, 'dark');
  const family = pickKey(p.family, FAMILIES, mood === 'hopeful' || mood === 'melancholic' ? 'moved' : mood === 'dark' ? 'dread' : 'triumph');
  const palette = pickKey(p.music?.palette, PALETTES, family === 'triumph' ? 'hybrid' : family === 'insight' ? 'electronic' : 'orchestral');
  const device = pickKey(p.device, Object.keys(DEVICES), 'type-choreography');
  const key = pickKey(p.music?.key, KEYS, 'D');
  // The peak as the Director counted it: after a merge, a move or a dropped beat, its index pointed at another beat
  const pk = p.peak == null || p.peak === '' ? NaN : Number(p.peak), pi = beats.findIndex((b) => b.src === pk);
  const peak = Number.isInteger(pk) && pi >= 0 ? pi : timed.length - 1;

  const film = {
    title,
    statement: String(p.logline ?? '').slice(0, 240) || title,
    prompt,
    cold: { subject: [title], cta: [] },
    duration: total,
    fps: 24,
    bpm,
    formats: ['16x9'],
    // noir has no saturation: it would erase the film's one accent, so a coloured accent gets bleach (contrast, some colour).
    look: { key: 'low', ground, text: textC, accent, grade: ((g) => (g === 'noir' ? 'bleach' : g))(pickKey(look.grade, GRADES, casting?.looks?.[0]?.grade ?? 'neutral')), letterbox: !!look.letterbox,
      layout: pickKey(look.layout, ['centre', 'left', 'low'], casting?.layout ?? 'centre') },
    // The page's defaults the plan does not name: the two cuts, the weather of the hook and of the end card.
    style: { cuts: casting?.cuts ?? ['zoom', 'luma'], hookAir: casting?.hookAir ?? 'beam', titleAir: casting?.titleAir ?? 'embers' },
    ...(p.treatment ? { treatment: String(p.treatment).slice(0, 900) } : {}),
    // What to fetch as icons (lib/icons.mjs turns these words into files: film.icons becomes [{ word, id, file }]).
    // ...plus any icon a beat names: SPROUT's drop asked for a "tomato" the list did not have, and showed the seed
    // labelled TOMATO (2026-10-16).
    iconWords: photoLed ? [] : [...new Set([...(Array.isArray(p.icons) ? p.icons : String(p.icons ?? '').split(',')), ...timed.map((b) => b.icon).filter(Boolean)]
      .map((w) => String(w).toLowerCase().replace(/[^a-z ]/g, '').trim()).filter((w) => w && w.length <= 24))].slice(0, 5),
    type: {
      roles: [
        { role: 'DISPLAY', face: display, weight: DISPLAY_FONTS[display], job: 'display', source: 'library' },
        { role: 'TEXT', face: textFace, weight: TEXT_FONTS[textFace], job: 'text', source: 'library' },
      ],
    },
    beats: timed,
    peak: { t: timed[peak].t, beat: timed[peak].name },
    music: { mood, key, palette },
    kind: pickKey(p.type, TYPES, 'teaser'),
    family,
    ...(p.story && typeof p.story === 'object'
      ? { story: {
          core: String(p.story.core ?? '').slice(0, 300),
          technique: (Array.isArray(p.story.technique) ? p.story.technique : String(p.story.technique ?? '').split(/[,\s]+/)).map(String).filter(Boolean).slice(0, 3),
          line: String(p.story.line ?? '').slice(0, 60),
          obvious: String(p.story.obvious ?? '').slice(0, 160),
        } }
      : {}),
    device,
    rev: 0,
  };
  return { film, problems };
}

/** The Critic's patches: { beat: "<name>", field: words|sub|air|kind, value } or { field: accent|ground|text|grade, value }. */
export function applyPatch(film, patch) {
  const f = structuredClone(film);
  const field = String(patch?.field ?? '');
  if (['accent', 'ground', 'text'].includes(field)) {
    if (!HEX.test(patch.value)) return { film, ok: false, why: `${field} must be a hex colour` };
    f.look[field] = patch.value;
    if (contrast(f.look.ground, f.look.text) < 7) return { film, ok: false, why: 'text and ground would not contrast enough' };
  } else if (field === 'grade') {
    f.look.grade = pickKey(patch.value, GRADES, f.look.grade);
  } else {
    const b = f.beats.find((x) => x.name === patch?.beat);
    if (!b) return { film, ok: false, why: `no beat named ${patch?.beat}` };
    if (field === 'words') {
      const words = wordList(patch.value);
      if (!words.length) return { film, ok: false, why: 'empty words' };
      b.words = words.slice(0, b.kind === 'slams' || b.kind === 'statement' ? 7 : 4);
    } else if (field === 'sub') b.sub = b.kind === 'title' ? endSub(patch.value) : subline(patch.value);
    else if (field === 'air') b.air = pickKey(patch.value, AIRS, b.air);
    // the beat's picture: a new stock photo search, or "none" for drawn (the end card is never a photo)
    else if (field === 'photo') {
      if (b.kind === 'title') return { film, ok: false, why: 'the end card is never a photo' };
      const q = String(patch.value ?? '').replace(/[^\p{L}\p{N} -]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!q || /^(none|no|drawn|off)$/i.test(q)) delete b.photo; else b.photo = q;
    }
    // ...but a flat hook may become the reveal when the film has a thing to show: DEEP SIGNAL's Critic asked for exactly
    // that (2026-10-17), and the reveal keeps its words big and readable at frame 0
    else if (field === 'kind' && f.beats.indexOf(b) === 0 && String(patch.value).toLowerCase() === 'reveal' && (f.icons ?? []).some((i) => i.obj || i.file) && !f.beats.some((x) => x.kind === 'reveal'))
      b.kind = 'reveal';
    else if (field === 'kind' && (f.beats.indexOf(b) === 0 || ['drop', 'title'].includes(b.kind)))
      return { film, ok: false, why: 'the hook, the drop and the title keep their kind' }; // eval round 1: a big hook became a small title
    else if (field === 'kind') {
      // A hand-written shot the critic rejects falls back to the recipe it names (eval 2026-10-16: a black custom shot).
      // Never into a second title or drop mid-film (the A/B's Haiku Critic made a middle beat a "title", 2026-10-16).
      b.kind = pickKey(patch.value, KINDS.filter((k) => !['custom', 'title', 'drop'].includes(k)), b.fallback ?? b.kind);
      delete b.fallback;
    }
    else return { film, ok: false, why: `cannot change ${field}` };
  }
  f.rev = (f.rev ?? 0) + 1;
  return { film: f, ok: true };
}

// ---------------------------------------------------------------- the score
// The studio's sound grammar (cinematic-studio/docs/TRAILER_CRAFT.md, "Sound grammar"; docs/AUDIO.md): real instruments
// (VSCO 2 CE `inst` cues), one track that grows with the picture, a motif stated after the hook and answered at the title,
// risers that END on the hit, a silence before the peak, the biggest hit on it, then the room rings.
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
/** The note `deg` steps up the minor scale of `key`, in octave `oct`. */
export function note(key, deg, oct) {
  const d = ((deg % 7) + 7) % 7, up = Math.floor(deg / 7);
  const midi = 12 * (oct + 1 + up) + PC[key] + MINOR[d];
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Instruments the score uses: the sandbox only needs these from the 3.1 GB library. */
export const SCORE_INSTRUMENTS = ['piano.soft', 'violins', 'violins.soft', 'celli', 'celli.soft', 'celli.spic', 'horn', 'timpani', 'perc', 'glock', 'marimba'];
/** The only keys the score plays on an instrument (pack.mjs ships just those samples): GM bass drum and crash. */
export const SCORE_KEYS = { perc: [36, 49] };
/** The softest velocity the score plays: quieter layers stay out of the sandbox pack. */
export const SCORE_MIN_VELOCITY = 76;

/** film.json -> sound.json. */
export function score(film) {
  const { key, palette = 'orchestral' } = film.music, beat = 60 / film.bpm, D = film.duration;
  const family = film.family ?? 'triumph';
  const peak = film.beats.find((b) => b.name === film.peak.beat) ?? film.beats.at(-1);
  const orch = palette !== 'electronic', drums = palette !== 'orchestral';
  const n = (deg, oct) => note(key, deg, oct);
  const cues = [];
  const hit = (t, big = 0.8) => {
    cues.push({ t, type: 'inst', inst: 'perc', notes: [[36, 0, 1.5, Math.round(100 + 27 * big)]], gain: 0.75 * big, bus: 'drums' });
    if (orch) cues.push({ t, type: 'inst', inst: 'timpani', notes: [[n(0, 2), 0, 1.5, Math.round(100 + 25 * big)]], gain: 0.6 * big, bus: 'drums' });
    if (drums) cues.push({ t, type: 'kick2', tune: 50, punch: 190, decay: 0.7, gain: 0.95 * big });
    cues.push({ t, type: 'sub', notes: [[n(0, 1), 0, 1.2]], decay: 0.7, gain: 0.28 * big });
  };

  // Opening bed: the motif on piano (or mallets) right after the hook lands, a low pedal under it.
  const motifAt = peak.t > beat * 6 ? beat * 2 : 0.3;
  const motif = [[n(0, 4), 0, beat], [n(2, 4), beat, beat], [n(4, 4), beat * 2, beat * 2]];
  hit(0, 0.8);
  cues.push({ t: motifAt, type: 'inst', inst: palette === 'electronic' ? 'marimba' : 'piano.soft', notes: motif.map(([x, at, len]) => [x, at, len, 82]), gain: 0.65 });
  if (orch) cues.push({ t: 0, type: 'inst', inst: 'celli.soft', notes: [[n(0, 2), 0, peak.t, 80]], swell: [0.4, 1], gain: 0.4 });
  else cues.push({ t: 0, type: 'drone', note: n(0, 1), dur: peak.t, gain: 0.3 });

  // A hit on every cut before the peak; whooshes into them.
  for (const b of film.beats) {
    if (b === peak || b.kind === 'drop' || b.t === 0) continue;
    hit(b.t, 0.65);
    cues.push({ t: Math.max(0, b.t - 0.45), type: 'whoosh', dur: 0.45, gain: 0.3 });
    if (b.kind === 'slams') for (let i = 1; i < b.words.length; i++) hit(b.t + (b.dur / b.words.length) * i, 0.55);
  }

  // Escalation: an ostinato (spiccato celli, or a pluck arp) and the groove, up to the build.
  const g0 = film.beats[1]?.t ?? beat * 4, g1 = Math.max(g0, peak.t - beat * 2);
  const steps = Math.max(0, Math.floor((g1 - g0) / (beat / 2)));
  const pattern = [0, 0, 2, 0, 4, 0, 6, 0];
  if (steps) {
    if (orch) cues.push({ t: g0, type: 'inst', inst: 'celli.spic', notes: [...Array(steps)].map((_, i) => [n(pattern[i % 8], 2), (i * beat) / 2, 0.14, i % 4 ? 92 : 118]), gain: 0.5 });
    else cues.push({ t: g0, type: 'pluck', notes: [...Array(steps)].map((_, i) => [n(pattern[i % 8], 3), (i * beat) / 2, 0.1]), gain: 0.2, cutoff: 1600, decay: 0.12 });
    if (orch) cues.push({ t: g0, type: 'inst', inst: 'violins.soft', notes: [[n(0, 4), 0, g1 - g0 + beat, 84], [n(2, 4), 0, g1 - g0 + beat, 80]], swell: [0.3, 1], gain: 0.38 });
    if (drums) {
      const beats = Math.floor((g1 - g0) / beat);
      if (beats > 0) {
        cues.push({ t: g0, type: 'kick2', every: beat, count: beats, gain: 0.6 });
        if (beats > 1) cues.push({ t: g0 + beat, type: 'clap2', every: beat * 2, count: Math.floor(beats / 2), gain: 0.32 });
        cues.push({ t: g0, type: 'hat2', every: beat / 2, count: beats * 2, gain: 0.1 });
      }
    }
  }

  // Into the peak: a riser that ends on it, a roll, then the silence (longer for dread), then the biggest hit.
  const build = Math.min(2.4, Math.max(1, peak.t - g0));
  const hush = family === 'dread' ? 0.8 : family === 'moved' ? 0.5 : 0.38;
  cues.push({ t: peak.t - build, type: 'riser', dur: Math.max(0.4, build - hush), from: 300, to: 6000, gain: 0.24 });
  if (orch) cues.push({ t: peak.t - beat * 2, type: 'inst', inst: 'timpani', notes: [...Array(6)].map((_, i) => [n(0, 2), (i * beat) / 3, 0.2, 90 + i * 6]), gain: 0.45, bus: 'drums' });
  else cues.push({ t: peak.t - beat * 2, type: 'snare2', every: beat / 4, count: 6, gain: 0.24 });
  cues.push({ t: peak.t - hush, type: 'duck', dur: hush - 0.02, fade: 0.01 });
  cues.push({ t: peak.t - 0.3, type: 'tick', gain: 0.25, verb: 0.6 });
  hit(peak.t, 1);
  cues.push({ t: peak.t, type: 'impact', gain: 0.65 });
  cues.push({ t: peak.t, type: 'inst', inst: 'perc', notes: [[49, 0, 3, 115]], gain: 0.4, bus: 'drums' });
  const ring = D - peak.t + 1;
  if (orch) {
    cues.push({ t: peak.t, type: 'inst', inst: 'violins', notes: [[n(0, 4), 0, ring, 104], [n(4, 4), 0, ring, 100], [n(2, 5), 0, ring, 100]], swell: [1, 0.5], gain: 0.45 });
    cues.push({ t: peak.t, type: 'inst', inst: 'celli', notes: [[n(0, 3), 0, ring, 104]], swell: [1, 0.5], gain: 0.45 });
    if (family !== 'moved') cues.push({ t: peak.t, type: 'inst', inst: 'horn', notes: [[n(0, 3), 0, ring - 0.2, 108], [n(4, 3), 0, ring - 0.2, 104]], swell: [1, 0.4], gain: 0.42 });
  } else {
    cues.push({ t: peak.t, type: 'pad', chord: [n(0, 3), n(4, 3), n(2, 4), n(0, 5)], dur: ring, attack: 0.05, release: 1.5, gain: 0.35 });
  }
  // The motif answered, home on the tonic: the sonic logo on the title.
  cues.push({ t: peak.t + beat, type: 'inst', inst: palette === 'electronic' ? 'marimba' : 'glock', notes: [[n(4, 5), 0, beat, 88], [n(2, 5), beat, beat, 84], [n(0, 5), beat * 2, beat * 2, 92]], gain: 0.4 });

  return {
    _score: `Generated from film.json: ${palette} palette, ${family} peak, ${key} minor, ${film.bpm} BPM. VSCO 2 CE instruments + the studio's electronic voices.`,
    duration: +(D + 0.5).toFixed(3),
    bpm: film.bpm,
    verb: { room: 0.85, wet: 1 },
    master: { ceiling: -3 },
    sidechain: { depth: 0.3, attack: 0.005, release: 0.16 },
    buses: { drums: { transient: 0.4, saturate: 0.3 }, music: { saturate: 0.12, air: 0.5 }, fx: { gain: 1.4 } },
    cues: cues.map((c) => ({ ...c, t: +Math.max(0, c.t).toFixed(3) })),
  };
}
