"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BOOT_PLAN, type BootEvent, type BootRecord, type BootStep, type BootStepId } from "@/lib/boot";

// Shown once the trailer gets its slot: the server boots the CreateOS sandbox (POST /api/jobs/[id]/boot) and every
// step lands here with the time it really took. Then the studio opens.

const HOLD_MS = 1700; // how long "Generated in" stays up before the studio opens

export function BootScreen({ jobId, onReady }: { jobId: string; onReady: (boot: BootRecord) => void }) {
  const [done, setDone] = useState<Partial<Record<BootStepId, BootStep>>>({});
  const [labels, setLabels] = useState<Partial<Record<BootStepId, string>>>({});
  const [current, setCurrent] = useState<{ id: BootStepId; since: number } | null>(null);
  const [boot, setBoot] = useState<BootRecord | null>(null);
  const [error, setError] = useState<{ message: string; id?: BootStepId } | null>(null);
  const ready = useRef(onReady);
  const result = useRef<HTMLDivElement>(null);

  // On a phone the result lands below the fold: bring it up.
  useEffect(() => {
    if (boot || error) result.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [boot, error]);
  useEffect(() => {
    ready.current = onReady;
  }, [onReady]);

  useEffect(() => {
    const ctrl = new AbortController();
    let hold: number | undefined;
    (async () => {
      const r = await fetch(`/api/jobs/${jobId}/boot`, { method: "POST", signal: ctrl.signal });
      if (!r.ok || !r.body) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        return setError({ message: j.error ?? "Could not reach the sandbox." });
      }
      const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      while (true) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += value;
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const e = JSON.parse(buf.slice(0, nl)) as BootEvent;
          buf = buf.slice(nl + 1);
          if (e.type === "start") {
            setCurrent({ id: e.id, since: performance.now() });
            setLabels((l) => ({ ...l, [e.id]: e.label }));
          } else if (e.type === "step") {
            setDone((d) => ({ ...d, [e.step.id]: e.step }));
            setLabels((l) => ({ ...l, [e.step.id]: e.step.label }));
          } else if (e.type === "done") {
            setCurrent(null);
            setDone(Object.fromEntries(e.boot.steps.map((s) => [s.id, s])));
            setBoot(e.boot);
            hold = window.setTimeout(() => ready.current(e.boot), HOLD_MS);
          } else {
            setCurrent(null);
            setError({ message: e.message, id: e.id });
          }
        }
      }
    })().catch((err: Error) => {
      if (err.name !== "AbortError") setError({ message: err.message });
    });
    return () => {
      ctrl.abort();
      window.clearTimeout(hold);
    };
  }, [jobId]);

  const mock = boot?.api === "mock";

  return (
    <div className="grid min-h-[100svh] place-items-center px-4 py-12 sm:px-6">
      <div className="w-full max-w-[640px]">
        <div className="label flex flex-wrap items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${error ? "bg-signal" : boot ? "bg-go" : "bg-tungsten animate-rec"}`} />
          CreateOS sandbox · job {jobId}
          {mock && (
            <span
              className="rounded-md border border-line-2 px-1.5 py-0.5 text-[10px] text-faint"
              title="No CreateOS key yet: the same SDK calls go to our mock of the CreateOS API"
            >
              mock API
            </span>
          )}
        </div>
        <h1 className="mt-4 font-display text-[clamp(40px,9vw,64px)] font-[850] uppercase leading-[0.92]">
          {error ? "The sandbox didn't start" : boot ? "Sandbox ready" : "Spinning up your sandbox"}
        </h1>
        <p className="mt-3 max-w-[520px] text-[15px] leading-relaxed text-paper-2">
          {error
            ? error.message
            : "Your crew gets its own microVM: a fresh Linux box with Node, ffmpeg and a locked-down network, where the agents write the film's code and run it."}
        </p>

        <ol className="mt-8 overflow-hidden rounded-[14px] border border-line bg-ink-2/60 font-mono text-[13px]" aria-live="polite">
          {BOOT_PLAN.map((p) => {
            const s = done[p.id];
            const running = current?.id === p.id;
            const failed = error?.id === p.id;
            return (
              <li key={p.id} className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <span className="mt-[3px] grid h-4 w-4 shrink-0 place-items-center">
                  {s ? (
                    <Check />
                  ) : failed ? (
                    <span className="text-signal">✕</span>
                  ) : running ? (
                    <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-tungsten border-t-transparent" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-faint/50" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={s || running ? "text-paper" : failed ? "text-signal" : "text-faint"}>
                    {labels[p.id] ?? p.label}
                  </span>
                  {s && <span className="new-row mt-0.5 block break-words text-[12px] text-muted">{s.detail}</span>}
                </span>
                <span className="tc shrink-0 text-[12px] text-paper-2">
                  {s ? `${s.ms} ms` : running ? <Ticker since={current.since} /> : ""}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="mt-6 min-h-[92px]" ref={result}>
          {boot && (
            <div className="animate-rise flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="label text-[10px] text-go">Generated in</div>
                <div className="font-display text-[56px] font-[850] leading-none">
                  {boot.totalMs}
                  <span className="ml-1 text-[0.45em] text-paper-2">ms</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 sm:justify-end">
                {[boot.sandbox.id, boot.sandbox.shape, boot.sandbox.rootfs, `region ${boot.sandbox.region}`, `VM up in ${boot.sandbox.bootMs} ms`].map((c) => (
                  <span key={c} className="tc rounded-md border border-line bg-ink px-1.5 py-0.5 text-[11px] text-paper-2">
                    {c}
                  </span>
                ))}
                <span className="w-full text-[12px] text-muted sm:text-right">Opening the studio…</span>
              </div>
            </div>
          )}
          {error && (
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full bg-signal px-5 py-2.5 font-display text-[18px] font-[800] uppercase tracking-[0.04em] text-ink hover:bg-signal-2"
            >
              <span className="h-2 w-2 rounded-full bg-ink" /> Start a new trailer
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Ticker({ since }: { since: number }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <span className="text-faint">{Math.round(now - since)} ms</span>;
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-go" aria-hidden>
      <path d="M2.5 7.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
