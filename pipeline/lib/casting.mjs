// The casting draw: the studio's dice, rolled once per job from its id. Free models asked for "a trailer" converge on
// one film (27 runs to 2026-10-16: 25 on a #0A0A0B ground, 20 on statement → custom → card → slams → drop → title,
// centred type, the same cuts). The draw hands the Director three looks, a shape, two devices and a few faces to choose
// from, and gives the film page a composition and a pair of cuts, so two people typing the same idea at the hackathon
// still get two different films. The engine stays generic: the user's prompt directs the whole crew, and the draw only
// decides what the prompt leaves open (a prompt that names its colours, its structure or its mood overrides it).

/** A seeded random generator (FNV-1a hash of the seed, then mulberry32). */
export function dice(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let a = h >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (list) => list[Math.floor(r() * list.length)];
  const take = (list, n) => [...list].map((x) => [r(), x]).sort((p, q) => p[0] - q[0]).slice(0, n).map(([, x]) => x);
  return { r, pick, take };
}

// Every look passes the plan's checks (text on ground >= 7:1, accent on ground >= 3.5:1; test/casting.test.mjs).
// `key`: dark, light (a paper ground) or colour (a saturated ground).
export const LOOKS = [
  { name: 'ink and cyan', key: 'dark', ground: '#07090D', text: '#E8F1F2', accent: '#29D3FF', grade: 'cold-steel' },
  { name: 'oxblood', key: 'dark', ground: '#1A0607', text: '#F3E6DC', accent: '#FF5C5C', grade: 'warm-film' },
  { name: 'forest night', key: 'dark', ground: '#06120D', text: '#E6F2E4', accent: '#7CFF6B', grade: 'matte' },
  { name: 'aubergine', key: 'dark', ground: '#140A1C', text: '#F1E8FF', accent: '#C77DFF', grade: 'neutral' },
  { name: 'deep navy and gold', key: 'dark', ground: '#050B1F', text: '#EAF0FF', accent: '#FFD23F', grade: 'teal-orange' },
  { name: 'graphite and lime', key: 'dark', ground: '#111212', text: '#F2F2EE', accent: '#D4FF3A', grade: 'bleach' },
  { name: 'midnight rose', key: 'dark', ground: '#120812', text: '#FFE9F1', accent: '#FF4FA3', grade: 'matte' },
  { name: 'petrol', key: 'dark', ground: '#04161A', text: '#E2F6F5', accent: '#2FF3C8', grade: 'cold-steel' },
  { name: 'silver noir', key: 'dark', ground: '#0B0B0C', text: '#F4F4F4', accent: '#B8C4D6', grade: 'bleach' },
  { name: 'ember', key: 'dark', ground: '#0E0806', text: '#F6EADF', accent: '#FF8A3D', grade: 'warm-film' },
  { name: 'paper and red ink', key: 'light', ground: '#F1ECE2', text: '#141414', accent: '#D42A18', grade: 'neutral' },
  { name: 'bone and cobalt', key: 'light', ground: '#EDEFF2', text: '#0D1426', accent: '#2448E8', grade: 'matte' },
  { name: 'sun yellow', key: 'light', ground: '#FFD84D', text: '#141008', accent: '#B0124F', grade: 'neutral' },
  { name: 'mint', key: 'light', ground: '#DDF5EA', text: '#0B1F17', accent: '#0B6E4B', grade: 'neutral' },
  { name: 'ultramarine', key: 'colour', ground: '#1C23D9', text: '#F7F7FF', accent: '#FFE14D', grade: 'neutral' },
  { name: 'signal red', key: 'colour', ground: '#8E0C15', text: '#FFF4EC', accent: '#FFD447', grade: 'bleach' },
  { name: 'deep teal', key: 'colour', ground: '#0F4A50', text: '#F2FBF9', accent: '#FFC857', grade: 'matte' },
  { name: 'violet', key: 'colour', ground: '#3B0F8C', text: '#F6F0FF', accent: '#3CF2B5', grade: 'neutral' },
];

// Shapes: the order of the beats. All of them open readable at frame 0 and end on the title.
export const SHAPES = [
  { name: 'classic', beats: 'statement (hook) → world → card (the turn) → slams (escalation) → drop → title' },
  { name: 'cold open', beats: 'card (a quiet, strange fact as the hook) → statement (it lands hard) → rush → drop → title' },
  { name: 'countdown', beats: 'statement (hook) → slams (a countdown or a list) → hud → slams → title' },
  { name: 'call and response', beats: 'statement (a question) → card (the answer) → statement (a second question) → slams → title' },
  { name: 'slow burn', beats: 'world (long, atmospheric hook) → card → card → drop → title (the only loud moment)' },
  { name: 'manifesto', beats: 'statement → statement → slams → statement → title (type only, no world)' },
  { name: 'ending first', beats: 'card (the ending, as the hook) → world (how we got here) → slams → drop → title' },
  // the thing itself in the middle: a recipe film's real picture (lib/plan.mjs `reveal`, 2026-10-17)
  { name: 'product shot', beats: 'statement (hook: the problem or the promise) → reveal (the thing itself, big) → slams (what it does) → card (the proof) → title' },
  { name: 'signal', beats: 'hud (hook: a message decoding) → card → rush → drop → title' },
];

// How the film page composes type (pipeline/film/index.html): centred, flush left like an editorial, or low like a
// subtitle under a big empty frame.
export const LAYOUTS = ['centre', 'left', 'low'];
// The cuts between beats (lib/transitions.js); two per film, alternating.
export const CUTS = ['zoom', 'luma', 'push', 'wipe', 'iris', 'ink', 'leak'];
// The end card's weather when the Director leaves it out (it was always embers: the warm sparks of every trailer).
export const TITLE_AIRS = ['embers', 'sparks', 'dust', 'bokeh', 'light', 'smoke', 'none'];
// The hook's weather when the Director leaves it out (it was always a warm beam).
export const HOOK_AIRS = ['beam', 'dust', 'smoke', 'bokeh', 'fog', 'light'];

/** The draw for one job: what the Director is offered and how the film page composes. */
export function cast(seed, { devices = [], fonts = [] } = {}) {
  const d = dice(seed);
  // One dark, one light or colour, one free: a choice that is a real choice.
  const dark = LOOKS.filter((l) => l.key === 'dark'), bright = LOOKS.filter((l) => l.key !== 'dark');
  const first = d.pick(dark), second = d.pick(bright);
  const third = d.pick(LOOKS.filter((l) => l !== first && l !== second));
  return {
    seed: String(seed),
    looks: d.take([first, second, third], 3),
    shape: d.pick(SHAPES),
    devices: d.take(devices, 2),
    fonts: d.take(fonts, 5),
    layout: d.pick(LAYOUTS),
    cuts: d.take(CUTS, 2),
    titleAir: d.pick(TITLE_AIRS),
    hookAir: d.pick(HOOK_AIRS),
  };
}

/** The draw as the Director reads it (appended to the user's idea). */
export function castingText(c) {
  return [
    `The casting draw (the studio rolls it per job so two films never look alike). The idea above is the direction: anything it asks for (colours, mood, structure, type, era) wins. Use the draw only for what the idea leaves open, and adapt it to the subject; never default to a black ground with an orange accent:`,
    // A free Director took the first look offered, pink, for a film about a furnace and molten glass (2026-10-16).
    `- Looks: first ask what colour the subject itself has (fire and molten glass glow amber, the sea is green-blue, a forest is green, a night sky is deep blue). If it has one, build the look from it and use these only for the ground or the type. If it has none, pick the one that fits the mood best (not simply the first): ${c.looks.map((l) => `"${l.name}" (ground ${l.ground}, text ${l.text}, accent ${l.accent}, grade ${l.grade})`).join('; ')}.`,
    `- Shape: ${c.shape.name}: ${c.shape.beats}.`,
    c.devices.length ? `- Devices to consider first: ${c.devices.join(', ')}.` : '',
    c.fonts.length ? `- Display faces to consider first: ${c.fonts.join(', ')}.` : '',
  ].filter(Boolean).join('\n');
}
