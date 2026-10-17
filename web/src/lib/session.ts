// The trailer this browser tab started, so a refresh re-opens it. `owner` is the token that allows CUT.
const KEY = "cutroom:job";

export interface JobSession {
  id: string;
  owner?: string;
}

export function readSession(): JobSession | null {
  try {
    const v = sessionStorage.getItem(KEY);
    return v ? (JSON.parse(v) as JobSession) : null;
  } catch {
    return null;
  }
}

export function writeSession(s: JobSession) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // private mode or storage disabled: the job still runs, a refresh just won't find it
  }
}

export function clearSession(id?: string) {
  try {
    if (!id || readSession()?.id === id) sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
