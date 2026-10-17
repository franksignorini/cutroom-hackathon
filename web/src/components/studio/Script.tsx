"use client";

import { AnimatePresence, motion } from "motion/react";
import type { StudioState } from "@/lib/events";

// The Director's plan (film.json) and the Critic's notes, as they arrive.
export function Script({ state }: { state: StudioState }) {
  const plan = state.plan;
  return (
    <section className="panel flex max-h-[520px] min-h-0 flex-1 flex-col overflow-hidden xl:max-h-none" aria-label="Script and notes">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="label">film.json</span>
        <span className="tc text-[11px] text-faint">{plan ? `${plan.duration.toFixed(1)} s · 24 fps` : "waiting for the Director"}</span>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4">
        {!plan ? (
          <div className="flex flex-col gap-2.5">
            {[70, 92, 54, 80].map((w, i) => (
              <div key={i} className="h-2.5 animate-pulse rounded bg-white/[0.05]" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <h3 className="font-display text-[28px] font-[800] uppercase leading-none">{plan.title}</h3>
            <p className="mt-2 text-[13px] leading-snug text-paper-2">{plan.logline}</p>
            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/[0.04]">
              {plan.beats.map((b, i) => (
                <div
                  key={b.name}
                  className={i % 2 ? "bg-white/15" : "bg-white/25"}
                  style={{ width: `${(b.dur / plan.duration) * 100}%` }}
                  title={b.name}
                />
              ))}
            </div>
            <ol className="mt-3 flex flex-col">
              {plan.beats.map((b) => (
                <li key={b.name} className="grid grid-cols-[44px_58px_1fr] items-baseline gap-2 border-b border-line py-1.5 last:border-0">
                  <span className="tc text-[11px] text-faint">{b.t.toFixed(1)}s</span>
                  <span className="label text-[10px] text-paper-2">{b.name}</span>
                  <span className="truncate font-display text-[15px] font-[700] uppercase tracking-[0.02em]">
                    {b.words.length ? b.words.join(" ") : <span className="text-faint">— silence —</span>}
                  </span>
                </li>
              ))}
            </ol>
          </motion.div>
        )}

        {state.notes.length > 0 && (
          <div className="mt-5">
            <div className="label mb-2 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-signal" /> Critic notes
            </div>
            <ul className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {state.notes.map((n) => (
                  <motion.li
                    key={n.n}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`relative rounded-[10px] border p-3 transition-colors duration-700 ${
                      n.fixed ? "border-go/25 bg-go/[0.04]" : "border-signal/35 bg-signal/[0.06]"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="tc text-[11px] text-paper-2">
                        NOTE {n.n} {n.score && <span className="text-faint">· {n.score}</span>}
                      </span>
                      <span
                        className={`tc rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
                          n.fixed ? "bg-go/15 text-go" : "bg-signal/15 text-signal"
                        }`}
                      >
                        {n.fixed ? "fixed" : "open"}
                      </span>
                    </div>
                    <p className={`text-[12.5px] leading-snug ${n.fixed ? "text-muted line-through decoration-faint" : "text-paper"}`}>
                      {n.text}
                    </p>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
