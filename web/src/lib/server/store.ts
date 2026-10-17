import "server-only";
import { randomBytes } from "node:crypto";
import type { BootRecord } from "@/lib/boot";
import { getKV } from "./kv";

// Job records, kept for 7 days. Upstash Redis when configured, otherwise process memory (see kv.ts).

export type Preset = "free" | "milestone" | "launch";

/** free: OpenRouter's free models, no checkout. premium: the top model, paid through Checkout when PAYMENTS=on. */
export type Tier = "free" | "premium";

export type JobStatus =
  | "awaiting_payment"
  | "queued"
  | "running"
  | "done"
  | "failed" // the pipeline reported an error, or it stopped answering (see queue.ts)
  | "canceled" // the user pressed CUT
  | "abandoned"; // left the queue without anyone watching

export interface Job {
  id: string;
  prompt: string;
  preset: Preset;
  tier: Tier;
  duration: 10 | 15;
  format: "16:9"; // the only format: 16:9 plays everywhere, and one framing keeps the Builder's job simple
  effort: "medium" | "high"; // set by the tier, not picked: Free medium, Premium high
  mode: "live" | "local" | "simulate" | "replay";
  status: JobStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  heartbeatAt?: number; // live: the pipeline checks in every few seconds
  lastSeenAt?: number; // a browser polled this job (queued jobs nobody watches are dropped)
  error?: string;
  eventsUrl?: string; // live: the sandbox's ingress URL for /events (SSE)
  previewUrl?: string; // live: the sandbox's ingress URL for the film preview
  video?: string;
  poster?: string;
  sandboxId?: string;
  boot?: BootRecord; // the CreateOS boot, timed step by step (src/lib/server/createos.ts)
  checkoutSessionId?: string;
  // Secrets, never sent to the browser except `owner` to its creator:
  owner: string; // lets the creator's browser CUT the job
  token: string; // lets the sandbox pipeline report heartbeat/done
  ipHash?: string;
}

export const ACTIVE: JobStatus[] = ["awaiting_payment", "queued", "running"];

const KEY = (id: string) => `cutroom:job:${id}`;
const TTL = 60 * 60 * 24 * 7;

export async function saveJob(job: Job) {
  await getKV().set(KEY(job.id), JSON.stringify(job), TTL);
  return job;
}

export async function getJob(id: string): Promise<Job | undefined> {
  const raw = await getKV().get(KEY(id));
  return raw ? (JSON.parse(raw) as Job) : undefined;
}

export async function updateJob(id: string, patch: Partial<Job>) {
  const job = await getJob(id);
  if (!job) return undefined;
  return saveJob({ ...job, ...patch });
}

export function publicJob(job: Job) {
  return { ...job, owner: undefined, token: undefined, ipHash: undefined, checkoutSessionId: undefined };
}

export function newJobId() {
  return randomBytes(4).toString("hex");
}

export function secret() {
  return randomBytes(18).toString("base64url");
}
