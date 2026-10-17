import "server-only";
import { CreateosSandboxClient, type Sandbox } from "@nodeops-createos/sandbox";
import { BOOT_PLAN, type BootEvent, type BootRecord, type BootStep, type BootStepId } from "@/lib/boot";
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

export const SHAPE = process.env.CREATEOS_SHAPE || "s-1vcpu-1gb"; // Free plan: the biggest shape allowed
export const ROOTFS = "devbox:1"; // Ubuntu 24.04, Node 24, Python
export const REGION = process.env.CREATEOS_REGION || "eu";
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
  const sb: Sandbox = await step(
    "sandbox",
    async () => {
      if (warm) {
        const s = await client.getSandbox(warm);
        if (s.status === "paused") await s.resume();
        return s;
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
    (s) => `${s.id} · ${s.data.shape ?? SHAPE} · ${s.data.region ?? REGION} · VM up in ${s.data.spawn_ms ?? "?"} ms`,
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
        await sb.processes.create({
          cmd: "node",
          args: ["/workspace/pipeline/pipeline.mjs", "--brief", briefPath],
          cwd: "/workspace",
          env: {
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
          },
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
 * A job ended (done, CUT, failed): give its sandbox back. The warm sandbox (CREATEOS_SANDBOX_ID) is paused for the
 * next job; a per-job sandbox is destroyed, which is what frees the Free plan's single slot. Mock sandboxes need nothing.
 */
export async function releaseSandbox(job: Job) {
  const apiKey = createosKey();
  if (!apiKey || !job.sandboxId) return;
  const client = new CreateosSandboxClient({ apiKey, baseUrl: process.env.CREATEOS_SANDBOX_BASE_URL || undefined });
  try {
    const sb = await client.getSandbox(job.sandboxId);
    if (job.status === "done") return; // the video is served from the sandbox: its auto-pause puts it to sleep later
    if (job.sandboxId === process.env.CREATEOS_SANDBOX_ID) {
      if (sb.status === "running") await sb.pause();
    } else await sb.destroy();
  } catch (err) {
    console.error(`[createos] could not release ${job.sandboxId}: ${(err as Error).message}`);
  }
}
