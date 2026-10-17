import { NextResponse, type NextRequest } from "next/server";
import { getJob, updateJob } from "@/lib/server/store";

// Called by pipeline.mjs inside the sandbox every ~15 s. A job that stops calling is reaped by the queue
// (HEARTBEAT_TIMEOUT_S). The answer tells the pipeline to stop when the user pressed CUT or the job was reaped.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/jobs/[id]/heartbeat">) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job || req.headers.get("x-job-token") !== job.token)
    return NextResponse.json({ error: "Unknown job or bad token" }, { status: 403 });
  if (job.status !== "running") return NextResponse.json({ stop: true, status: job.status });
  await updateJob(id, { heartbeatAt: Date.now() });
  return NextResponse.json({ stop: false });
}
