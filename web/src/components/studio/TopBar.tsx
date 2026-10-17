"use client";

import Link from "next/link";
import { useState } from "react";
import { Wordmark } from "@/components/Glyphs";
import type { StudioState } from "@/lib/events";
import { timecode, useElapsed, type Clock } from "@/lib/feed";

const STATUS: Record<StudioState["status"], { label: string; tone: string }> = {
  standby: { label: "Standby", tone: "text-faint" },
  booting: { label: "Booting", tone: "text-tungsten" },
  shooting: { label: "Shooting", tone: "text-signal" },
  rendering: { label: "Rendering", tone: "text-signal" },
  done: { label: "Wrapped", tone: "text-go" },
};

interface Props {
  state: StudioState;
  clock: Clock;
  jobId: string;
  prompt: string;
  tier?: "free" | "premium"; // absent on the recorded demo
  note?: string; // e.g. "replay of a recorded run"
  speedControls: boolean;
  speed: number;
  onSpeed: (s: number) => void;
  onRestart: () => void;
  onCut?: () => Promise<void>; // the red button; absent when this browser does not own the job
}

export function TopBar({ state, clock, jobId, prompt, tier, note, speedControls, speed, onSpeed, onRestart, onCut }: Props) {
  const t = useElapsed(clock, 24);
  const st = STATUS[state.status];
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/80 backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-5">
        <Link href="/" aria-label="Cutroom home">
          <Wordmark />
        </Link>
        <span className="hidden h-5 w-px bg-line-2 sm:block" />
        <div className="min-w-0 flex-1">
          <div className="label truncate text-[10px]">
            Job {jobId === "demo" ? "a7f2" : jobId}
            {tier && (
              <span className={`ml-1 ${tier === "premium" ? "text-tungsten" : "text-paper-2"}`}>
                · {tier === "premium" ? "Premium" : "Free"} crew
              </span>
            )}
            {note && <span className="ml-1 text-tungsten">· {note}</span>}
          </div>
          <p className="truncate text-[13.5px] text-paper-2" title={prompt}>
            {prompt}
          </p>
        </div>

        <div className={`flex items-center gap-2 rounded-full border border-line-2 px-3 py-1.5 ${st.tone}`}>
          <span
            className={`h-2 w-2 rounded-full bg-current ${state.status === "shooting" || state.status === "rendering" ? "animate-rec" : ""}`}
          />
          <span className="tc text-[11px] uppercase tracking-[0.16em]">
            {state.status === "shooting" || state.status === "rendering" ? "Rec · " : ""}
            {st.label}
          </span>
        </div>

        <div className="text-right">
          <div className="tc text-[22px] leading-none text-paper">{timecode(t)}</div>
          <div className="label mt-1 text-[9.5px]">Elapsed · job time</div>
        </div>

        <div className="hidden text-right md:block">
          <div className="tc text-[15px] leading-none text-paper">${state.cost.usd.toFixed(4)}</div>
          <div className="label mt-1 text-[9.5px]">Compute · {state.cost.vcpuSeconds} vCPU·s</div>
        </div>
        <div className="hidden text-right md:block">
          <div className="tc text-[15px] leading-none text-paper">{(state.cost.tokens / 1000).toFixed(1)}k</div>
          <div className="label mt-1 text-[9.5px]">Tokens</div>
        </div>

        {speedControls && (
          <div className="flex items-center gap-1 rounded-full border border-line bg-ink-2 p-0.5">
            {[1, 4, 12].map((s) => (
              <button
                key={s}
                onClick={() => onSpeed(s)}
                className={`tc rounded-full px-2.5 py-1 text-[11px] ${speed === s ? "bg-paper text-ink" : "text-muted hover:text-paper"}`}
              >
                {s}×
              </button>
            ))}
            <button onClick={onRestart} className="tc rounded-full px-2.5 py-1 text-[11px] text-muted hover:text-paper" title="Restart">
              ↺
            </button>
          </div>
        )}

        {onCut && !state.done && <CutButton onCut={onCut} />}
      </div>
    </header>
  );
}

// The red button: stops the crew, frees the sandbox slot, and stops spending. Asks once before cutting.
function CutButton({ onCut }: { onCut: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cut() {
    setBusy(true);
    setError(null);
    try {
      await onCut();
      setConfirm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setConfirm((v) => !v)}
        aria-expanded={confirm}
        className="group inline-flex items-center gap-2 rounded-full border border-signal/60 bg-signal/15 px-3.5 py-1.5 font-display text-[16px] font-[800] uppercase tracking-[0.06em] text-signal shadow-[0_0_24px_-6px_rgba(255,77,26,0.8)] transition hover:bg-signal hover:text-ink"
      >
        <span className="h-2.5 w-2.5 rounded-[2px] bg-current" />
        Cut
      </button>
      {confirm && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-40 w-[290px] max-sm:fixed max-sm:inset-x-4 max-sm:top-[96px] max-sm:w-auto rounded-[14px] border border-signal/40 bg-ink-2 p-4 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]">
          <p className="font-display text-[24px] font-[850] uppercase leading-none">Stop this trailer?</p>
          <p className="mt-2 text-[13px] leading-snug text-paper-2">
            The crew stops, the sandbox is released and nothing else is spent. This can&apos;t be undone.
          </p>
          {error && <p className="mt-2 text-[12.5px] text-signal-2">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setConfirm(false)}
              className="flex-1 rounded-full border border-line-2 px-3 py-2 text-[13px] text-paper hover:border-paper"
            >
              Keep shooting
            </button>
            <button
              onClick={cut}
              disabled={busy}
              className="flex-1 rounded-full bg-signal px-3 py-2 font-display text-[16px] font-[800] uppercase tracking-[0.04em] text-ink hover:bg-signal-2 disabled:opacity-60"
            >
              {busy ? "Cutting…" : "Cut it"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
