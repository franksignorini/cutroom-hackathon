import { NextResponse, type NextRequest } from "next/server";
import { finish, tick } from "@/lib/server/queue";
import { getJob, publicJob } from "@/lib/server/store";

// Called once by pipeline.mjs at the end of a run: { ok: true, video, poster } or { ok: false, error }.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/jobs/[id]/done">) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job || req.headers.get("x-job-token") !== job.token)
    return NextResponse.json({ error: "Unknown job or bad token" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { ok?: boolean; video?: string; poster?: string; error?: string };
  if (job.status !== "running") return NextResponse.json(publicJob(job)); // already cut or reaped
  const done = body.ok
    ? await finish(job, "done", { video: body.video, poster: body.poster })
    : await finish(job, "failed", { error: body.error?.slice(0, 300) ?? "The pipeline reported an error." });
  await tick();
  return NextResponse.json(publicJob(done));
}
