// The Critic's notes as the pipeline can apply them, however a model wrote them.

/** A note whose text is the whole notes list (Nemotron on the blood donation film, 2026-10-16: one note with no field
 *  whose text was `[{"beat": "drop", "field": "sub", "value": "NOW", "text": The drop frame...}]`, not even valid
 *  JSON) becomes the real notes; every other note passes through. */
export function unpackNotes(notes) {
  return (notes ?? []).flatMap((n) => {
    if (!n || n.field || typeof n.text !== 'string' || !/^\s*[[{]/.test(n.text)) return [n];
    try {
      const inner = JSON.parse(n.text);
      const list = (Array.isArray(inner) ? inner : [inner]).filter((x) => x && typeof x === 'object' && x.field);
      if (list.length) return list;
    } catch {}
    // not JSON: the fields one by one ("text" may have lost its quotes)
    const get = (k) => new RegExp(`"${k}"\\s*:\\s*"([^"]*)"`).exec(n.text)?.[1];
    if (!get('field')) return [n];
    const text = /"text"\s*:\s*"?([^"\]}]*)/.exec(n.text)?.[1]?.trim();
    return [{ beat: get('beat'), field: get('field'), value: get('value'), text: text || n.text }];
  });
}
