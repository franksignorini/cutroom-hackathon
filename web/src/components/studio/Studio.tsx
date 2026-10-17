"use client";

import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DEMO_EVENTS, DEMO_JOB, DEMO_TOTAL, RECORDED } from "@/lib/demo-run";
import type { BootRecord } from "@/lib/boot";
import type { JobEvent } from "@/lib/events";
import { useLiveFeed, useReplayFeed } from "@/lib/feed";
import { clearSession, readSession, writeSession } from "@/lib/session";
import { BootScreen } from "./BootScreen";
import { ContactStrip } from "./ContactStrip";
import { Crew } from "./Crew";
import { Monitor } from "./Monitor";
import { Premiere } from "./Premiere";
import { SandboxPanel } from "./SandboxPanel";
import { Script } from "./Script";
import { Timeline } from "./Timeline";
import { TopBar } from "./TopBar";

interface JobInfo {
  id: string;
  prompt: string;
  mode: "live" | "local" | "simulate" | "replay";
  tier?: "free" | "premium";
  status: string;
  eventsUrl?: string;
  startedAt?: number;
  elapsed?: number; // wall seconds since the job started (server clock)
  simSeconds?: number; // simulate/replay: how long the server lets the recorded run take
  position?: number;
  etaSeconds?: number;
  error?: string;
  boot?: BootRecord; // the CreateOS boot; until it exists a running job shows the boot screen
  video?: string;
  poster?: string;
}

const NONE: JobEvent[] = [];
const DEMO: JobInfo = { ...DEMO_JOB, mode: "replay", status: "running", elapsed: 0 };
const WAITING = ["awaiting_payment", "queued"];
const ENDED = ["failed", "canceled", "abandoned"];

export function Studio({ jobId }: { jobId: string }) {
  const isDemo = jobId === "demo";
  const search = useSearchParams();
  const [speed, setSpeed] = useState(() => Number(search.get("speed")) || 4);
  const [job, setJob] = useState<JobInfo | null>(isDemo ? DEMO : null);
  const [offset, setOffset] = useState<number | null>(isDemo ? 0 : null);
  const [owner, setOwner] = useState<string | undefined>();
  const [missing, setMissing] = useState(false);
  const [demoCut, setDemoCut] = useState(false);
  const [pin, setPin] = useState<{ id: string; count: number } | undefined>();
  const [premiere, setPremiere] = useState(false);

  // Follow the job on the server: queue position, start, end, or death. A refresh lands back here.
  useEffect(() => {
    if (isDemo) return;
    let stop = false;
    let timer: number | undefined;
    const load = async () => {
      let r: Response;
      try {
        r = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      } catch {
        if (!stop) timer = window.setTimeout(load, 3000);
        return;
      }
      if (stop) return;
      if (r.status === 404) {
        clearSession(jobId);
        return setMissing(true);
      }
      const j = (await r.json()) as JobInfo;
      setJob(j);

      const s = readSession();
      setOwner(s?.id === jobId ? s.owner : undefined);
      if (!s && [...WAITING, "running"].includes(j.status)) writeSession({ id: jobId });
      if (ENDED.includes(j.status)) clearSession(jobId);

      // Join a running (or finished) job where it is, not from the start. While the sandbox boots there is nothing to join.
      const real = j.mode === "live" || j.mode === "local";
      const rate = real ? 1 : DEMO_TOTAL / (j.simSeconds ?? DEMO_TOTAL / 4);
      if ((j.status === "running" && j.boot) || j.status === "done")
        setOffset((o) => o ?? (real ? 0 : (j.elapsed ?? 0) * rate));

      const next = WAITING.includes(j.status) ? 2000 : j.status === "running" ? 5000 : 0;
      if (next) timer = window.setTimeout(load, next);
    };
    void load();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [jobId, isDemo]);

  const replay = job?.mode !== "live" && job?.mode !== "local"; // the recorded run plays instead of a real feed
  const playing = !!job && (job.status === "running" || job.status === "done") && offset !== null && !demoCut;
  const rate = isDemo ? speed : DEMO_TOTAL / (job?.simSeconds ?? DEMO_TOTAL / 4);
  const replayFeed = useReplayFeed(playing && replay ? DEMO_EVENTS : NONE, rate, offset ?? 0);
  const liveFeed = useLiveFeed(playing && !replay ? (job.eventsUrl ?? null) : null, job?.startedAt ?? null);
  const { state, clock } = replay ? replayFeed : liveFeed;

  useEffect(() => {
    if (!state.done) return;
    const t = window.setTimeout(() => setPremiere(true), 1600);
    return () => {
      window.clearTimeout(t);
      setPremiere(false);
    };
  }, [state.done]);

  // The app says the job is done but this page's feed never got its "done" (the crew stopped early, or the page
  // followed a crew that was told to stop): after a grace period, show the result instead of "working" forever.
  const [orphan, setOrphan] = useState(false);
  const finishedElsewhere = !replay && job?.status === "done" && !state.done;
  useEffect(() => {
    if (!finishedElsewhere) return;
    const t = window.setTimeout(() => setOrphan(true), 8000);
    return () => window.clearTimeout(t);
  }, [finishedElsewhere]);

  async function cut() {
    if (isDemo) return setDemoCut(true);
    const r = await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST", headers: { "x-owner-token": owner ?? "" } });
    const j = (await r.json()) as JobInfo & { error?: string };
    if (!r.ok) throw new Error(j.error ?? "Could not stop the trailer");
    clearSession(jobId);
    setJob((prev) => (prev ? { ...prev, ...j } : prev));
  }

  if (missing)
    return (
      <Centered title="Job not found">
        <span>
          This job is gone (the server restarted, or the link is wrong).{" "}
          <Link href="/jobs/demo" className="text-signal underline">
            Watch the recorded run
          </Link>{" "}
          or{" "}
          <Link href="/" className="text-signal underline">
            start a new one
          </Link>
          .
        </span>
      </Centered>
    );

  if (!job) return <div className="min-h-[100svh] bg-ink" />;

  if (demoCut || ENDED.includes(job.status))
    return (
      <Ended
        job={job}
        demo={isDemo}
        onRestart={() => {
          setDemoCut(false);
          replayFeed.restart();
        }}
      />
    );

  if (orphan && finishedElsewhere)
    return (
      <Centered title="It's a wrap">
        <span>The crew finished the film, but this page missed the end of its live feed.</span>
        {job.video && (
          <a href={job.video} target="_blank" rel="noreferrer" className="mt-6 text-signal underline">
            Watch the trailer
          </a>
        )}
      </Centered>
    );

  if (job.status === "awaiting_payment")
    return (
      <Centered title="Confirming payment">
        Waiting for Stripe to confirm the test payment. The camera rolls the moment it does.
      </Centered>
    );

  if (job.status === "queued") return <Queue job={job} onLeave={owner ? cut : undefined} />;

  if (!isDemo && job.status === "running" && !job.boot)
    return (
      <BootScreen
        jobId={job.id}
        onReady={(boot) => {
          setJob((prev) => (prev ? { ...prev, boot, elapsed: 0, eventsUrl: boot.eventsUrl ?? prev.eventsUrl } : prev));
          setOffset(0);
        }}
      />
    );

  const pinned = pin && pin.count === state.stills.length ? pin.id : undefined;
  const setPinned = (id: string | undefined) => setPin(id ? { id, count: state.stills.length } : undefined);
  const pinnedStill = state.stills.find((s) => s.id === pinned);
  const prompt = replay ? DEMO_JOB.prompt : job.prompt;
  const total = replay ? DEMO_TOTAL + 8 : 480;

  return (
    <div className="flex min-h-[100svh] flex-col xl:h-[100svh] xl:overflow-hidden">
      <TopBar
        state={state}
        clock={clock}
        jobId={job.id}
        prompt={prompt}
        tier={job.tier}
        note={
          isDemo
            ? "replay of a recorded run"
            : job.mode === "live"
              ? undefined
              : job.mode === "local"
                ? "real crew · running on the dev machine"
                : "simulated run · recorded pipeline"
        }
        speedControls={isDemo}
        speed={speed}
        onSpeed={setSpeed}
        onRestart={replayFeed.restart}
        onCut={isDemo || owner ? cut : undefined}
      />

      <main className="grid flex-1 gap-3 p-3 sm:p-4 xl:min-h-0 xl:grid-cols-[300px_minmax(0,1fr)_350px] xl:grid-rows-[minmax(0,1fr)]">
        <aside className="order-2 flex min-h-0 flex-col gap-3 xl:order-1">
          <Crew state={state} />
          <Script state={state} />
        </aside>

        <section className="order-1 flex min-h-0 min-w-0 flex-col gap-3 xl:order-2">
          <div className="mx-auto w-full" style={{ maxWidth: "max(560px, calc((100svh - 385px) * 16 / 9))" }}>
            <Monitor
              state={state}
              replay={replay}
              speed={isDemo ? speed : Math.round(rate)}
              prompt={prompt}
              pinned={pinnedStill}
              onPremiere={() => setPremiere(true)}
            />
          </div>
          <ContactStrip state={state} pinned={pinned} onPin={setPinned} />
          <div className="hidden xl:block">
            <Timeline state={state} clock={clock} total={total} />
          </div>
        </section>

        <aside className="order-3 flex min-h-0 flex-col">
          <SandboxPanel state={state} workspace={isDemo ? "job-a7f2" : `job-${job.id}`} sandbox={job.boot?.sandbox}
            offline={replay && RECORDED.where === "local" ? "This run was recorded on the dev machine while the CreateOS account had no credit. The live crew runs in the sandbox." : undefined}
          />
        </aside>

        <div className="order-4 xl:hidden">
          <Timeline state={state} clock={clock} total={total} />
        </div>
      </main>

      <AnimatePresence>{premiere && state.done && <Premiere state={state} onClose={() => setPremiere(false)} tier={replay ? undefined : job.tier} prompt={prompt} where={job.mode === "local" || (replay && RECORDED.where === "local") ? "local" : "sandbox"} />}</AnimatePresence>
    </div>
  );
}

function Queue({ job, onLeave }: { job: JobInfo; onLeave?: () => Promise<void> }) {
  const [leaving, setLeaving] = useState(false);
  const minutes = Math.max(1, Math.round((job.etaSeconds ?? 0) / 60));
  return (
    <div className="grid min-h-[100svh] place-items-center px-6 py-16">
      <div className="flex max-w-[560px] flex-col items-center text-center">
        <div className="label mb-8 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-tungsten animate-rec" /> In the queue · job {job.id}
        </div>
        <div className="relative grid aspect-square w-[min(62vw,300px)] place-items-center">
          <div className="absolute inset-0 rounded-full border-2 border-paper/50" />
          <div className="absolute inset-[9%] rounded-full border border-paper/25" />
          <div className="ring-working absolute inset-0 rounded-full opacity-40 [mask:radial-gradient(circle,transparent_64%,#000_65%)]" />
          <div className="absolute inset-x-0 top-1/2 h-px bg-paper/10" />
          <div className="absolute inset-y-0 left-1/2 w-px bg-paper/10" />
          <span className="relative font-display text-[clamp(96px,22vw,160px)] font-[850] leading-none">
            <span className="text-[0.45em] text-paper/40">#</span>
            {job.position || 1}
          </span>
        </div>
        <h1 className="mt-8 font-display text-[44px] font-[850] uppercase leading-none">You&apos;re in line</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-paper-2">
          Every trailer gets its own crew in a CreateOS sandbox, so only a few shoot at once. Yours starts the moment a
          slot frees up, in about <span className="text-paper">{minutes} min</span>. Keep this tab open: the queue skips
          trailers nobody is watching.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/jobs/demo"
            target="_blank"
            className="rounded-full border border-line-2 px-5 py-2.5 text-[14px] text-paper hover:border-paper"
          >
            Watch a recorded run while you wait ↗
          </Link>
          {onLeave && (
            <button
              onClick={async () => {
                setLeaving(true);
                try {
                  await onLeave();
                } finally {
                  setLeaving(false);
                }
              }}
              disabled={leaving}
              className="rounded-full border border-signal/50 px-5 py-2.5 text-[14px] text-signal hover:bg-signal hover:text-ink disabled:opacity-60"
            >
              {leaving ? "Leaving…" : "Leave the queue"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Ended({ job, demo, onRestart }: { job: JobInfo; demo: boolean; onRestart: () => void }) {
  const copy: Record<string, [string, string]> = {
    canceled: ["Cut.", "You stopped this trailer. The crew packed up, the sandbox was released and nothing else was spent."],
    failed: ["Take failed", job.error ?? "Something went wrong inside the sandbox. The slot was released."],
    abandoned: ["Your spot expired", "The queue moves on when nobody is watching. Starting again takes a second."],
  };
  const [title, body] = demo ? copy.canceled : (copy[job.status] ?? copy.failed);
  return (
    <Centered title={title}>
      <span>{body}</span>
      <span className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {demo && (
          <button
            onClick={onRestart}
            className="rounded-full border border-line-2 px-5 py-2.5 text-[14px] text-paper hover:border-paper"
          >
            Restart the replay
          </button>
        )}
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-signal px-5 py-2.5 font-display text-[18px] font-[800] uppercase tracking-[0.04em] text-ink hover:bg-signal-2"
        >
          <span className="h-2 w-2 rounded-full bg-ink" /> Start a new trailer
        </Link>
      </span>
    </Centered>
  );
}

function Centered({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-[100svh] place-items-center px-6">
      <div className="max-w-[560px] text-center">
        <div className="mx-auto mb-6 h-3 w-3 rounded-full bg-signal animate-rec" />
        <h1 className="font-display text-[56px] font-[850] uppercase leading-none">{title}</h1>
        <div className="mt-4 flex flex-col items-center text-[16px] text-paper-2">{children}</div>
      </div>
    </div>
  );
}
