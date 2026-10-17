import "server-only";

// The few Redis commands the job system needs. Upstash Redis over REST when configured (shared by every serverless
// instance), otherwise process memory (one `next dev` / `next start` process).

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  /** SET NX PX: true when the key was free and is now ours (a lock). */
  claim(key: string, ttlMs: number): Promise<boolean>;
  del(key: string): Promise<void>;
  rpush(key: string, value: string): Promise<void>;
  lrange(key: string): Promise<string[]>;
  lrem(key: string, value: string): Promise<void>;
  sadd(key: string, value: string): Promise<void>;
  srem(key: string, value: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
}

function upstash(url: string, token: string): KV {
  const cmd = async (...args: (string | number)[]) => {
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`Upstash ${args[0]} failed: ${r.status}`);
    return ((await r.json()) as { result: unknown }).result;
  };
  return {
    get: async (k) => ((await cmd("GET", k)) as string | null) ?? null,
    set: async (k, v, ttl) => void (ttl ? await cmd("SET", k, v, "EX", ttl) : await cmd("SET", k, v)),
    claim: async (k, ms) => (await cmd("SET", k, "1", "NX", "PX", ms)) === "OK",
    del: async (k) => void (await cmd("DEL", k)),
    rpush: async (k, v) => void (await cmd("RPUSH", k, v)),
    lrange: async (k) => ((await cmd("LRANGE", k, 0, -1)) as string[]) ?? [],
    lrem: async (k, v) => void (await cmd("LREM", k, 0, v)),
    sadd: async (k, v) => void (await cmd("SADD", k, v)),
    srem: async (k, v) => void (await cmd("SREM", k, v)),
    smembers: async (k) => ((await cmd("SMEMBERS", k)) as string[]) ?? [],
  };
}

interface Mem {
  strings: Map<string, { v: string; exp: number }>;
  lists: Map<string, string[]>;
  sets: Map<string, Set<string>>;
}

function memory(): KV {
  const g = globalThis as { __cutroomKV?: Mem };
  const m: Mem = (g.__cutroomKV ??= { strings: new Map(), lists: new Map(), sets: new Map() });
  const live = (k: string) => {
    const e = m.strings.get(k);
    if (e && e.exp && e.exp < Date.now()) m.strings.delete(k);
    return m.strings.get(k);
  };
  const list = (k: string): string[] => m.lists.get(k) ?? (m.lists.set(k, []), m.lists.get(k)!);
  const set = (k: string): Set<string> => m.sets.get(k) ?? (m.sets.set(k, new Set()), m.sets.get(k)!);
  return {
    get: async (k) => live(k)?.v ?? null,
    set: async (k, v, ttl) => void m.strings.set(k, { v, exp: ttl ? Date.now() + ttl * 1000 : 0 }),
    claim: async (k, ms) => {
      if (live(k)) return false;
      m.strings.set(k, { v: "1", exp: Date.now() + ms });
      return true;
    },
    del: async (k) => void m.strings.delete(k),
    rpush: async (k, v) => void list(k).push(v),
    lrange: async (k) => [...list(k)],
    lrem: async (k, v) => void m.lists.set(k, list(k).filter((x) => x !== v)),
    sadd: async (k, v) => void set(k).add(v),
    srem: async (k, v) => void set(k).delete(v),
    smembers: async (k) => [...set(k)],
  };
}

let kv: KV | undefined;

export function getKV(): KV {
  if (kv) return kv;
  // `stripe projects add upstash/redis` writes the credentials with the resource's prefix (repo root .env, read by
  // next.config.ts): take UPSTASH_REDIS_REST_URL / _TOKEN, UPSTASH_REST_URL / _TOKEN, or any UPSTASH…REST_URL /
  // UPSTASH…REST_TOKEN — never the READ_ONLY token, which can't write.
  const find = (suffix: string) =>
    process.env[`UPSTASH_REDIS_${suffix}`] ||
    process.env[`UPSTASH_${suffix}`] ||
    Object.entries(process.env).find(([k, v]) => k.startsWith("UPSTASH") && k.endsWith(suffix) && !k.includes("READ_ONLY") && v)?.[1];
  const url = find("REST_URL");
  const token = find("REST_TOKEN");
  kv = url && token ? upstash(url, token) : memory();
  return kv;
}
