// Photos for the film: the Director may ask for a real photo under up to two beats (a place, a landscape, a texture), the
// studio fetches one from Pixabay (free Content License, https://pixabay.com/api/docs/) into photos/, and the film page
// grades it into the film's colours under the words: the photo is a material the code works, like the icons.
// Pixabay's terms: an API key (PIXABAY_API_KEY; without it no photos, the film is as before), results cached for 24 h,
// images downloaded (never hotlinked), and the viewer told where they come from (the film credits the photographer).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://pixabay.com/api/';
const DAY = 24 * 3600 * 1000;

/** The best hit for a film ground: landscape, big enough for 1080p, then the one whose tags hold the most words of the
 *  search, in Pixabay's own order on a tie. "The most liked" put a Christmas gift box under a luxury collar's "gold tag
 *  velvet" (HOUND & HEIRLOOM, 2026-10-17). */
export function pickPhoto(hits, query = '', used = new Set()) {
  // never a photo the film already shows: HOUND & HEIRLOOM's world and drop both asked for "leather dog collar" and showed
  // the same dog twice (2026-10-17)
  const ok = (h) => h && !used.has(h.id) && h.largeImageURL && (h.imageWidth ?? 0) >= 1600 && (h.imageWidth ?? 0) >= (h.imageHeight ?? 0) * 1.3;
  const words = String(query).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const score = (h) => { const tags = String(h.tags ?? '').toLowerCase(); return words.filter((w) => tags.includes(w)).length; };
  return (hits ?? []).filter(ok).map((h, i) => [score(h), i, h]).sort((a, b) => b[0] - a[0] || a[1] - b[1])[0]?.[2] ?? null;
}

/** [{ beat, query }] -> [{ beat, query, file, user, page, id }] written to <dir>/photos/. A query with no hit is skipped. */
export async function fetchPhotos(asks, { key, cacheDir, writeFile, onCmd = () => {}, timeoutMs = 10_000, used = new Set() } = {}) {
  if (!key || !asks.length) return [];
  if (cacheDir) mkdirSync(cacheDir, { recursive: true });
  const out = [];
  for (const { beat, query } of asks) {
    try {
      const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const cached = cacheDir && join(cacheDir, `${slug}.json`);
      let hits;
      if (cached && existsSync(cached)) {
        const c = JSON.parse(readFileSync(cached, 'utf8'));
        if (Date.now() - c.at < DAY) hits = c.hits;                   // Pixabay asks for a 24 h cache of every search
      }
      if (!hits) {
        onCmd(`GET pixabay.com/api/?q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal`);
        const url = `${API}?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal&safesearch=true&min_width=1600&per_page=20`;
        const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (!r.ok) continue;
        hits = (await r.json()).hits ?? [];
        if (cached) writeFileSync(cached, JSON.stringify({ at: Date.now(), hits }));
      }
      const h = pickPhoto(hits, query, used);
      if (!h) continue;
      onCmd(`GET ${new URL(h.largeImageURL).host}/…/${h.id}_1280.jpg`);
      const img = await fetch(h.largeImageURL, { signal: AbortSignal.timeout(timeoutMs) }).catch(() => null);
      const buf = img?.ok ? Buffer.from(await img.arrayBuffer()) : null;
      if (!buf || buf.readUInt16BE(0) !== 0xffd8 && buf.readUInt32BE(0) !== 0x89504e47) continue; // a JPEG or PNG, not an error page
      const file = `photos/${beat}-${h.id}.${buf.readUInt16BE(0) === 0xffd8 ? 'jpg' : 'png'}`;
      writeFile(file, buf);
      used.add(h.id);
      out.push({ beat, query, file, user: String(h.user ?? ''), page: String(h.pageURL ?? ''), id: h.id });
    } catch {}
  }
  return out;
}
