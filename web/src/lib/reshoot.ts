// "Re-shoot on Premium": the Premiere of a Free trailer hands its prompt to the composer on the home page. Through
// sessionStorage, not the URL, so a visitor's prompt never ends up in a link, a history entry or a server log.
const KEY = "cutroom:reshoot";

export function writeReshoot(prompt: string) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ prompt, at: Date.now() }));
  } catch {}
}

/** The prompt to re-shoot, once (it is removed when read), if it was left in the last 10 minutes. */
export function takeReshoot(): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    const v = raw ? (JSON.parse(raw) as { prompt?: string; at?: number }) : null;
    return v?.prompt && Date.now() - (v.at ?? 0) < 10 * 60_000 ? v.prompt : null;
  } catch {
    return null;
  }
}
