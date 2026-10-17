import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unpackNotes } from '../lib/notes.mjs';

test('a note whose text is a JSON list of notes is unpacked', () => {
  const out = unpackNotes([{ text: '[{"beat":"drop","field":"sub","value":"NOW","text":"say NOW"},{"beat":"hook","field":"words","value":["A"],"text":"x"}]' }]);
  assert.equal(out.length, 2);
  assert.deepEqual([out[0].beat, out[0].field, out[0].value], ['drop', 'sub', 'NOW']);
});

test('a broken one (text without quotes, the blood donation film) still gives its fields', () => {
  const out = unpackNotes([{ text: '[{"beat": "drop", "field": "sub", "value": "NOW", "text": The drop frame shows the bag and GIVE but omits the planned NOW sub."}]' }]);
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].beat, out[0].field, out[0].value], ['drop', 'sub', 'NOW']);
  assert.match(out[0].text, /^The drop frame/);
});

test('ordinary notes pass through', () => {
  const n = { beat: 'hook', field: 'words', value: ['X'], text: '[sic] a bracket' };
  assert.deepEqual(unpackNotes([n, { text: 'plain words' }]), [n, { text: 'plain words' }]);
});
