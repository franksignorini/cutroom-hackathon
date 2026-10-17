import "server-only";
import { CreateosSandboxClient, type Sandbox } from "@nodeops-createos/sandbox";
import { BOOT_PLAN, type BootEvent, type BootRecord, type BootStep, type BootStepId } from "@/lib/boot";
import { getKV } from "./kv";
import { crew, MAX_USD, REQUEST_BUDGET } from "./models";
import type { Job } from "./store";

// Boots the job's CreateOS sandbox with the official SDK (@nodeops-createos/sandbox) and times every call.
//
// Which API answers:
//   a CreateOS key set            → the real CreateOS control plane (https://api.sb.createos.sh, or
//                                   CREATEOS_SANDBOX_BASE_URL if set)
//   no key                        → our mock at /api/mock/createos, which speaks the same REST + JSend contract.
// The calls, the timings and the screen are the same either way; only the answers are made up in the mock.
// The key: CREATEOS_PROJECT_API_KEY is what `stripe projects add createos/project` writes (verified 2026-10-15: the
// Sandbox API accepts it); CREATEOS_SANDBOX_API_KEY, the SDK's own name, wins if set.

export const SHAPE = process.env.CREATEOS_SHAPE || "s-2vcpu-4gb"; // 2 vCPU / 4 GB: Chrome renders ~3× faster than on 1 vCPU / 1 GB
export const ROOTFS = "devbox:1"; // Ubuntu 24.04, Node 24, Python
export const REGION = process.env.CREATEOS_REGION || "eu";
// Idle seconds before CreateOS pauses the warm sandbox between jobs (60-86400).
const IDLE_PAUSE_S = Math.min(86_400, Math.max(60, Number(process.env.IDLE_PAUSE_S) || 180));
const RUNNING_SET = "cutroom:running"; // queue.ts: the jobs holding a slot
const PREVIEW_PORT = 8080; // the crew's feed (pipeline/lib/feed.mjs) inside the sandbox
const CHROME = "/usr/local/bin/chrome-nosandbox"; // installed by scripts/setup-sandbox.mjs

export function createosKey() {
  // CREATEOS_MOCK=on forces the mock even with a key (e.g. the account has no credit yet: the API answers 402).
  if (process.env.CREATEOS_MOCK === "on") return undefined;
  return process.env.CREATEOS_SANDBOX_API_KEY || process.env.CREATEOS_PROJECT_API_KEY || undefined;
}

export function createosApi(origin: string) {
  const apiKey = createosKey();
  if (apiKey) {
    const client = new CreateosSandboxClient({ apiKey, baseUrl: process.env.CREATEOS_SANDBOX_BASE_URL || undefined });
    return { client, api: "createos" as const, host: new URL(process.env.CREATEOS_SANDBOX_BASE_URL || "https://api.sb.createos.sh").host };
  }
  const baseUrl = `${origin}/api/mock/createos`;
  return { client: new CreateosSandboxClient({ apiKey: "mock", baseUrl, retry: false }), api: "mock" as const, host: "mock of api.sb.createos.sh" };
}

/** host:port rules: the crew may only reach the LLM providers (OpenRouter, Groq, Gemini), the film's fonts, the icons (Iconify) and 3D objects (Fluent Emoji on jsDelivr), the media store and this app. */
function egressRules(origin: string) {
  const rules = ["openrouter.ai:443", "api.groq.com:443", "generativelanguage.googleapis.com:443", "fonts.googleapis.com:443", "fonts.gstatic.com:443", "api.cloudinary.com:443", "api.iconify.design:443", "raw.githubusercontent.com:443", "cdn.jsdelivr.net:443", "pixabay.com:443", "cdn.pixabay.com:443"];
  const app = new URL(origin);
  if (!["localhost", "127.0.0.1"].includes(app.hostname)) rules.push(`${app.hostname}:443`);
  return rules;
}

export async function bootSandbox(job: Job, origin: string, emit: (e: BootEvent) => void): Promise<BootRecord> {
  const { client, api, host } = createosApi(origin);
  const steps: BootStep[] = [];
  const t0 = performance.now();

  async function step<T>(id: BootStepId, run: () => Promise<T>, detail: (r: T) => string, label?: string) {
    const name = label ?? BOOT_PLAN.find((s) => s.id === id)!.label;
    emit({ type: "start", id, label: name });
    const t = performance.now();
    let r: T;
    try {
      r = await run();
    } catch (err) {
      throw Object.assign(new Error(`${name}: ${(err as Error).message}`), { stepId: id });
    }
    const done: BootStep = { id, label: name, detail: detail(r), ms: Math.round(performance.now() - t) };
    steps.push(done);
    emit({ type: "step", step: done });
    return r;
  }

  await step(
    "connect",
    () => client.whoami(),
    (me) => {
      const who = me as { user_id?: string; plan?: string };
      return [host, who.plan && `${who.plan} plan`].filter(Boolean).join(" · ");
    },
  );

  // The Free plan allows one sandbox at a time, so a warm one (CREATEOS_SANDBOX_ID) is resumed instead of created.
  const warm = process.env.CREATEOS_SANDBOX_ID;
  let woke: number | undefined; // ms to resume the warm sandbox from its idle auto-pause, when it was asleep
  const sb: Sandbox = await step(
    "sandbox",
    async () => {
      if (warm) {
        // Between jobs CreateOS auto-pauses the warm sandbox when idle (releaseSandbox turns it on). A pause or resume
        // may still be in flight: let it settle, wake it, and switch auto-pause off for the run so a long render is
        // never paused under the crew. Only then any file or egress call (those answer 409/404 mid-transition).
        const s = await client.getSandbox(warm);
        for (let i = 0; i < 2 && s.status !== "running"; i++) {
          const t = performance.now();
          if (s.status === "pausing") await s.waitUntilPaused({ timeoutMs: 60_000 });
          if (s.status === "paused") await s.resume();
          await s.waitUntilRunning({ timeoutMs: 60_000 });
          woke = Math.round(performance.now() - t);
          await s.setAutoPause(null).catch(() => {});
          await s.refresh();
        }
        if (woke === undefined) await s.setAutoPause(null).catch(() => {});
        return s.refresh();
      }
      return client.createSandbox({
        shape: SHAPE,
        rootfs: ROOTFS,
        region: REGION,
        name: `cutroom-${job.id}`,
        ingress_enabled: true,
        auto_pause_after_seconds: 60,
      });
    },
    (s) =>
      `${s.id} · ${s.data.shape ?? SHAPE} · ${s.data.region ?? REGION} · ` +
      (woke !== undefined ? `woke from auto-pause in ${woke} ms` : warm ? "already awake" : `VM up in ${s.data.spawn_ms ?? "?"} ms`),
    warm ? "Waking the warm sandbox" : undefined,
  );

  const egress = egressRules(origin);
  await step(
    "egress",
    () => sb.setEgress(egress),
    () => `${egress.map((r) => r.replace(/:443$/, "")).join(", ")} · everything else dropped`,
  );

  const brief = JSON.stringify(
    {
      id: job.id,
      prompt: job.prompt,
      tier: job.tier,
      duration: job.duration,
      format: job.format,
      models: crew(job.tier),
      requestBudget: REQUEST_BUDGET[job.tier],
      maxUsd: MAX_USD[job.tier],
    },
    null,
    2,
  );
  const briefPath = `/workspace/briefs/${job.id}.json`;
  await step(
    "brief",
    () => sb.files.upload(briefPath, brief),
    () => `${briefPath} · ${new TextEncoder().encode(brief).length} B`,
  );

  await step(
    "toolchain",
    () =>
      sb.runCommand("sh", [
        "-c",
        "echo node $(node --version); (ffmpeg -version 2>/dev/null | head -n1 | cut -d' ' -f1-3) || echo 'ffmpeg missing'; (" + CHROME + " --version 2>/dev/null) || echo 'chrome missing'; echo $(nproc) vCPU",
      ]),
    (r) => `${r.result.stdout.trim().split("\n").join(" · ")} · ${r.exec_ms} ms in the VM`,
  );

  const previewUrl = await step(
    "ingress",
    async () => {
      try {
        return sb.previewUrl(PREVIEW_PORT);
      } catch {
        return undefined;
      }
    },
    (u) => (u ? `:${PREVIEW_PORT} → ${new URL(u).host}` : "no ingress on this sandbox"),
  );

  // The crew: pipeline/pipeline.mjs as a managed process inside the sandbox (unpacked there by scripts/setup-sandbox.mjs),
  // serving its feed on the ingress port. Only in PIPELINE=live: locally the crew runs on the dev machine (local.ts).
  let eventsUrl: string | undefined;
  if (job.mode === "live" && api === "createos") {
    if (!previewUrl) throw Object.assign(new Error("Starting the crew: the sandbox has no ingress"), { stepId: "crew" });
    eventsUrl = await step(
      "crew",
      async () => {
        const env: Record<string, string> = {
          OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? "",
          GROQ_API_KEY: process.env.GROQ_API_KEY ?? "", // the fallback providers (pipeline/lib/llm.mjs)
          GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ?? "",
          PIXABAY_API_KEY: process.env.PIXABAY_API_KEY ?? "", // the photos under up to two beats (pipeline/lib/photos.mjs)
          ENGINE_DIR: "/workspace/engine",
          CHROME_PATH: CHROME,
          HOST: "0.0.0.0",
          FEED_PORT: String(PREVIEW_PORT),
          PUBLIC_URL: previewUrl,
          CUTROOM_URL: process.env.CUTROOM_URL || origin,
          JOB_TOKEN: job.token,
          LINGER_S: "900",
        };
        // CreateOS only accepts process env keys declared when the sandbox was created, so the crew's env travels as a
        // file next to the brief and bash exports it before starting node.
        const envPath = `/workspace/briefs/${job.id}.env`;
        const quote = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`;
        await sb.files.upload(envPath, Object.entries(env).map(([k, v]) => `${k}=${quote(v)}`).join("\n") + "\n");
        // The warm sandbox stays up, so the last crew may still be lingering on the feed port (it serves its video for
        // LINGER_S): stop it first, or the new one can't listen and /health would answer for the old job. The pattern is
        // anchored on `node`, so it never matches this bash command line.
        const prev = "'^node /workspace/pipeline/pipeline\\.mjs'";
        await sb.processes.create({
          cmd: "bash",
          args: [
            "-c",
            `pkill -f ${prev}; for i in $(seq 25); do pgrep -f ${prev} >/dev/null || break; sleep 0.2; done; ` +
              `set -a; . ${envPath}; set +a; rm -f ${envPath}; exec node /workspace/pipeline/pipeline.mjs --brief ${briefPath}`,
          ],
          cwd: "/workspace",
        });
        // The feed answers through the ingress once the crew is up: that is the proof it runs in the sandbox.
        for (let i = 0; i < 40; i++) {
          const r = await fetch(`${previewUrl}/health`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
          if (r?.ok) return `${previewUrl}/events`;
          await new Promise((ok) => setTimeout(ok, 500));
        }
        throw new Error("the crew did not answer on the preview port in 20 s");
      },
      () => `node pipeline.mjs · feed on :${PREVIEW_PORT} via ingress`,
    );
  } else {
    await step(
      "crew",
      async () => undefined,
      () =>
        job.mode === "local"
          ? "the crew runs on the dev machine (PIPELINE=local) until the sandbox has credit"
          : job.mode === "simulate"
            ? "recorded run (PIPELINE=simulate)"
            : "mock sandbox: no crew to start",
    );
  }

  return {
    api,
    host,
    steps,
    totalMs: Math.round(performance.now() - t0),
    sandbox: {
      id: sb.id,
      shape: sb.data.shape ?? SHAPE,
      rootfs: sb.data.rootfs ?? ROOTFS,
      region: sb.data.region ?? REGION,
      bootMs: sb.data.spawn_ms ?? 0,
      egress: egress.map((r) => r.replace(/:443$/, "")),
      previewUrl,
    },
    eventsUrl,
    at: Date.now(),
  };
}

/**
 * A job ended (done, CUT, failed): give its sandbox back. The warm sandbox (CREATEOS_SANDBOX_ID) gets CreateOS's idle
 * auto-pause back (IDLE_PAUSE_S, default 180 s), so it sleeps between jobs and the next boot wakes it; a per-job sandbox
 * is destroyed, which is what frees the Free plan's single slot. Mock sandboxes need nothing.
 */
export async function releaseSandbox(job: Job) {
  const apiKey = createosKey();
  if (!apiKey || !job.sandboxId) return;
  const client = new CreateosSandboxClient({ apiKey, baseUrl: process.env.CREATEOS_SANDBOX_BASE_URL || undefined });
  try {
    const sb = await client.getSandbox(job.sandboxId);
    if (job.sandboxId === process.env.CREATEOS_SANDBOX_ID) {
      // Never an explicit pause: one sent as a job ends could land while the next one boots (409 "sandbox is pausing").
      // Auto-pause is only a setting, and only when no other job runs here (a late "done" from a crew already declared
      // dead must not arm it under the next run). The boot switches it off again before it touches the VM.
      if ((await getKV().smembers(RUNNING_SET)).length === 0) await sb.setAutoPause(IDLE_PAUSE_S);
    } else if (job.status !== "done") await sb.destroy(); // a done per-job sandbox serves its video until it auto-pauses
  } catch (err) {
    console.error(`[createos] could not release ${job.sandboxId}: ${(err as Error).message}`);
  }
}
