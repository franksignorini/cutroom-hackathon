import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lum, normalize } from '../lib/plan.mjs';

const plan = (look, drop = ['...'], mood = 'tense') => normalize({ title: 'DEAD AIR', look, music: { mood }, beats: [
  { kind: 'statement', words: ['WHEN THE AIR WENT SILENT?'] }, { kind: 'drop', words: drop }, { kind: 'title', words: ['DEAD AIR'] }] }).film;

test('a tense film gets a dark ground in its own hue, and an accent that is not the text colour', () => {
  const f = plan({ ground: '#FFAA33', text: '#111111', accent: '#111111' });   // DEAD AIR, 2026-10-17
  assert.ok(lum(f.look.ground) < 0.05, f.look.ground);
  assert.notEqual(f.look.accent.toUpperCase(), f.look.text.toUpperCase());
  const light = plan({ ground: '#F4EAD6', text: '#111111', accent: '#B3261E' }, [], 'hopeful');
  assert.equal(light.look.ground, '#F4EAD6');                                                // a light look stays light
});

test('punctuation alone is not a word on screen', () => {
  assert.deepEqual(plan({}).beats.find((b) => b.kind === 'drop').words, []);
});

test('the end card line keeps the parts that fit in 34 characters', async () => {
  const { endSub } = await import('../lib/plan.mjs');
  assert.equal(endSub('300 STALLS • OPEN UNTIL 2AM • FRIDAY & SATURDAY'), '300 STALLS · OPEN UNTIL 2AM');
  assert.equal(endSub('IN CINEMAS MARCH 7'), 'IN CINEMAS MARCH 7');
});

test('a caption mostly in capitals is set in capitals; sentence case stays', () => {
  const f = normalize({ title: 'X', beats: [{ kind: 'card', words: ['A'], sub: '5 AM · MANCHester' }, { kind: 'title', words: ['X'], sub: 'Free on iOS & Android' }] }).film;
  assert.deepEqual(f.beats.map((b) => b.sub), ['5 AM · MANCHESTER', 'Free on iOS & Android']);
});

test('a hook or a middle beat that only repeats the title is dropped', () => {
  const f = normalize({ title: 'THE HOLLOW', beats: [
    { kind: 'statement', words: ['THE', 'HOLLOW'] }, { kind: 'statement', words: ['THE KNOCKS START INSIDE'] },
    { kind: 'card', words: ['EVERY NIGHT'] }, { kind: 'statement', words: ['THE HOLLOW'] }, { kind: 'drop', words: [] },
    { kind: 'title', words: ['THE', 'HOLLOW'] }] }).film;
  assert.deepEqual(f.beats.map((b) => b.words.join(' ')), ['THE KNOCKS START INSIDE', 'EVERY NIGHT', '', 'THE HOLLOW']);
});

test('a line that stops on a function word goes back to the Director', () => {
  const { problems } = normalize({ title: 'ROBO CAMP', beats: [{ kind: 'statement', words: ['FIVE DAYS'] }, { kind: 'card', words: ['BUILD YOUR'] }, { kind: 'title', words: ['ROBO CAMP'] }] });
  assert.ok(problems.some((p) => /ends on "YOUR"/.test(p)));
  assert.ok(!normalize({ title: 'X', beats: [{ kind: 'statement', words: ['WHO SENT IT?'] }, { kind: 'card', words: ['IT IS NOT THE WIND'] }, { kind: 'title', words: ['X'] }] }).problems.some((p) => /ends on/.test(p)));
});

test('in slams a small word rides with the next one', () => {
  const s = (w) => normalize({ title: 'X', beats: [{ kind: 'statement', words: ['GO'] }, { kind: 'slams', words: w }, { kind: 'title', words: ['X'] }] }).film.beats[1].words;
  assert.deepEqual(s(['ONE', 'MODULE', 'AT', 'A', 'TIME']), ['ONE', 'MODULE', 'AT A TIME']);
  assert.deepEqual(s(['HE IS NOT A PAWN']), ['HE', 'IS NOT', 'A PAWN']);
  assert.deepEqual(s(['SEAR', 'CHAR', 'FLAMBÉ']), ['SEAR', 'CHAR', 'FLAMBÉ']);
});

test('a number alone goes back to the Director for its noun', () => {
  const p = (w, sub) => normalize({ title: 'X', beats: [{ kind: 'statement', words: ['GO NOW'] }, { kind: 'slams', words: w, sub }, { kind: 'title', words: ['X'] }] }).problems;
  assert.ok(p(['50,000']).some((x) => /number alone/.test(x)));
  assert.ok(!p(['50,000', 'BOOKS']).some((x) => /number alone/.test(x)));
  assert.ok(!p(['300'], 'STALLS').some((x) => /number alone/.test(x)));
});

test("the plan keeps to the brief's numbers and name", () => {
  const brief = 'Promo for the Dolomites hut-to-hut trek: 6 days, 5 huts, 80 km. Guided tours from July.';
  const bad = normalize({ title: 'WILDFIRE', beats: [{ kind: 'card', words: ['212 KM OF SUMMER'] }, { kind: 'card', words: ['NO MAPS'] }, { kind: 'title', words: ['WILDFIRE'] }] }, { prompt: brief }).problems;
  assert.ok(bad.some((p) => /shows 212/.test(p)) && bad.some((p) => /title is "WILDFIRE"/.test(p)));
  const ok = normalize({ title: 'INKWELL', beats: [{ kind: 'slams', words: ['80K', 'BOOKS'] }, { kind: 'card', words: ['OPEN', '24 HOURS'] }, { kind: 'title', words: ['INKWELL'] }] },
    { prompt: 'Promo for INKWELL, a 24-hour bookshop in Edinburgh with 80,000 second-hand books.' }).problems;
  assert.ok(!ok.some((p) => /not in the brief|brief calls it/.test(p)));
});

test('a caption loses wrapping quotes, a decade keeps its small s', () => {
  const f = normalize({ title: 'CASE 113', beats: [{ kind: 'card', words: ['1940S SHANGHAI'] }, { kind: 'card', words: ['NO ONE'] }, { kind: 'title', words: ['CASE 113'], sub: '"ALL EPISODES NOVEMBER 1"' }] }).film;
  assert.equal(f.beats[0].words.join(' '), '1940s SHANGHAI');
  assert.equal(f.beats.at(-1).sub, 'ALL EPISODES NOVEMBER 1');
});

test('the peak is the beat the Director meant, after its beats are merged or moved', () => {
  // two slams in a row merge: index 4 (the drop) is index 3 afterwards, and 4 would have been the title
  const beats = [{ kind: 'statement', words: ['A', 'B'] }, { kind: 'slams', words: ['ONE'] }, { kind: 'slams', words: ['TWO'] }, { kind: 'card', words: ['C'] }, { kind: 'drop', words: [] }, { kind: 'title', words: ['T'] }];
  const { film } = normalize({ title: 'T', beats, peak: 3 }, { duration: 10 });
  assert.equal(film.peak.beat, 'card');
  assert.equal(normalize({ title: 'T', beats }, { duration: 10 }).film.peak.beat, 'title'); // no peak: the title
});

test('a reveal with nothing named to show is a card', () => {
  const beats = [{ kind: 'statement', words: ['A', 'B'] }, { kind: 'reveal', words: ['THE CUP'] }, { kind: 'title', words: ['T'] }];
  assert.equal(normalize({ title: 'T', beats }).film.beats[1].kind, 'card');
  assert.equal(normalize({ title: 'T', beats, icons: ['coffee cup'] }).film.beats[1].kind, 'reveal');
});

test('a 15 s film needs five beats; a flat hook may become the reveal when there is a thing to show', async () => {
  const { applyPatch } = await import('../lib/plan.mjs');
  const beats = [{ kind: 'statement', words: ['VOICE', 'REVEALED'] }, { kind: 'slams', words: ['ONE', 'TWO'] }, { kind: 'card', words: ['C'] }, { kind: 'title', words: ['T'] }];
  assert.ok(normalize({ title: 'T', beats }, { duration: 15 }).problems.some((p) => /at least 5/.test(p)));
  assert.ok(!normalize({ title: 'T', beats }, { duration: 10 }).problems.some((p) => /at least/.test(p)));
  const { film } = normalize({ title: 'T', beats }, { duration: 10 });
  assert.equal(applyPatch(film, { beat: 'hook', field: 'kind', value: 'reveal' }).ok, false);   // nothing to show
  film.icons = [{ word: 'telescope', obj: 'icons/telescope.3d.png' }];
  assert.equal(applyPatch(film, { beat: 'hook', field: 'kind', value: 'reveal' }).film.beats[0].kind, 'reveal');
  assert.equal(applyPatch(film, { beat: 'hook', field: 'kind', value: 'card' }).ok, false);
});

test('a hook that was the title leaves too few beats; a line said twice; an end card without the brief date', () => {
  const brief = 'Trailer for RIDE THE ALPS, a 7-day cycling race over 21 passes. Registration opens May 1.';
  const beats = [{ kind: 'statement', words: ['RIDE', 'THE', 'ALPS'] }, { kind: 'world', words: ['21 PASSES', '7 DAYS'] }, { kind: 'slams', words: ['ONE BY ONE', 'ONE BY ONE'] },
    { kind: 'drop', words: ['THE CALL'] }, { kind: 'title', words: ['RIDE THE ALPS'] }];
  const p = normalize({ title: 'RIDE THE ALPS', beats }, { duration: 15, prompt: brief }).problems;
  assert.ok(p.some((x) => /at least 5/.test(x)), p.join('; '));
  assert.ok(p.some((x) => /repeats its own words/.test(x)));
  assert.ok(p.some((x) => /title has no sub/.test(x)));
});
