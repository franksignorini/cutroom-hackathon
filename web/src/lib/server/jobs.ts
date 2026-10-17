import "server-only";
import { createosKey } from "./createos";
import { startLocal } from "./local";
import { updateJob, type Job } from "./store";

// PIPELINE decides what a job is:
//   replay   (default) no jobs at all: "Roll camera" opens the recorded run at /jobs/demo
//   simulate full job system (queue, limits, CUT, session restore) with the recorded run as the "pipeline"
//   local    full job system with the real crew (pipeline/pipeline.mjs) running on this machine (needs OPENROUTER_API_KEY)
//   live     full job system with a real CreateOS sandbox (needs a CreateOS key, see createos.ts)
export function pipelineMode(): Job["mode"] {
  if (process.env.PIPELINE === "live" && createosKey()) return "live";
  if (process.env.PIPELINE === "local" && process.env.OPENROUTER_API_KEY) return "local";
  if (process.env.PIPELINE === "simulate") return "simulate";
  return "replay";
}

/** Called by the queue when a job gets a slot. Throwing marks the job failed and frees the slot. */
export async function startPipeline(job: Job) {
  if (job.mode === "local") {
    const { eventsUrl } = await startLocal(job);
    await updateJob(job.id, { eventsUrl });
    return;
  }
  // simulate: the recorded run plays in the browser, the queue ends it on time.
  // live: the boot screen starts the crew inside the sandbox as its last step (createos.ts bootSandbox, step "crew"),
  // so the studio watches the sandbox come up and then the crew in it. The pipeline POSTs /api/jobs/<id>/heartbeat
  // every 15 s (the answer says when the user pressed CUT) and /api/jobs/<id>/done at the end. The CreateOS key stays
  // here; the sandbox gets the per-job token and the OpenRouter key, behind an egress allowlist.
}
