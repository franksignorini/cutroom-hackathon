#!/usr/bin/env node
// Builds pipeline/lib/fluent3d.json: every Microsoft Fluent Emoji with a 3D render (MIT, github.com/microsoft/fluentui-emoji),
// name -> its 3D PNG path in the repo. The pipeline matches the things the Director names against these names and
// fetches only the PNGs it needs. One GitHub API call (no key; 60 an hour per IP), run again when the set changes.
//
//   node tools/fluent3d-index.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const r = await fetch('https://api.github.com/repos/microsoft/fluentui-emoji/git/trees/main?recursive=1', { headers: { 'user-agent': 'cutroom' } });
if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
const tree = await r.json();
if (tree.truncated) throw new Error('the tree came back truncated');
const index = {};
for (const { path } of tree.tree) {
  // assets/<Name>/3D/<file>.png, or assets/<Name>/Default/3D/<file>.png for the emoji that have skin tones
  const m = /^assets\/([^/]+)\/(?:Default\/)?3D\/[^/]+\.png$/.exec(path);
  if (m) index[m[1].toLowerCase()] = path.slice('assets/'.length);
}
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'pipeline', 'lib', 'fluent3d.json');
writeFileSync(out, JSON.stringify(index));
console.log(`${Object.keys(index).length} 3D objects -> ${out}`);
