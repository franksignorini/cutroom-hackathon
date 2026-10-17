"use client";

import { useEffect, useRef, useState } from "react";
import { timecode } from "@/lib/feed";

const BEATS = [
  { t: 0, name: "HOOK" },
  { t: 3, name: "WORLD" },
  { t: 6, name: "SLAMS" },
  { t: 8.4, name: "DROP" },
  { t: 9, name: "TITLE" },
];

// The finished demo trailer, playing muted in monitor chrome with a burned-in timecode.
export function HeroMonitor() {
  const video = useRef<HTMLVideoElement>(null);
  const [t, setT] = useState(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (video.current) setT(video.current.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const beat = [...BEATS].reverse().find((b) => t >= b.t)?.name ?? "HOOK";

  return (
    <figure className="relative w-full">
      <div className="absolute -inset-10 rounded-[40px] bg-signal/10 blur-3xl" aria-hidden />
      <div className="relative overflow-hidden rounded-[16px] border border-line-2 bg-black shadow-[0_50px_140px_-40px_rgba(0,0,0,0.9)]">
        <video
          ref={video}
          src="/demo/final.mp4"
          poster="/demo/f-2.40.jpg"
          autoPlay
          muted
          loop
          playsInline
          className="block aspect-video w-full object-cover"
        />
        <div className="scanlines pointer-events-none absolute inset-0 opacity-40" />
        <div className="brackets pointer-events-none absolute inset-3" />
        <div className="pointer-events-none absolute left-5 top-4 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-signal animate-rec" />
          <span className="label text-paper/80">Playback · rendered from code</span>
        </div>
        <div className="tc pointer-events-none absolute right-5 top-4 text-[12px] text-paper/80">{timecode(t)}</div>
        <div className="pointer-events-none absolute bottom-4 left-5 right-5 flex items-end justify-between">
          <span className="label text-paper/70">Beat · {beat}</span>
          <span className="label text-paper/70">2 vCPU · no GPU · 286 frames</span>
        </div>
        <div className="absolute bottom-0 left-0 h-[2px] bg-signal" style={{ width: `${(t / 11.925) * 100}%` }} />
      </div>
    </figure>
  );
}
