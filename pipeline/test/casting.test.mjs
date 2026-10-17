import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOOKS, cast, castingText } from '../lib/casting.mjs';
import { contrast, normalize } from '../lib/plan.mjs';

test('every look passes the plan checks', () => {
  for (const l of LOOKS) {
    assert.ok(contrast(l.ground, l.text) >= 7, `${l.name}: text ${contrast(l.ground, l.text).toFixed(2)}`);
    assert.ok(contrast(l.ground, l.accent) >= 3.5, `${l.name}: accent ${contrast(l.ground, l.accent).toFixed(2)}`);
  }
});

test('the draw is stable per seed and varies across seeds', () => {
  assert.deepEqual(cast('abc'), cast('abc'));
  const seen = new Set([...Array(40)].map((_, i) => cast(`job${i}`).looks[0].name));
  assert.ok(seen.size >= 8, `only ${seen.size} different first looks in 40 jobs`);
  assert.match(castingText(cast('x')), /Shape:/);
});

test('a plan without a look takes the draw, a light ground keeps dark text', () => {
  const c = cast('seed1');
  const beats = [{ kind: 'statement', words: ['A', 'B'] }, { kind: 'card', words: ['C'] }, { kind: 'title', words: ['T'] }];
  const { film } = normalize({ title: 'T', beats }, { casting: c });
  assert.equal(film.look.ground, c.looks[0].ground);
  assert.equal(film.look.layout, c.layout);
  const light = normalize({ title: 'T', beats, look: { ground: '#F1ECE2', text: '#EEEEEE', accent: '#D42A18' } }, { casting: c }).film;
  assert.equal(light.look.ground, '#F1ECE2');
  assert.equal(light.look.text, '#121212');
});

test('words sent as JSON text are parsed, in a plan and in a Critic patch', async () => {
  const { applyPatch } = await import('../lib/plan.mjs');
  const beats = [{ kind: 'statement', words: ['A', 'B'] }, { kind: 'world', words: ['["IT NEVER","REACHES THE ISLAND"]'] }, { kind: 'title', words: ['T'] }];
  const { film } = normalize({ title: 'T', beats });
  assert.deepEqual(film.beats[1].words, ['IT NEVER', 'REACHES THE ISLAND']);
  const patched = applyPatch(film, { beat: 'world', field: 'words', value: '["THE DECK","IS WET"]' }).film;
  assert.deepEqual(patched.beats[1].words, ['THE DECK', 'IS WET']);
});

test('slams get time to read, and the title keeps the longest hold', () => {
  const beats = [{ kind: 'statement', words: ['A', 'B'] }, { kind: 'world', words: ['W'] }, { kind: 'card', words: ['C'] }, { kind: 'slams', words: ['ONE', 'TWO', 'THREE', 'FOUR'] }, { kind: 'drop', words: ['X'] }, { kind: 'title', words: ['T'] }];
  const { film } = normalize({ title: 'T', bpm: 85, beats }, { duration: 10 });
  const slams = film.beats.find((b) => b.kind === 'slams'), title = film.beats.at(-1);
  assert.ok(slams.dur >= 1.8 - 1e-9, `slams ${slams.dur}`);
  assert.ok(title.dur >= 2.1, `title ${title.dur}`);
  assert.ok(Math.abs(film.duration - 10) < 0.5, `total ${film.duration}`);
});
