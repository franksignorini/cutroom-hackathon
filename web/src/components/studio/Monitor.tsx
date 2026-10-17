"use client";
/* eslint-disable @next/next/no-img-element */

import { AnimatePresence, motion } from "motion/react";
import { frameAt } from "@/lib/demo-run";
import type { Still, StudioState } from "@/lib/events";
import { timecode } from "@/lib/feed";

interface Props {
  state: StudioState;
  replay: boolean;
  speed: number;
  prompt: string;
  pinned: Still | undefined;
  onPremiere: () => void;
}

export function Monitor({ state, replay, speed, prompt, pinned, onPremiere }: Props) {
  const live = state.stills.filter((s) => !s.superseded);
  const latest = live.at(-1);
  const criticWorking = state.agents.critic.state === "working";
  const openNote = criticWorking ? state.notes.at(-1) : undefined;
  const noteStill = openNote ? state.stills.find((s) => s.id === openNote.still) : undefined;
  const fresh = latest && latest.replaces && state.at - latest.at < 24 ? latest : undefined;
  const before = fresh ? state.stills.find((s) => s.id === fresh.replaces) : undefined;

  let view: React.ReactNode;
  let still: Still | undefined;
  let tag = "";

  if (state.done) {
    view = (
      <button onClick={onPremiere} className="group absolute inset-0 block" aria-label="Open the premiere">
        <img src={state.done.poster} alt="Poster frame" className="absolute inset-0 h-full w-full object-cover flash-in" />
        <span className="absolute inset-0 bg-black/40 transition group-hover:bg-black/25" />
        <span className="absolute inset-0 grid place-items-center">
          <span className="flex flex-col items-center gap-4">
            <span className="grid h-20 w-20 place-items-center rounded-full bg-signal text-ink shadow-[0_0_60px_rgba(255,77,26,0.8)] transition group-hover:scale-105">
              <svg width="26" height="28" viewBox="0 0 9 10" fill="currentColor" aria-hidden>
                <path d="M0 0v10l9-5z" />
              </svg>
            </span>
            <span className="font-display text-[34px] font-[850] uppercase tracking-[0.04em]">Premiere</span>
          </span>
        </span>
      </button>
    );
    tag = "FINAL · 1280×720 · H.264";
  } else if (state.render) {
    const t = state.render.frame / 24;
    const src = replay ? frameAt(t) : (latest?.src ?? "");
    view = (
      <>
        <Frame src={src} />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-6 pb-5 pt-16">
          <div className="flex items-end justify-between">
            <div>
              <div className="label text-paper/80">Rendering · software raster</div>
              <div className="mt-1 font-display text-[40px] font-[850] leading-none">
                {state.render.frame}
                <span className="text-paper/40">/{state.render.of}</span>
              </div>
            </div>
            <div className="tc text-[12px] text-paper/70">{timecode(t)}</div>
          </div>
          <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-signal shadow-[0_0_12px_rgba(255,77,26,0.9)] transition-[width] duration-300"
              style={{ width: `${(state.render.frame / state.render.of) * 100}%` }}
            />
          </div>
        </div>
      </>
    );
    tag = "RENDER · 1280×720 · 24 fps";
  } else if (noteStill && openNote) {
    still = noteStill;
    view = (
      <>
        <Frame src={noteStill.src} dim />
        <motion.div
          key={openNote.n}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute left-1/2 top-[42%] h-[46%] w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-signal/90 shadow-[0_0_30px_rgba(255,77,26,0.5)]"
        />
        <motion.div
          key={`n${openNote.n}`}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-5 left-5 right-5 rounded-[12px] border border-signal/50 bg-black/75 p-4 backdrop-blur-md sm:right-auto sm:max-w-[60%]"
        >
          <div className="tc mb-1.5 flex items-center gap-2 text-[11px] text-signal">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-signal text-[11px] font-bold text-ink">
              {openNote.n}
            </span>
            CRITIC · {openNote.score}
          </div>
          <p className="text-[14px] leading-snug text-paper">{openNote.text}</p>
        </motion.div>
      </>
    );
    tag = `REVIEW · REV ${noteStill.rev}`;
  } else if (fresh && before && !pinned) {
    still = fresh;
    view = (
      <>
        <Frame src={before.src} />
        <div key={fresh.id} className="wipe-in absolute inset-0">
          <img src={fresh.src} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-y-0 left-0 w-px bg-signal shadow-[0_0_16px_4px_rgba(255,77,26,0.6)]" />
        </div>
        <div className="absolute bottom-5 left-5 flex items-center gap-2">
          <span className="tc rounded bg-black/70 px-2 py-1 text-[11px] text-paper/60 line-through">REV {before.rev}</span>
          <span className="text-signal">→</span>
          <span className="tc rounded bg-signal px-2 py-1 text-[11px] font-bold text-ink">REV {fresh.rev}</span>
        </div>
      </>
    );
    tag = `FIXED · REV ${fresh.rev}`;
  } else if (pinned ?? latest) {
    still = pinned ?? latest;
    view = <Frame src={still!.src} />;
    tag = `DRAFT · 960×540 · REV ${still!.rev}`;
  } else if (state.plan) {
    view = (
      <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_50%_30%,rgba(255,181,71,0.12),transparent_60%)] p-8 text-center">
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }}>
          <div className="label mb-4">Treatment locked</div>
          <div className="font-display text-[clamp(40px,6vw,92px)] font-[850] uppercase leading-[0.88] paper-glow">
            {state.plan.title}
          </div>
          <p className="mx-auto mt-4 max-w-[520px] text-[15px] text-paper-2">{state.plan.logline}</p>
        </motion.div>
      </div>
    );
    tag = "PLAN · film.json";
  } else {
    view = (
      <div className="absolute inset-0 flex flex-col justify-center bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,181,71,0.08),transparent_60%)] px-[8%]">
        <div className="label mb-5">{state.sandbox ? "INT. SANDBOX — CONTINUOUS" : "Booting microVM…"}</div>
        <p className="max-w-[760px] font-mono text-[clamp(15px,1.5vw,21px)] leading-relaxed text-paper">
          {prompt}
          <span className="ml-1 inline-block h-[1.1em] w-[0.55em] translate-y-1 bg-paper animate-caret" />
        </p>
      </div>
    );
    tag = state.sandbox ? "BRIEF · reading" : "STANDBY";
  }

  return (
    <div className="relative mx-auto aspect-video w-full overflow-hidden rounded-[14px] border border-line-2 bg-black shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]">
      {view}
      <div className="scanlines pointer-events-none absolute inset-0 opacity-25" />
      <div className="brackets pointer-events-none absolute inset-3" />
      <div className="pointer-events-none absolute left-5 top-4 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${state.done ? "bg-go" : "bg-signal animate-rec"}`} />
        <span className="label text-paper/85">
          {state.done ? "Wrapped" : replay ? `Replay · ${speed}×` : "Live preview"}
        </span>
      </div>
      <div className="pointer-events-none absolute right-5 top-4 text-right">
        {still && (
          <div className="tc text-[12px] text-paper/85">
            {timecode(still.t)} <span className="text-paper/45">· {still.beat.toUpperCase()}</span>
          </div>
        )}
        <div className="label mt-0.5 text-[10px] text-paper/50">{tag}</div>
      </div>
      {state.sandbox?.previewUrl && !state.done && (
        <a
          href={state.sandbox.previewUrl}
          target="_blank"
          rel="noreferrer"
          className="tc absolute bottom-4 right-5 rounded-full border border-line-2 bg-black/60 px-3 py-1 text-[11px] text-paper/80 hover:text-paper"
        >
          Open live canvas ↗
        </a>
      )}
    </div>
  );
}

function Frame({ src, dim }: { src: string; dim?: boolean }) {
  return (
    <AnimatePresence initial={false}>
      <motion.img
        key={src}
        src={src}
        alt=""
        initial={{ opacity: 0, scale: 1.03 }}
        animate={{ opacity: dim ? 0.55 : 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </AnimatePresence>
  );
}
