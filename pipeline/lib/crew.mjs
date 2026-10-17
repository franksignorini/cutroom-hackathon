// The crew's files: what each agent wrote and did, as markdown the viewer reads next to the finished film
// (crew/DIRECTOR.md, BUILDER.md, CRITIC.md, SOUND.md in the workspace; a `crew` event for the studio page).
// The words in quotes are the agents' own (the Director's treatment, the Builder's note, the Critic's summary and
// notes); the rest is the record of what they did. Sound has no model: its file says so.

const head = (file, who, model, extra = '') =>
  `# ${file}\n\n> **${who}**${model ? ` · \`${model}\`` : ''}${extra ? ` · ${extra}` : ''}\n`;
const quote = (s) => String(s).trim().split('\n').map((l) => `> ${l}`).join('\n');

export function directorMd(film, { model, casting } = {}) {
  const lines = [head('DIRECTOR.md', 'Director', model, `${film.duration} s · ${film.bpm} BPM`)];
  lines.push(`## ${film.title}\n\n${film.statement}\n`);
  if (film.treatment) lines.push(`## Treatment\n\n${quote(film.treatment)}\n`);
  if (film.story?.core) {
    lines.push('## Story');
    lines.push(`- **Core:** ${film.story.core}`);
    if (film.story.line) lines.push(`- **Peak line:** ${film.story.line}`);
    if (film.story.obvious) lines.push(`- **The obvious version I avoided:** ${film.story.obvious}`);
    if (film.story.technique?.length) lines.push(`- **Technique:** ${film.story.technique.join(', ')}`);
    lines.push('');
  }
  lines.push('## Decisions');
  lines.push(`- **Type:** ${film.kind} · **peak:** ${film.family}, on \`${film.peak.beat}\` at ${film.peak.t.toFixed(1)} s`);
  lines.push(`- **Device:** ${film.device}`);
  lines.push(`- **Look:** ground \`${film.look.ground}\` · text \`${film.look.text}\` · accent \`${film.look.accent}\` · grade ${film.look.grade} · layout ${film.look.layout ?? 'centre'}`);
  lines.push(`- **Type:** ${film.type.roles.map((r) => `${r.face} (${r.job})`).join(' + ')}`);
  lines.push(`- **Music:** ${film.music.mood}, ${film.music.key} minor, ${film.music.palette}`);
  if (film.icons?.length) lines.push(`- **Icons fetched:** ${film.icons.map((i) => [i.id && `${i.word} → \`${i.id}\` (${i.license}, Iconify)`, i.obj && `${i.word} → 3D \`${i.objName}\` (MIT, Fluent Emoji)`].filter(Boolean).join(' · ')).join(' · ')}`);
  if (casting) lines.push(`- **Casting draw offered:** ${casting.looks.map((l) => l.name).join(' / ')} · shape "${casting.shape.name}"`);
  lines.push('\n## Shot list');
  for (const b of film.beats) {
    lines.push(`${film.beats.indexOf(b) + 1}. \`${b.name}\` · ${b.kind}${b.fallback ? ` (from ${b.fallback})` : ''} · ${b.t.toFixed(1)}–${(b.t + b.dur).toFixed(1)} s · **${b.words.join(' ') || '(no words)'}**${b.sub ? ` / ${b.sub}` : ''}${b.air ? ` · air ${b.air}` : ''}`);
    if (b.image) lines.push(`   - ${b.image}`);
  }
  return `${lines.join('\n')}\n`;
}

/** shots: [{ name, kind, note, code, attempts, errors: [], kept }] — kept: the hand-written shot is in the film. */
export function builderMd(shots, { model } = {}) {
  const lines = [head('BUILDER.md', 'Builder', model, `${shots.length} shot${shots.length === 1 ? '' : 's'} by hand`)];
  if (!shots.length) lines.push('Every shot comes from a recipe this time.\n');
  for (const s of shots) {
    lines.push(`## shots/${s.name}.js`);
    lines.push(`${s.kept ? '✓ in the film' : `✗ kept the ${s.kind} recipe`} · ${s.attempts} attempt${s.attempts === 1 ? '' : 's'}${s.code ? ` · ${s.code.split('\n').length} lines` : ''}\n`);
    if (s.note) lines.push(`${quote(s.note)}\n`);
    if (s.errors.length) {
      lines.push('What the studio sent back:');
      for (const e of s.errors) lines.push(`- ${e}`);
      lines.push('');
    }
    if (s.code) lines.push('```js\n' + s.code.trim() + '\n```\n');
  }
  return `${lines.join('\n')}\n`;
}

/** review: { summary, score, notes: [{ n, text, beat, field, value, status }], secondLook } */
export function criticMd(review, { model } = {}) {
  const lines = [head('CRITIC.md', 'Critic', model, review.score != null ? `${review.score}/10` : '')];
  if (review.skipped) return `${lines.join('\n')}\nNo review this time: ${review.skipped}\n`;
  if (review.summary) lines.push(`${quote(review.summary)}\n`);
  lines.push('## Notes');
  if (!review.notes?.length) lines.push('Signed off without notes.');
  for (const n of review.notes ?? []) {
    const what = n.field && n.field !== 'note' ? `${n.beat ? `\`${n.beat}\` ` : ''}${n.field} → ${typeof n.value === 'string' ? n.value : JSON.stringify(n.value)} · ` : '';
    lines.push(`${n.n}. ${n.text ?? ''}\n   - ${what}**${n.status}**`);
  }
  if (review.secondLook) lines.push(`\n## Second look\n\n${quote(review.secondLook)}`);
  return `${lines.join('\n')}\n`;
}

export function soundMd(film, sound) {
  const lines = [head('SOUND.md', 'Sound', '', 'no model: the score is computed from the plan')];
  lines.push(`${film.music.palette} palette · ${film.family} peak · ${film.music.key} minor · ${film.bpm} BPM\n`);
  lines.push(`The hit lands on \`${film.peak.beat}\` at ${film.peak.t.toFixed(2)} s, after a silence. Cue sheet:\n`);
  const counts = {};
  for (const c of sound.cues) counts[c.inst ?? c.type] = (counts[c.inst ?? c.type] ?? 0) + 1;
  lines.push('```');
  for (const c of sound.cues.slice(0, 60)) lines.push(`${c.t.toFixed(2).padStart(6)}s  ${String(c.inst ?? c.type).padEnd(12)}${c.notes ? ` ${c.notes.length} note${c.notes.length === 1 ? '' : 's'}` : ''}${c.dur ? ` ${(+c.dur).toFixed(2)}s` : ''}`);
  if (sound.cues.length > 60) lines.push(`… ${sound.cues.length - 60} more`);
  lines.push('```');
  lines.push(`\n${Object.entries(counts).map(([k, v]) => `${k} ×${v}`).join(' · ')}`);
  return `${lines.join('\n')}\n`;
}
