import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPhoto } from '../lib/photos.mjs';
import { normalize } from '../lib/plan.mjs';

test('a photo for a film ground: landscape and big, its tags closest to the search', () => {
  const hits = [
    { id: 1, largeImageURL: 'a', imageWidth: 4000, imageHeight: 6000, likes: 900 },   // portrait
    { id: 2, largeImageURL: 'b', imageWidth: 1200, imageHeight: 800, likes: 800 },    // too small
    { id: 3, largeImageURL: 'c', imageWidth: 5000, imageHeight: 3000, likes: 10 },
    { id: 4, largeImageURL: 'd', imageWidth: 6000, imageHeight: 4000, likes: 50 },
  ];
  assert.equal(pickPhoto(hits).id, 3);                                                  // no search: Pixabay's order
  const tagged = [{ id: 7, largeImageURL: 'g', imageWidth: 5000, imageHeight: 3000, tags: 'box, gift, present, xmas', likes: 999 },
    { id: 8, largeImageURL: 'h', imageWidth: 5000, imageHeight: 3000, tags: 'gold, tag, jewellery', likes: 3 }];
  assert.equal(pickPhoto(tagged, 'gold tag velvet').id, 8);
  assert.equal(pickPhoto(tagged, 'gold tag velvet', new Set([8])).id, 7);                // the film already shows it
  assert.equal(pickPhoto([]), null);
});

test('photos: the Director decides beat by beat, never on the title, a short clean search', () => {
  const beats = [{ kind: 'statement', words: ['A', 'B'], photo: 'misty "alpine" road!' }, { kind: 'world', words: ['W'], photo: 'opera stage' },
    { kind: 'card', words: ['C'], photo: 'third' }, { kind: 'drop', words: [], photo: 'x' }, { kind: 'title', words: ['T'], photo: 'y' }];
  const f = normalize({ title: 'T', beats }, { duration: 10 }).film;
  assert.deepEqual(f.beats.map((b) => b.photo ?? null), ['misty alpine road', 'opera stage', 'third', 'x', null]);
});

test("the Critic changes a beat's picture: a new search, or none for drawn; never the title", async () => {
  const { applyPatch } = await import('../lib/plan.mjs');
  const beats = [{ kind: 'statement', words: ['A', 'B'], photo: 'gift box' }, { kind: 'card', words: ['C'] }, { kind: 'title', words: ['T'] }];
  const f = normalize({ title: 'T', beats }, { duration: 10 }).film;
  assert.equal(applyPatch(f, { beat: 'hook', field: 'photo', value: 'gold buckle' }).film.beats[0].photo, 'gold buckle');
  assert.equal(applyPatch(f, { beat: 'hook', field: 'photo', value: 'none' }).film.beats[0].photo, undefined);
  assert.equal(applyPatch(f, { beat: 'title', field: 'photo', value: 'x' }).ok, false);
});

test('a photo-led film: a photo on every beat but the title, the drop included, no icons, no reveal', () => {
  const beats = [{ kind: 'statement', words: ['A', 'B'], photo: 'gold buckle' }, { kind: 'reveal', words: ['W'], photo: 'leather' },
    { kind: 'card', words: ['C'], photo: 'hound' }, { kind: 'drop', words: [], photo: 'estate' }, { kind: 'title', words: ['T'], photo: 'y' }];
  const f = normalize({ title: 'T', beats, icons: ['dog'] }, { duration: 10, photos: 'all' }).film;
  assert.deepEqual(f.beats.map((b) => b.photo ?? null), ['gold buckle', 'leather', 'hound', 'estate', null]);
  assert.deepEqual(f.iconWords, []);
  assert.equal(f.beats[1].kind, 'card');
});
