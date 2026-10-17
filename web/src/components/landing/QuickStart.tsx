"use client";

import { useEffect } from "react";

// The one-step tutorial a first visitor sees, pointing at the input. Composer decides when it shows and hides it.
// Placement: above the input, arrow pointing down; on wide screens (>= 1600px) in the empty space to its left,
// arrow pointing right, like a note scribbled in the margin.

export const QUICKSTART_TEXT_ID = "quickstart-text";

export function QuickStart({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div
      role="status"
      className="absolute bottom-[calc(100%+22px)] left-1 z-20 w-[min(330px,calc(100%-8px))] text-left min-[1600px]:bottom-auto min-[1600px]:left-auto min-[1600px]:right-[calc(100%+58px)] min-[1600px]:top-2 min-[1600px]:w-[268px]"
    >
      <div className="animate-rise rounded-[14px] border border-tungsten/40 bg-ink-2 px-4 pb-3.5 pt-3 shadow-[0_24px_70px_-20px_rgba(255,181,71,0.35)]">
        <div className="label flex items-center gap-2 text-[10px] text-tungsten">
          <span className="h-1.5 w-1.5 rounded-full bg-tungsten" />
          Take 1 · Quick start
        </div>
        <div id={QUICKSTART_TEXT_ID}>
          <p className="mt-1.5 font-display text-[24px] font-[800] uppercase leading-[0.95] text-paper">
            Got a trailer idea?
          </p>
          <p className="mt-1.5 text-[13.5px] leading-snug text-paper-2">
            Write it simply, the way you&apos;d tell a friend. The agent crew takes it from there and shoots it, live, in a
            CreateOS sandbox.
          </p>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={onDismiss}
            className="rounded-full bg-paper px-3.5 py-1.5 text-[12px] font-medium text-ink transition hover:bg-white"
          >
            Got it
          </button>
          <span className="text-[12px] text-muted">or just start typing</span>
        </div>
      </div>

      {/* Above the input: arrow down into it. */}
      <svg
        width="40"
        height="44"
        viewBox="0 0 40 44"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute -bottom-[38px] left-7 text-signal min-[1600px]:hidden"
        aria-hidden
      >
        <path className="draw-in" pathLength={100} d="M8 2C4 16 10 30 26 38" />
        <path className="draw-in draw-in-late" pathLength={100} d="M17 39.5L26.5 38.5L22 30" />
      </svg>

      {/* In the margin: arrow right, onto the input. */}
      <svg
        width="56"
        height="40"
        viewBox="0 0 56 40"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute -right-[54px] top-12 hidden text-signal min-[1600px]:block"
        aria-hidden
      >
        <path className="draw-in" pathLength={100} d="M2 6C18 4 34 10 48 28" />
        <path className="draw-in draw-in-late" pathLength={100} d="M39.5 26.5L48.5 28.5L48 19.5" />
      </svg>
    </div>
  );
}
