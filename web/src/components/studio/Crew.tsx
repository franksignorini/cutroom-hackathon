"use client";

import { AnimatePresence, motion } from "motion/react";
import { AgentGlyph } from "@/components/Glyphs";
import { AGENTS, type StudioState } from "@/lib/events";

export function Crew({ state }: { state: StudioState }) {
  return (
    <section className="panel p-3" aria-label="The crew">
      <header className="flex items-center justify-between px-1 pb-2.5">
        <span className="label">The crew</span>
        <span className="tc text-[11px] text-faint">
          {AGENTS.filter((a) => state.agents[a.id].state === "done").length}/5 wrapped
        </span>
      </header>
      <ul className="flex flex-col gap-1.5">
        {AGENTS.map((a) => {
          const s = state.agents[a.id];
          const working = s.state === "working";
          const done = s.state === "done";
          return (
            <li
              key={a.id}
              className={`relative flex items-start gap-3 rounded-[10px] border px-2.5 py-2.5 transition-colors duration-500 ${
                working ? "border-signal/40 bg-signal/[0.06]" : "border-transparent bg-white/[0.02]"
              }`}
            >
              <span className="relative mt-0.5 grid h-9 w-9 shrink-0 place-items-center">
                {working && <span className="ring-working absolute inset-0 rounded-full" />}
                <span
                  className={`absolute inset-[1.5px] rounded-full ${working ? "bg-ink-2" : "bg-ink-3"} ${
                    done ? "ring-1 ring-go/40" : ""
                  }`}
                />
                <span className={`relative ${working ? "text-signal" : done ? "text-go" : "text-faint"}`}>
                  <AgentGlyph agent={a.id} />
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[14px] font-medium ${s.state === "idle" ? "text-paper-2" : "text-paper"}`}>
                    {a.name}
                  </span>
                  <span
                    className={`tc text-[10px] uppercase tracking-[0.14em] ${
                      working ? "text-signal" : done ? "text-go" : "text-faint"
                    }`}
                  >
                    {working ? "● working" : done ? "✓ wrapped" : "standby"}
                  </span>
                </div>
                <div className="relative h-[34px] overflow-hidden">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.p
                      key={s.say ?? a.role}
                      initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
                      transition={{ duration: 0.35 }}
                      className={`line-clamp-2 text-[12.5px] leading-snug ${working ? "text-paper-2" : "text-muted"}`}
                    >
                      {s.say ?? a.role}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
