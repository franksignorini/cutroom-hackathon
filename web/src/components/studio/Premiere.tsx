"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import type { StudioState } from "@/lib/events";
import { writeReshoot } from "@/lib/reshoot";
import { CrewFiles } from "./CrewFiles";

export function Premiere({ state, onClose, where = "sandbox", tier, prompt }: {
  state: StudioState;
  onClose: () => void;
  where?: "sandbox" | "local" | "replay";
  tier?: "free" | "premium"; // set for a real job: a Free one is offered the Premium crew
  prompt?: string;
}) {
  const done = state.done!;
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  // The crew's files sit below the fold: a cue says so until the viewer scrolls.
  const files = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const minutes = Math.floor(done.at / 60);
  const seconds = Math.round(done.at % 60);

  const stats: [string, string][] = [
    ["Shot in", `${minutes} min ${String(seconds).padStart(2, "0")} s`],
    ["Code written", `${state.files.filter((f) => /\.(js|html|json)$/.test(f.path)).length} files`],
    ["Critic notes", `${state.notes.length} · ${state.notes.filter((n) => n.fixed).length} fixed`],
    ["Frames", `${state.render?.of ?? 0} · software raster`],
    ["Models", `$${state.cost.usd.toFixed(4)} · 2-vCPU sandbox`],
  ];

  function play() {
    const v = video.current;
    if (!v) return;
    v.muted = false;
    v.currentTime = 0;
    void v.play();
    setPlaying(true);
  }

  async function copy() {
    await navigator.clipboard.writeText(done.post);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <motion.div
      onScroll={(e) => !scrolled && e.currentTarget.scrollTop > 60 && setScrolled(true)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-black/92 backdrop-blur-xl"
      role="dialog"
      aria-modal
      aria-label="Premiere"
    >
      <div className="beam -top-40 left-1/2 -translate-x-1/2" aria-hidden />
      <div className="relative mx-auto flex min-h-full max-w-[1500px] flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between">
          <span className="label flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-signal" /> World premiere
          </span>
          <button onClick={onClose} className="tc rounded-full border border-line-2 px-3 py-1.5 text-[12px] text-paper-2 hover:text-paper">
            Back to the studio
          </button>
        </div>

        <div className="mt-6 grid flex-1 items-center gap-8 lg:grid-cols-[1fr_340px]">
          <motion.div
            initial={{ scale: 0.92, opacity: 0, filter: "brightness(3) blur(10px)" }}
            animate={{ scale: 1, opacity: 1, filter: "brightness(1) blur(0px)" }}
            transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
            className="relative"
          >
            <div className="absolute -inset-12 rounded-[60px] bg-signal/15 blur-3xl" aria-hidden />
            <div className="relative overflow-hidden rounded-[16px] border border-line-2 bg-black shadow-[0_60px_160px_-40px_rgba(0,0,0,1)]">
              <video
                ref={video}
                src={done.video}
                poster={done.poster}
                controls={playing}
                playsInline
                className="block aspect-video w-full"
                onEnded={() => setPlaying(false)}
              />
              {!playing && (
                <button onClick={play} className="group absolute inset-0 grid place-items-center bg-black/30" aria-label="Play with sound">
                  <span className="flex flex-col items-center gap-4">
                    <span className="grid h-24 w-24 place-items-center rounded-full bg-signal text-ink shadow-[0_0_80px_rgba(255,77,26,0.9)] transition group-hover:scale-105">
                      <svg width="30" height="32" viewBox="0 0 9 10" fill="currentColor" aria-hidden>
                        <path d="M0 0v10l9-5z" />
                      </svg>
                    </span>
                    <span className="label text-paper">Play with sound</span>
                  </span>
                </button>
              )}
            </div>
          </motion.div>

          <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="flex flex-col gap-5"
          >
            <div>
              <div className="font-display text-[56px] font-[850] uppercase leading-[0.86]">
                It&apos;s a <span className="text-signal text-glow">wrap.</span>
              </div>
              <p className="mt-3 text-[14px] text-paper-2">
                Written, reviewed and rendered by agents {where === "local" ? "on the dev machine (the sandbox run is next)" : "inside a CreateOS sandbox"}. Nobody touched a timeline.
                {state.crew.length > 0 && " Their files are below."}
              </p>
            </div>
            <dl className="divide-y divide-line rounded-[14px] border border-line">
              {stats.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between px-4 py-2.5">
                  <dt className="label text-[10px]">{k}</dt>
                  <dd className="tc text-[13px] text-paper">{v}</dd>
                </div>
              ))}
            </dl>
            {tier === "free" && prompt && (
              <div className="relative overflow-hidden rounded-[14px] border border-tungsten/35 bg-tungsten/[0.07] p-4">
                <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-tungsten/20 blur-2xl" aria-hidden />
                <div className="label mb-2 flex items-center gap-2 text-[10px]">
                  <span className="rounded-full border border-line-2 px-2 py-0.5 text-paper-2">Free crew</span> open models
                </div>
                <p className="text-[15px] font-medium leading-snug text-paper">Want more quality? Use Premium models.</p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-paper-2">
                  The Premium crew runs on Claude Sonnet: a sharper story, a signature shot painted in code by a stronger
                  coder, and a critic that reads every frame.
                </p>
                <button
                  onClick={() => {
                    writeReshoot(prompt);
                    router.push("/");
                  }}
                  className="mt-3 inline-flex items-center gap-2 rounded-full bg-tungsten px-4 py-2 font-display text-[15px] font-[800] uppercase tracking-[0.04em] text-ink hover:brightness-110"
                >
                  Re-shoot it on Premium <span aria-hidden>→</span>
                </button>
              </div>
            )}
            <div className="rounded-[14px] border border-line bg-white/[0.02] p-4">
              <div className="label mb-2 text-[10px]">Post for X</div>
              <p className="text-[13.5px] leading-relaxed text-paper">{done.post}</p>
              <button onClick={copy} className="tc mt-3 text-[12px] text-signal hover:text-signal-2">
                {copied ? "✓ Copied" : "Copy post"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={done.video}
                download="cutroom-trailer.mp4"
                className="inline-flex items-center gap-2 rounded-full bg-signal px-5 py-2.5 font-display text-[18px] font-[800] uppercase tracking-[0.04em] text-ink hover:bg-signal-2"
              >
                Download MP4
              </a>
              <Link href="/" className="rounded-full border border-line-2 px-5 py-2.5 text-[14px] text-paper hover:border-paper">
                Make another
              </Link>
            </div>
          </motion.aside>
        </div>
        <motion.div ref={files} className="scroll-mt-6" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.6 }}>
          <CrewFiles state={state} />
        </motion.div>
      </div>
      <AnimatePresence>
        {state.crew.length > 0 && !scrolled && (
          <motion.button
            key="cue"
            onClick={() => files.current?.scrollIntoView({ behavior: "smooth" })}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ delay: 1.8, duration: 0.5 }}
            className="fixed bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-go/30 bg-ink-2/90 py-2 pl-3 pr-4 text-[13px] text-paper shadow-[0_10px_40px_-10px_rgba(0,0,0,0.9)] backdrop-blur hover:border-go/60"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-go/70" />
              <span className="relative h-2 w-2 rounded-full bg-go" />
            </span>
            <span className="tc text-[12px]">Read what each agent wrote</span>
            <motion.svg
              width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden
              animate={{ y: [0, 4, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              className="text-go"
            >
              <path d="M7 2v9M3 7l4 4 4-4" />
            </motion.svg>
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
