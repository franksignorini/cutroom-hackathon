"use client";

import { useEffect, useRef, useState } from "react";
import { timecode } from "@/lib/feed";

// A 2.5 s film-leader intro: 3-2-1 countdown with the sweep, sprockets running through the gate, the wordmark
// slams in on a flash, then an iris opens on the site. Pure CSS timing (it starts at first paint, before JS);
// JS only runs the timecode, handles skip and unmounts it.
//
// The inline script decides before the first paint: it plays once per browser tab (sessionStorage), never with
// reduced motion, and always with ?intro=1 (handy for the demo).
const DECIDE = `(function(){try{var el=document.getElementById("cutroom-intro");if(!el)return;var k="cutroom:intro";var force=/[?&]intro=1/.test(location.search);var calm=matchMedia("(prefers-reduced-motion: reduce)").matches;if(force||(!calm&&!sessionStorage.getItem(k))){el.setAttribute("data-play","");sessionStorage.setItem(k,"1")}}catch(e){}})();`;

export function Intro() {
  const ref = useRef<HTMLDivElement>(null);
  const tc = useRef<HTMLSpanElement>(null);
  const frame = useRef<HTMLSpanElement>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Not playing (already seen, reduced motion, or a client-side navigation): drop it.
    if (!el.hasAttribute("data-play")) {
      const t = window.setTimeout(() => setGone(true), 0);
      return () => window.clearTimeout(t);
    }
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const s = (performance.now() - start) / 1000;
      if (tc.current) tc.current.textContent = timecode(s);
      if (frame.current) frame.current.textContent = String(Math.floor(s * 24)).padStart(3, "0");
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const done = window.setTimeout(() => setGone(true), 2650);
    let out: number | undefined;
    const skip = () => {
      el.classList.add("intro-skip");
      out = window.setTimeout(() => setGone(true), 240);
    };
    window.addEventListener("keydown", skip, { once: true });
    el.addEventListener("pointerdown", skip, { once: true });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
      window.clearTimeout(out);
      window.removeEventListener("keydown", skip);
      el.removeEventListener("pointerdown", skip);
    };
  }, []);

  if (gone) return null;

  return (
    <>
      <div ref={ref} id="cutroom-intro" className="intro" aria-hidden suppressHydrationWarning>
        <div className="intro-gate">
          <div className="intro-sprockets left-0" />
          <div className="intro-sprockets right-0" />
          <div className="intro-cross intro-cross-h" />
          <div className="intro-cross intro-cross-v" />

          <div className="intro-leader">
            <div className="intro-sweep" />
            <div className="intro-ring" />
            <div className="intro-ring intro-ring-inner" />
            <span className="intro-n" style={{ animationDelay: "0.1s" }}>
              3
            </span>
            <span className="intro-n" style={{ animationDelay: "0.55s" }}>
              2
            </span>
            <span className="intro-n" style={{ animationDelay: "1s" }}>
              1
            </span>
          </div>

          <div className="intro-flash" />

          <div className="intro-word">
            <span className="flex items-center gap-[0.18em]">
              <span className="inline-block h-[0.16em] w-[0.16em] rounded-full bg-signal shadow-[0_0_30px_rgba(255,77,26,0.9)]" />
              <span>
                <span className="text-signal text-glow">Cut</span>room
              </span>
            </span>
            <span className="label text-paper/70">Every frame is code</span>
          </div>

          <div className="intro-corners label">
            <span className="absolute left-5 top-4 sm:left-14 sm:top-6">Cutroom · Reel 01 · Take 1</span>
            <span className="tc absolute right-5 top-4 text-paper/80 sm:right-14 sm:top-6">
              <span ref={tc}>00:00:00:00</span>
            </span>
            <span className="absolute bottom-4 left-5 sm:bottom-6 sm:left-14">Picture start</span>
            <span className="absolute bottom-4 right-5 sm:bottom-6 sm:right-14">
              f<span ref={frame}>000</span> · 2 vCPU · no GPU
            </span>
          </div>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: DECIDE }} />
    </>
  );
}
