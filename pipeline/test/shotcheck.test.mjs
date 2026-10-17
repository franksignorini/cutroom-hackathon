import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import { typedWords } from '../lib/shotcheck.mjs';

const beat = { words: ['THE', 'LAUNDROMAT'], sub: 'NAPLES' };

test('words typed as text are caught', () => {
  assert.deepEqual(typedWords(`k.text(g, 'THE LAUNDROMAT', 0, 0, {}); k.text(g, "NAPLES", 0, 0, {});`, beat), ['LAUNDROMAT', 'NAPLES']);
});

test('words read from k.beat, destructured or quoted in comments pass', () => {
  assert.deepEqual(typedWords('const { words, sub } = k.beat; // "THE LAUNDROMAT"\nk.text(g, words.join(" "), 0, 0, {});', beat), []);
  assert.deepEqual(typedWords('const w = k.beat.words; /* LAUNDROMAT */ g.font = `800 ${s}px Inter`;', beat), []);
});

test('the real shots that read their words pass (KELP was rejected 6 times by a broken check)', () => {
  const dir = `${process.env.ENGINE_DIR || '../cinematic-studio'}/projects/cutroom-lighthouse2/out/debug`;
  if (!existsSync(dir)) return;
  const film = JSON.parse(readFileSync(`${dir}/../../film.json`, 'utf8'));
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.attempt3.js'))) {
    const b = film.beats.find((x) => x.name === f.split('.')[0]);
    assert.deepEqual(typedWords(readFileSync(`${dir}/${f}`, 'utf8'), b), [], f);
  }
});

test('canvas keywords are not typed words (LIGHTHOUSE 47: textAlign = "left" vs "NO ONE LEFT TO WATCH")', () => {
  const beat = { words: ['NO ONE LEFT TO WATCH'], sub: 'TOP SECRET' };
  assert.deepEqual(typedWords("g.textAlign = 'left'; g.textBaseline = 'top'; k.text(g, k.beat.words[0], 0, 0);", beat), []);
  assert.deepEqual(typedWords("k.text(g, 'NO ONE LEFT', 0, 0);", beat), ['LEFT']);
});
