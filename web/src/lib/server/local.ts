import "server-only";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { crew, MAX_USD, REQUEST_BUDGET } from "./models";
import type { Job } from "./store";

// PIPELINE=local: the real crew (pipeline/pipeline.mjs: OpenRouter agents + the studio engine) runs on this machine,
// as a child of the Next server. Same pipeline, same events and same heartbeat as in the CreateOS sandbox; only the
// place it runs changes. Needs OPENROUTER_API_KEY and the engine (ENGINE_DIR, default ../cinematic-studio).

const g = globalThis as unknown as { __cutroomLocal?: Map<string, ChildProcess> };
const running = (g.__cutroomLocal ??= new Map());

/** Starts the pipeline and resolves with its feed once it is listening. */
export function startLocal(job: Job): Promise<{ eventsUrl: string }> {
  const repo = path.resolve(process.cwd(), "..");
  const dir = path.join(tmpdir(), "cutroom");
  mkdirSync(dir, { recursive: true });
  const brief = path.join(dir, `${job.id}.json`);
  writeFileSync(
    brief,
    JSON.stringify({
      id: job.id,
      prompt: job.prompt,
      tier: job.tier,
      duration: job.duration,
      models: crew(job.tier),
      requestBudget: REQUEST_BUDGET[job.tier],
      maxUsd: MAX_USD[job.tier],
    }),
  );
  const child = spawn(process.execPath, [path.join(repo, "pipeline", "pipeline.mjs"), "--brief", brief], {
    cwd: repo,
    env: {
      ...process.env,
      JOB_TOKEN: job.token,
      CREW_WHERE: "local", // the wrap screen and the post must not claim a sandbox
      CUTROOM_URL: process.env.CUTROOM_URL || `http://localhost:${process.env.PORT || 3000}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  running.set(job.id, child);
  child.on("exit", () => running.delete(job.id));
  child.stderr.on("data", (d) => console.error(`[pipeline ${job.id}] ${String(d).trim().slice(0, 600)}`));

  return new Promise((ok, fail) => {
    let buf = "";
    const timer = setTimeout(() => fail(new Error("The crew did not start in 20 s.")), 20_000);
    child.stdout.on("data", (d) => {
      buf += String(d);
      const m = /CUTROOM_FEED (\S+)/.exec(buf);
      if (m) {
        clearTimeout(timer);
        ok({ eventsUrl: `${m[1]}/events` });
      }
      if (buf.length > 4096) buf = buf.slice(-1024);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      fail(new Error(`The crew stopped before starting (exit ${code}).`));
    });
  });
}

/** CUT, failure or abandon: stop the crew now instead of waiting for its next heartbeat. */
export function stopLocal(id: string) {
  running.get(id)?.kill();
  running.delete(id);
}
