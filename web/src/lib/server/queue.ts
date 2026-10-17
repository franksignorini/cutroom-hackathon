import "server-only";
import { createHash } from "node:crypto";
import { DEMO_POSTER, DEMO_TOTAL, DEMO_VIDEO } from "@/lib/demo-run";
import { releaseSandbox } from "./createos";
import { stopLocal } from "./local";
import { startPipeline } from "./jobs";
import { getKV } from "./kv";
import { ACTIVE, getJob, saveJob, type Job, type JobStatus } from "./store";

// One queue, a few running slots, no cron. Every request that touches a job calls tick(): it reaps dead jobs and
// starts the next ones. A Redis lock keeps two serverless instances from starting the same job twice.

const num = (v: string | undefined, d: number) => (v !== undefined && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : d);

export const LIMITS = {
  // Jobs running at once. Free CreateOS plan: one shared sandbox, the render is serialized inside it → 2.
  running: num(process.env.MAX_RUNNING, 2),
  // Jobs waiting for a slot. Beyond this, new requests get "the studio is full".
  waiting: num(process.env.MAX_QUEUE, 5),
  // Active jobs per IP (0 = no limit, handy when testing from one machine).
  perIp: num(process.env.PER_IP_LIMIT, 1),
  // A running live job that stops checking in for this long is declared dead.
  heartbeatSeconds: num(process.env.HEARTBEAT_TIMEOUT_S, 90),
  // Hard cap on any run, heartbeat or not.
  maxRunSeconds: num(process.env.MAX_RUN_S, 15 * 60),
  // A queued job nobody has polled for this long loses its spot (the tab was closed).
  abandonSeconds: num(process.env.ABANDON_S, 120),
  // Free trailers a day with a real crew (live/local). 4-6 requests each against the free model quotas.
  freeDaily: num(process.env.FREE_DAILY_CAP, 20),
  // Premium trailers per visitor (IP), ever: every one spends real model credits. 0 = no limit.
  premiumPerIp: num(process.env.PREMIUM_PER_IP, 15),
  // PIPELINE=simulate: replay speed, so a simulated run lasts DEMO_TOTAL / speed seconds.
  simSpeed: num(process.env.SIM_SPEED, 4),
};

const QUEUE = "cutroom:queue";
const RUNNING = "cutroom:running";
const LOCK = "cutroom:tick";
const IP = (h: string) => `cutroom:ip:${h}`;

export const simSeconds = () => DEMO_TOTAL / LIMITS.simSpeed;

export function hashIp(req: Request) {
  const raw = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  return createHash("sha256").update(`cutroom:${raw}`).digest("hex").slice(0, 24);
}

/** The active job already owned by this IP, if any. */
export async function activeJobForIp(ipHash: string) {
  const id = await getKV().get(IP(ipHash));
  const job = id ? await getJob(id) : undefined;
  return job && ACTIVE.includes(job.status) ? job : undefined;
}

export async function rememberIp(job: Job) {
  if (job.ipHash) await getKV().set(IP(job.ipHash), job.id, 60 * 60);
}

const PREMIUM_USED = (h: string) => `cutroom:premium:${h}`;

/** Premium trailers this IP has put in production, and how many it has left. */
export async function premiumQuota(ipHash: string) {
  const used = Number((await getKV().get(PREMIUM_USED(ipHash))) ?? 0);
  const cap = LIMITS.premiumPerIp;
  return { used, cap, left: cap > 0 ? Math.max(0, cap - used) : null };
}

export async function queueLength() {
  return (await getKV().lrange(QUEUE)).length;
}

/** Puts a job in line, once. Two polls of a paid Premium job (or the webhook and a poll) both see "paid" and both get
 *  here: without the claim the second one, landing after the start, flipped the job back to queued and a second crew
 *  ran the same job (2026-10-16). */
export async function enqueue(job: Job) {
  const kv = getKV();
  if (!(await kv.claim(`cutroom:enqueued:${job.id}`, 60 * 60 * 1000))) return;
  const current = await getJob(job.id);
  if (current && !["awaiting_payment", "queued"].includes(current.status)) return;
  await saveJob({ ...(current ?? job), status: "queued", lastSeenAt: Date.now() });
  // A Premium trailer counts once it is paid for and in line, so an abandoned Checkout costs the visitor nothing.
  if (job.tier === "premium" && job.ipHash) {
    const { used } = await premiumQuota(job.ipHash);
    await kv.set(PREMIUM_USED(job.ipHash), String(used + 1), 60 * 60 * 24 * 365);
  }
  await kv.rpush(QUEUE, job.id);
  await tick();
}

/** 1-based position in the queue (0 = not queued) and a rough wait. */
export async function position(id: string) {
  const q = await getKV().lrange(QUEUE);
  const i = q.indexOf(id);
  if (i < 0) return { position: 0, etaSeconds: 0 };
  const perJob = 7 * 60;
  return { position: i + 1, etaSeconds: Math.ceil((i + 1) / LIMITS.running) * perJob };
}

export async function finish(job: Job, status: JobStatus, patch: Partial<Job> = {}) {
  const kv = getKV();
  const saved = await saveJob({ ...job, ...patch, status, finishedAt: Date.now() });
  await kv.srem(RUNNING, job.id);
  await kv.lrem(QUEUE, job.id);
  await releaseSandbox(saved);
  if (job.mode === "local" && status !== "done") stopLocal(job.id);
  return saved;
}

export async function tick() {
  const kv = getKV();
  if (!(await kv.claim(LOCK, 10_000))) return;
  try {
    const now = Date.now();

    // 1. Running jobs: finished simulations, dead pipelines, runaway runs.
    for (const id of await kv.smembers(RUNNING)) {
      const job = await getJob(id);
      if (!job || job.status !== "running") {
        await kv.srem(RUNNING, id);
        continue;
      }
      const ranFor = (now - (job.startedAt ?? now)) / 1000;
      if (job.mode === "simulate") {
        if (ranFor >= simSeconds()) await finish(job, "done", { video: DEMO_VIDEO, poster: DEMO_POSTER });
      } else if (ranFor > LIMITS.maxRunSeconds) {
        await finish(job, "failed", { error: "The run went past its time limit and was stopped." });
      } else if ((now - (job.heartbeatAt ?? job.startedAt ?? now)) / 1000 > LIMITS.heartbeatSeconds) {
        await finish(job, "failed", { error: "Lost contact with the sandbox." });
      }
    }

    // 2. Queue: drop jobs that are gone, not queued any more, or that nobody is watching.
    for (const id of await kv.lrange(QUEUE)) {
      const job = await getJob(id);
      if (!job || job.status !== "queued") await kv.lrem(QUEUE, id);
      else if ((now - (job.lastSeenAt ?? job.createdAt)) / 1000 > LIMITS.abandonSeconds) await finish(job, "abandoned");
    }

    // 3. Start the next jobs while there are free slots.
    let running = (await kv.smembers(RUNNING)).length;
    while (running < LIMITS.running) {
      const [id] = await kv.lrange(QUEUE);
      if (!id) break;
      await kv.lrem(QUEUE, id);
      const job = await getJob(id);
      if (!job || job.status !== "queued") continue;
      if (!(await kv.claim(`cutroom:started:${id}`, 60 * 60 * 1000))) continue; // a job's crew starts once, ever
      const started = await saveJob({ ...job, status: "running", startedAt: Date.now(), heartbeatAt: Date.now() });
      await kv.sadd(RUNNING, id);
      running++;
      try {
        await startPipeline(started);
      } catch (err) {
        await finish(started, "failed", { error: (err as Error).message });
        running--;
      }
    }
  } finally {
    await kv.del(LOCK);
  }
}
