import { NextResponse, type NextRequest } from "next/server";
import { DEMO_JOB } from "@/lib/demo-run";
import { enqueue, position, simSeconds, tick } from "@/lib/server/queue";
import { getJob, publicJob, updateJob } from "@/lib/server/store";
import { stripe } from "@/lib/server/stripe";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  if (id === "demo") return NextResponse.json({ ...DEMO_JOB, mode: "replay", status: "running" });

  let job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Back from Checkout before the webhook landed (or no webhook forwarding in dev): ask Stripe directly.
  if (job.status === "awaiting_payment" && job.checkoutSessionId) {
    const session = await stripe().checkout.sessions.retrieve(job.checkoutSessionId);
    if (session.payment_status === "paid") await enqueue(job);
  }

  // Someone is watching this queued job: keep its spot.
  if (job.status === "queued") await updateJob(id, { lastSeenAt: Date.now() });

  await tick();
  job = (await getJob(id))!;

  return NextResponse.json({
    ...publicJob(job),
    ...(await position(id)),
    elapsed: job.startedAt ? ((job.finishedAt ?? Date.now()) - job.startedAt) / 1000 : 0,
    simSeconds: job.mode === "simulate" ? simSeconds() : undefined,
  });
}
