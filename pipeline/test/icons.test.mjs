import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pick3d } from '../lib/icons.mjs';

test('3D objects: the thing itself, never a symbol, a sad variant or a longer name', () => {
  assert.match(pick3d('fish'), /^Fish\//);
  assert.match(pick3d('flower'), /^Blossom\//);          // not "Wilted flower", not the "White flower" stamp
  assert.match(pick3d('pepper'), /^Hot pepper\//);       // one word more is fine
  assert.equal(pick3d('paper'), null);                   // "Roll of paper" was a toilet roll on LEDGERLY
  assert.equal(pick3d('lantern'), null);                 // "Jack-o-lantern" twice
  assert.equal(pick3d('ember'), null);                   // never "member"
  assert.equal(pick3d('bottle'), null);                  // "Baby bottle" was NOCTURNE's perfume
  assert.match(pick3d('glove'), /^Boxing glove\//);      // not the knitted "Gloves" (LAST ROUND)
  assert.equal(pick3d('ring'), null);                    // a diamond ring for a boxing ring
  assert.match(pick3d('espresso cup'), /^Hot beverage\//); // its noun's alias (LUNA ROSSA)
  assert.equal(pick3d('boxing ring'), null);             // an alias to nothing stays nothing
});

test('the things a brief names that exist in 3D, as a hint for the Director', async () => {
  const { briefThings } = await import('../lib/icons.mjs');
  assert.deepEqual(briefThings('Brand film for TIDE, a dive watch rated to 300 metres.'), ['watch']);
  assert.deepEqual(briefThings('a cozy game where you grow lost video game levels'), ['video game']); // two words first
  assert.deepEqual(briefThings('a documentary film, a new day'), []);                                  // not "Film frames"
});
