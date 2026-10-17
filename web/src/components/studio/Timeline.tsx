"use client";

import { AGENTS, type StudioState } from "@/lib/events";
import { useElapsed, type Clock } from "@/lib/feed";

// The production as an editing timeline: one track per agent, clips where they worked, a playhead at "now".
export function Timeline({ state, clock, total }: { state: StudioState; clock: Clock; total: number }) {
  const now = useElapsed(clock, 20);
  const span = Math.max(total, now * 1.1, 60);
  const pct = (s: number) => `${Math.min(100, (s / span) * 100)}%`;
  const minutes = Math.floor(span / 60);

  return (
    <section className="panel overflow-hidden" aria-label="Production timeline">
      <div className="grid grid-cols-[86px_1fr] sm:grid-cols-[110px_1fr]">
        <div className="border-r border-line">
          <div className="label flex h-6 items-center px-3 text-[10px]">Tracks</div>
          {AGENTS.map((a) => (
            <div key={a.id} className="label flex h-[17px] items-center px-3 text-[10px] text-paper-2">
              {a.name}
            </div>
          ))}
          <div className="label flex h-[17px] items-center px-3 text-[10px] text-paper-2">Frames</div>
        </div>

        <div className="relative">
          <div className="relative h-6 border-b border-line">
            {Array.from({ length: minutes + 1 }).map((_, m) => (
              <div key={m} className="absolute top-0 h-full" style={{ left: pct(m * 60) }}>
                <div className="h-2 w-px bg-white/20" />
                <span className="tc absolute left-1 top-2 text-[10px] text-faint">{m}:00</span>
              </div>
            ))}
          </div>

          {AGENTS.map((a) => (
            <div key={a.id} className="relative h-[17px] border-b border-line/50">
              {state.segments
                .filter((g) => g.agent === a.id)
                .map((g, i) => {
                  const open = g.to === undefined;
                  const to = open ? Math.max(now, g.from) : g.to!;
                  return (
                    <div
                      key={i}
                      className={`absolute top-[3px] h-[11px] overflow-hidden rounded-[3px] ${
                        open
                          ? "bg-signal/85 shadow-[0_0_14px_rgba(255,77,26,0.6)]"
                          : a.id === "critic"
                            ? "bg-tungsten/55"
                            : "bg-paper/35"
                      }`}
                      style={{ left: pct(g.from), width: `calc(${pct(to - g.from)} + 2px)` }}
                    >
                      {open && (
                        <div className="h-full w-full animate-[marquee_1.2s_linear_infinite] bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(0,0,0,0.25)_6px_12px)] [width:200%]" />
                      )}
                    </div>
                  );
                })}
              {a.id === "critic" &&
                state.notes.map((n) => (
                  <div
                    key={n.n}
                    className={`absolute top-[4px] h-[9px] w-[9px] -translate-x-1/2 rotate-45 ${n.fixed ? "bg-go" : "bg-signal"}`}
                    style={{ left: pct(n.at) }}
                    title={`Note ${n.n}`}
                  />
                ))}
            </div>
          ))}

          <div className="relative h-[17px]">
            {state.stills.map((s) => (
              <div
                key={s.id}
                className={`absolute top-[3px] h-[11px] w-[3px] rounded-sm ${s.rev > 1 ? "bg-signal" : "bg-paper/60"}`}
                style={{ left: pct(s.at) }}
              />
            ))}
          </div>

          <div className="pointer-events-none absolute inset-y-0" style={{ left: pct(now) }}>
            <div className="absolute -left-[5px] top-0 h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-signal" />
            <div className="h-full w-px bg-signal shadow-[0_0_10px_rgba(255,77,26,0.9)]" />
          </div>
        </div>
      </div>
    </section>
  );
}
