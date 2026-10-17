import { NextResponse, type NextRequest } from "next/server";
import { finish, tick } from "@/lib/server/queue";
import { ACTIVE, getJob, publicJob } from "@/lib/server/store";
import { stripe } from "@/lib/server/stripe";

// The red CUT button. Only the browser that created the job holds its owner token.
// A live pipeline learns about it from its next heartbeat ({ stop: true }) and shuts itself down.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/jobs/[id]/cancel">) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (req.headers.get("x-owner-token") !== job.owner)
    return NextResponse.json({ error: "Only the person who started this trailer can stop it." }, { status: 403 });

  if (!ACTIVE.includes(job.status)) return NextResponse.json(publicJob(job));
  // Closed the payment sheet: expire the Checkout Session too, so it can no longer be paid.
  if (job.status === "awaiting_payment" && job.checkoutSessionId)
    await stripe()
      .checkout.sessions.expire(job.checkoutSessionId)
      .catch(() => {}); // already paid or expired: nothing to undo
  const cut = await finish(job, "canceled");
  await tick(); // the freed slot goes to the next job in line
  return NextResponse.json(publicJob(cut));
}
