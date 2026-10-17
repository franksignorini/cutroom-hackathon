"use client";
/* eslint-disable @next/next/no-img-element */

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import type { Still, StudioState } from "@/lib/events";

export function ContactStrip({
  state,
  pinned,
  onPin,
}: {
  state: StudioState;
  pinned?: string;
  onPin: (id: string | undefined) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ left: scroller.current.scrollWidth, behavior: "smooth" });
  }, [state.stills.length]);

  const noteFor = (s: Still) => state.notes.find((n) => n.still === s.id);

  return (
    <section className="panel relative overflow-hidden" aria-label="Contact sheet">
      <header className="flex items-center justify-between px-4 pt-2.5">
        <span className="label">Contact sheet · out/stills</span>
        <span className="tc text-[11px] text-faint">
          {state.stills.length} stills · {state.stills.filter((s) => s.superseded).length} rebuilt
        </span>
      </header>
      <div className="sprockets mt-1.5 opacity-60" />
      <div ref={scroller} className="scroll-thin flex min-h-[92px] gap-2.5 overflow-x-auto px-4 py-2">
        {state.stills.length === 0 && (
          <div className="flex items-center gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-video h-[70px] rounded-[6px] border border-dashed border-line-2 bg-white/[0.015]" />
            ))}
            <span className="label ml-2 whitespace-nowrap">Frames appear here as the Builder renders them</span>
          </div>
        )}
        <AnimatePresence initial={false}>
          {state.stills.map((s) => {
            const note = noteFor(s);
            return (
              <motion.button
                key={s.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.9 }}
                animate={{ opacity: s.superseded ? 0.35 : 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
                onClick={() => onPin(pinned === s.id ? undefined : s.id)}
                className={`group relative shrink-0 overflow-hidden rounded-[6px] border text-left ${
                  pinned === s.id ? "border-paper" : s.rev > 1 ? "border-signal/70" : "border-line-2"
                }`}
                title={`${s.beat} · ${s.t.toFixed(2)} s · rev ${s.rev}`}
              >
                <img src={s.src} alt="" className="block aspect-video h-[70px] object-cover" />
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/85 to-transparent px-1.5 pb-1 pt-4">
                  <span className="tc text-[9.5px] uppercase text-paper/85">{s.beat}</span>
                  <span className="tc text-[9.5px] text-paper/60">{s.t.toFixed(1)}s</span>
                </span>
                <span
                  className={`tc absolute left-1.5 top-1.5 rounded px-1 text-[9px] font-bold ${
                    s.rev > 1 ? "bg-signal text-ink" : "bg-black/70 text-paper/70"
                  }`}
                >
                  R{s.rev}
                </span>
                {note && (
                  <span
                    className={`absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold ${
                      note.fixed ? "bg-go text-ink" : "bg-signal text-ink"
                    }`}
                  >
                    {note.fixed ? "✓" : note.n}
                  </span>
                )}
                {s.superseded && <span className="absolute inset-0 bg-[linear-gradient(135deg,transparent_48%,rgba(255,77,26,0.8)_49%,rgba(255,77,26,0.8)_51%,transparent_52%)]" />}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
      <div className="sprockets mb-1 opacity-60" />
    </section>
  );
}
