"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import FILMS from "@/lib/screening.json";

type Film = (typeof FILMS)[number];
type Filter = "all" | "free" | "premium";

// "anthropic/claude-sonnet-5.5" -> "Claude Sonnet 5.5", "groq:openai/gpt-oss-120b" -> "gpt-oss-120b"
function modelName(id: string | null) {
  if (!id) return "—";
  const name = id.split("/").pop()!.replace(/:free$/, "").replace(/@.*$/, "");
  if (/^claude-/.test(name)) return name.replace(/^claude-(\w+)-/, (_, m: string) => `Claude ${m[0].toUpperCase()}${m.slice(1)} `);
  return name;
}
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const usd = (n: number) => (n ? `$${n.toFixed(2)}` : "$0");
function tone(status: string) {
  if (/^applied|re-shot/.test(status)) return "border-go/40 text-go";
  if (/rolled back/.test(status)) return "border-tungsten/40 text-tungsten";
  return "border-line-2 text-muted";
}

function Card({ film, onOpen }: { film: Film; onOpen: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const play = () => {
    const v = video.current;
    if (!v) return;
    v.currentTime = 0;
    v.play().catch(() => {});
  };
  const stop = () => video.current?.pause();
  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={play}
      onMouseLeave={stop}
      onFocus={play}
      onBlur={stop}
      className="group relative block w-full overflow-hidden rounded-[12px] border border-line bg-black text-left outline-none transition hover:border-line-2 focus-visible:border-signal"
    >
      <div className="relative aspect-video">
        <img src={film.poster} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        <video
          ref={video}
          src={film.video}
          muted
          loop
          playsInline
          preload="none"
          className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
        />
        <span
          className={`tc absolute left-3 top-3 rounded-full border px-2 py-0.5 text-[10.5px] uppercase tracking-[0.12em] backdrop-blur ${
            film.tier === "premium" ? "border-tungsten/50 bg-black/50 text-tungsten" : "border-line-2 bg-black/50 text-paper-2"
          }`}
        >
          {film.tier}
        </span>
        <span className="tc absolute right-3 top-3 rounded-full bg-black/50 px-2 py-0.5 text-[10.5px] text-paper/80 backdrop-blur">{film.duration} s</span>
      </div>
      {/* under the picture, not on it: over the poster it ran into the film's own sub line */}
      <div className="flex items-end justify-between gap-3 border-t border-line bg-ink-2 px-3.5 py-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-[22px] font-[800] uppercase leading-none">{film.title}</h3>
          <p className="tc mt-1.5 text-[11px] text-muted">
            shot in {clock(film.seconds)} · {usd(film.usd)}
          </p>
        </div>
        {film.score != null && (
          <span className="tc shrink-0 rounded-md border border-line-2 px-1.5 py-0.5 text-[11px] text-paper-2">
            Critic {film.score}
          </span>
        )}
      </div>
    </button>
  );
}

function Viewer({ film, onClose, onStep }: { film: Film; onClose: () => void; onStep: (d: number) => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onStep(1);
      if (e.key === "ArrowLeft") onStep(-1);
    };
    window.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
    };
  }, [onClose, onStep]);

  const crew = [
    ["Director", film.models.director],
    ["Builder", film.models.builder],
    ["Critic", film.models.critic],
  ] as const;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={film.title}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-8 sm:py-10" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <p className="label truncate">Screening room · {film.tier} · {film.duration} s</p>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => onStep(-1)} className="rounded-full border border-line-2 px-3 py-1 text-[13px] text-paper-2 hover:text-paper" aria-label="Previous film">←</button>
            <button onClick={() => onStep(1)} className="rounded-full border border-line-2 px-3 py-1 text-[13px] text-paper-2 hover:text-paper" aria-label="Next film">→</button>
            <button onClick={onClose} className="rounded-full border border-line-2 px-3 py-1 text-[13px] text-paper hover:border-paper">Close</button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
          <div className="min-w-0">
            <div className="overflow-hidden rounded-[14px] border border-line-2 bg-black" style={{ boxShadow: `0 40px 120px -50px ${film.accent}` }}>
              <video key={film.id} src={film.video} poster={film.poster} controls autoPlay playsInline className="block aspect-video w-full" />
            </div>
            <p className="label mb-2 mt-6">Every beat, as the crew shot it</p>
            <ol className="scroll-thin flex gap-2 overflow-x-auto pb-2">
              {film.beats.map((b) => (
                <li key={b.name} className="w-[168px] shrink-0">
                  <div className="relative overflow-hidden rounded-[8px] border border-line bg-black">
                    {b.still ? <img src={b.still} alt={b.words} loading="lazy" className="block aspect-video w-full object-cover" /> : <div className="aspect-video" />}
                    {b.kind === "hand-written" && (
                      <span className="tc absolute left-1.5 top-1.5 rounded bg-signal px-1 text-[9.5px] uppercase text-ink">by hand</span>
                    )}
                  </div>
                  <p className="tc mt-1.5 flex justify-between text-[10.5px] text-muted">
                    <span className="text-paper-2">{b.name}</span>
                    <span>{b.takes > 1 ? `${b.takes} takes` : b.kind}</span>
                  </p>
                </li>
              ))}
            </ol>
          </div>

          <aside className="min-w-0 space-y-5">
            <div>
              <h3 className="font-display text-[clamp(34px,4vw,52px)] font-[850] uppercase leading-[0.9]">{film.title}</h3>
              <p className="mt-3 border-l-2 pl-3 text-[15px] leading-relaxed text-paper-2" style={{ borderColor: film.accent }}>
                “{film.prompt}”
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-[12px] border border-line bg-line">
              {[
                [clock(film.seconds), "prompt to MP4"],
                [usd(film.usd), film.tier === "premium" ? "model cost" : "free models"],
                [film.score != null ? `${film.score}/10` : "—", "Critic's score"],
              ].map(([k, v]) => (
                <div key={v} className="bg-ink-2 p-3">
                  <dt className="font-display text-[26px] font-[800] leading-none">{k}</dt>
                  <dd className="mt-1 text-[11.5px] text-muted">{v}</dd>
                </div>
              ))}
            </dl>
            <div>
              <p className="label mb-2">Crew</p>
              <ul className="space-y-1 text-[13.5px]">
                {crew.map(([role, id]) => (
                  <li key={role} className="flex justify-between gap-3 border-b border-line pb-1">
                    <span className="text-muted">{role}</span>
                    <span className="tc truncate text-paper-2">{modelName(id)}</span>
                  </li>
                ))}
              </ul>
            </div>
            {film.summary && (
              <div>
                <p className="label mb-2">What the Critic saw</p>
                <p className="text-[14px] leading-relaxed text-paper-2">{film.summary}</p>
              </div>
            )}
            {film.notes.length > 0 && (
              <div>
                <p className="label mb-2">Notes and what happened to them</p>
                <ol className="space-y-2.5">
                  {film.notes.map((n, i) => (
                    <li key={i} className="panel p-3 text-[13px] leading-snug text-paper-2">
                      <span className="tc mr-1.5 text-faint">{i + 1}.</span>
                      {n.text}
                      <span className={`tc mt-2 block w-fit rounded-full border px-2 py-0.5 text-[10.5px] ${tone(n.status)}`}>{n.status}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

const LONG = "/screening/the-last-lighthouse";
const LONG_SHOTS = [
  ["Fresnel lens, lit ring by ring", "Blender, Cycles"],
  ["The tower at midnight", "Blender + rain, surf"],
  ["The switch goes to AUTO", "Blender + canvas"],
  ["“Last watch.” in the log", "canvas, ink nib"],
  ["The open-well stair", "Blender + lamp pool"],
  ["One match", "canvas: sparks, flame"],
  ["The beam from the ship", "Blender + flare, rain"],
  ["Twin beams over the sea", "Blender + glitter"],
];

// What the same kind of crew makes when it gets hours instead of minutes: the studio Cutroom is the lite version of.
function LongTake() {
  return (
    <div className="mt-20 grid gap-8 lg:grid-cols-[1.45fr_1fr] lg:items-center">
      <div className="relative min-w-0">
        <div className="absolute -inset-8 rounded-[40px] bg-tungsten/10 blur-3xl" aria-hidden />
        <div className="relative overflow-hidden rounded-[16px] border border-line-2 bg-black shadow-[0_50px_140px_-40px_rgba(0,0,0,0.9)]">
          <video src={`${LONG}/film.mp4`} poster={`${LONG}/poster.jpg`} controls playsInline preload="none" className="block aspect-video w-full" />
        </div>
      </div>
      <div className="min-w-0">
        <p className="label mb-4 flex items-center gap-3">
          <span className="h-px w-8 bg-tungsten" />
          The long take
        </p>
        <h3 className="font-display text-[clamp(36px,4.4vw,64px)] font-[850] uppercase leading-[0.9]">
          Give the studio hours,
          <br />
          <span className="text-tungsten">not minutes.</span>
        </h3>
        <p className="mt-5 text-[16px] leading-relaxed text-paper-2">
          Cutroom is the ten-minute cut of a bigger studio. Let the same kind of crew work for hours, with 3D scenes
          rendered in Blender, a score synthesized note by note and five rounds of critique, and this is what comes out:
          <span className="text-paper"> THE LAST LIGHTHOUSE</span>, 35 seconds, still every frame from code.
        </p>
        <dl className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-[12px] border border-line bg-line">
          {[
            ["15", "shots"],
            ["5", "Critic rounds"],
            ["0", "frames drawn by hand"],
          ].map(([k, v]) => (
            <div key={v} className="bg-ink-2 p-3">
              <dt className="font-display text-[30px] font-[800] leading-none">{k}</dt>
              <dd className="mt-1 text-[12px] text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <ol className="scroll-thin flex gap-2 overflow-x-auto pb-2 lg:col-span-2">
        {LONG_SHOTS.map(([what, how], i) => (
          <li key={what} className="w-[200px] shrink-0">
            <img src={`${LONG}/s${i + 1}.jpg`} alt={what} loading="lazy" className="block aspect-video w-full rounded-[8px] border border-line object-cover" />
            <p className="mt-1.5 text-[12px] leading-snug text-paper-2">{what}</p>
            <p className="tc text-[10.5px] text-muted">{how}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

// Films the crew really made, unedited: a wall of posters that play on hover, each with its making-of.
export function ScreeningRoom() {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<number | null>(null);
  const shown = useMemo(() => FILMS.filter((f) => filter === "all" || f.tier === filter), [filter]);
  const premium = FILMS.filter((f) => f.tier === "premium");
  const stats = [
    [String(FILMS.length), "films, none edited by hand"],
    [clock(Math.round(FILMS.reduce((s, f) => s + f.seconds, 0) / FILMS.length)), "average prompt to MP4"],
    ["$0", "a Free trailer"],
    [premium.length ? usd(premium.reduce((s, f) => s + f.usd, 0) / premium.length) : "—", "a Premium trailer, on average"],
  ];

  return (
    <section id="screening" className="relative mx-auto max-w-[1400px] px-5 py-28 sm:px-8">
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-end">
        <div>
          <p className="label mb-4">Screening room</p>
          <h2 className="font-display text-[clamp(40px,5.4vw,80px)] font-[850] uppercase leading-[0.9]">
            {FILMS.length} prompts.
            <br />
            {FILMS.length} films.
            <br />
            <span className="text-signal">Zero hands on the edit.</span>
          </h2>
        </div>
        <div className="lg:justify-self-end">
          <p className="max-w-[540px] text-[17px] leading-relaxed text-paper-2">
            Every film below came out of the crew exactly as shipped: one prompt in, one MP4 out. Hover to watch, open one
            to see every beat, the models that made it, and what the Critic caught in its own frames.
          </p>
          <div className="mt-6 flex gap-2" role="tablist" aria-label="Filter films">
            {(["all", "free", "premium"] as const).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-3.5 py-1.5 text-[13px] capitalize transition ${
                  filter === f ? "border-paper bg-paper text-ink" : "border-line-2 text-paper-2 hover:text-paper"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <dl className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line bg-line md:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={v} className="bg-ink-2 p-5">
            <dt className="font-display text-[38px] font-[800] leading-none">{k}</dt>
            <dd className="mt-2 text-[13.5px] text-muted">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((f) => (
          <Card key={f.id} film={f} onOpen={() => setOpen(FILMS.indexOf(f))} />
        ))}
      </div>

      <LongTake />

      {open != null && (
        <Viewer
          film={FILMS[open]}
          onClose={() => setOpen(null)}
          onStep={(d) => setOpen((i) => (i == null ? i : (i + d + FILMS.length) % FILMS.length))}
        />
      )}
    </section>
  );
}
