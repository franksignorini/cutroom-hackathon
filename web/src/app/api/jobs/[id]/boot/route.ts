import { type NextRequest } from "next/server";
import type { BootEvent, BootStepId } from "@/lib/boot";
import { bootSandbox, releaseSandbox } from "@/lib/server/createos";
import { getKV } from "@/lib/server/kv";
import { finish } from "@/lib/server/queue";
import { getJob, updateJob } from "@/lib/server/store";

// Boots the job's CreateOS sandbox and streams each step as NDJSON (see src/lib/boot.ts), for the boot screen the
// studio shows before it opens. Called once the job is running. A second caller (another tab, a refresh, React's dev
// double mount) joins the boot in flight instead of starting another, and once it is done gets the saved record.

interface Flight {
  events: BootEvent[];
  listeners: Set<(e: BootEvent) => void>;
}
const g = globalThis as unknown as { __cutroomBoots?: Map<string, Flight> };
const flights = (g.__cutroomBoots ??= new Map());

const LOCK = (id: string) => `cutroom:boot:${id}`;
const ended = (e: BootEvent) => e.type === "done" || e.type === "error";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/jobs/[id]/boot">) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
  if (job.boot) return stream([{ type: "done", boot: job.boot }]);
  if (job.status !== "running") return Response.json({ error: "This job is not running." }, { status: 409 });

  let flight = flights.get(id);
  if (!flight) {
    // Another server instance may be booting it: wait for its record instead of booting twice.
    if (!(await getKV().claim(LOCK(id), 60_000))) return stream(waitForRecord(id));
    const f: Flight = { events: [], listeners: new Set() };
    flights.set(id, f);
    flight = f;
    const emit = (e: BootEvent) => {
      f.events.push(e);
      for (const l of f.listeners) l(e);
    };
    const origin = new URL(req.url).origin;
    void bootSandbox(job, origin, emit)
      .then(async (boot) => {
        // simulate: the recorded run starts now, after the boot, not when the slot was granted. A real crew keeps its clock.
        const now = Date.now();
        const saved = await updateJob(id, { boot, sandboxId: boot.sandbox.id, heartbeatAt: now, ...(boot.eventsUrl ? { eventsUrl: boot.eventsUrl, previewUrl: boot.sandbox.previewUrl } : {}), ...(job.mode === "simulate" ? { startedAt: now } : {}) });
        // CUT (or a failure) landed while the sandbox was booting: nobody else will release it.
        if (saved && saved.status !== "running") await releaseSandbox(saved);
        emit({ type: "done", boot });
      })
      .catch(async (err: Error & { stepId?: BootStepId }) => {
        const message = err.message || "The sandbox did not start.";
        const fresh = await getJob(id);
        if (fresh?.status === "running") await finish(fresh, "failed", { error: `CreateOS: ${message}` });
        emit({ type: "error", message, id: err.stepId });
      })
      .finally(() => {
        void getKV().del(LOCK(id));
        setTimeout(() => flights.delete(id), 30_000);
      });
  }
  return stream(follow(flight));
}

async function* follow(f: Flight): AsyncGenerator<BootEvent> {
  const queue = [...f.events];
  let wake: (() => void) | undefined;
  const listen = (e: BootEvent) => {
    queue.push(e);
    wake?.();
  };
  f.listeners.add(listen);
  try {
    while (true) {
      while (queue.length) {
        const e = queue.shift()!;
        yield e;
        if (ended(e)) return;
      }
      await new Promise<void>((r) => (wake = r));
    }
  } finally {
    f.listeners.delete(listen);
  }
}

async function* waitForRecord(id: string): AsyncGenerator<BootEvent> {
  for (let i = 0; i < 100; i++) {
    const job = await getJob(id);
    if (job?.boot) return yield { type: "done", boot: job.boot };
    if (job && job.status !== "running") return yield { type: "error", message: job.error ?? "The job stopped." };
    await new Promise((r) => setTimeout(r, 300));
  }
  yield { type: "error", message: "The sandbox took too long to start." };
}

function stream(events: Iterable<BootEvent> | AsyncIterable<BootEvent>) {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const e of events) controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        controller.close();
      } catch {
        // the browser went away; the boot itself carries on and saves its record
      }
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
