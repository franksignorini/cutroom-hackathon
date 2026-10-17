/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { AgentGlyph, Wordmark } from "@/components/Glyphs";
import { Intro } from "@/components/Intro";
import { Composer } from "@/components/landing/Composer";
import { HeroMonitor } from "@/components/landing/HeroMonitor";
import { ScreeningRoom } from "@/components/landing/ScreeningRoom";
import { AGENTS } from "@/lib/events";
import { DEMO_EVENTS, FILM_FRAMES } from "@/lib/demo-run";
import { premiumEnabled, premiumLabel } from "@/lib/server/models";
import { paymentsEnabled, PRICE_CENTS, publishableKey } from "@/lib/server/stripe";

const STRIP = FILM_FRAMES.filter((f) => f.t !== 8.7 && f.t !== 1.5 && f.t !== 10.5);

const TERMINAL = DEMO_EVENTS.filter((e) => e.type === "cmd" || e.type === "out").slice(0, 11) as {
  type: "cmd" | "out";
  text: string;
  tone?: string;
}[];

export default function Home() {
  return (
    <main className="relative">
      <Intro />
      {/* HERO */}
      <section id="top" className="relative isolate overflow-hidden">
        <div className="beam -top-24 left-1/2 -translate-x-1/2" aria-hidden />
        <div className="dust" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-ink" aria-hidden />

        <nav className="relative z-10 mx-auto flex max-w-[1400px] items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" aria-label="Cutroom home">
            <Wordmark />
          </Link>
          <div className="hidden items-center gap-7 text-[13px] text-paper-2 md:flex">
            <a href="#screening" className="hover:text-paper">Screening room</a>
            <a href="#crew" className="hover:text-paper">The crew</a>
            <a href="#sandbox" className="hover:text-paper">Inside the sandbox</a>
            <a href="#stack" className="hover:text-paper">Stack</a>
            <Link href="/jobs/demo" className="rounded-full border border-line-2 px-3.5 py-1.5 text-paper hover:border-paper">
              Watch a run
            </Link>
          </div>
        </nav>

        <div className="relative z-10 mx-auto flex max-w-[980px] flex-col items-center px-5 pb-14 pt-[3vh] text-center sm:px-8 lg:pt-[5vh]">
          <p className="label mb-5 flex items-center gap-3 animate-rise">
            <span className="h-px w-8 bg-signal" />
            CreateOS × Stripe · Reel 01
            <span className="h-px w-8 bg-signal" />
          </p>
          <h1 className="animate-rise font-display text-[clamp(44px,6.6vw,104px)] font-[850] uppercase leading-[0.88] tracking-[-0.005em] paper-glow">
            Type a trailer.
            <br />
            Watch an agent <span className="whitespace-nowrap text-signal text-glow">shoot it.</span>
          </h1>
          <div className="mt-8 w-full text-left animate-rise [animation-delay:120ms] sm:mt-10">
            <Composer
              premium={{
                enabled: premiumEnabled(),
                model: premiumLabel(),
                priceCents: paymentsEnabled() ? PRICE_CENTS : null,
                publishableKey: paymentsEnabled() ? publishableKey() : null,
              }}
            />
          </div>
        </div>

        <div className="relative z-10 mx-auto grid max-w-[1400px] items-center gap-10 px-5 pb-24 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="animate-rise [animation-delay:240ms]">
            <p className="label mb-4">What happens when you roll</p>
            <p className="max-w-[520px] text-[clamp(20px,2vw,26px)] leading-snug text-paper">
              A crew of AI agents writes your trailer <span className="text-signal">as code</span> inside a CreateOS
              sandbox, runs it, watches its own frames, fixes them and hands you an MP4.
            </p>
            <p className="mt-4 text-[15px] text-muted">No GPU. No diffusion. Every frame is code.</p>
            <div className="mt-8 grid grid-cols-5 gap-2">
              {AGENTS.map((a, i) => (
                <div key={a.id} className="panel flex flex-col items-start gap-2 px-2.5 py-3">
                  <span className="flex w-full items-center justify-between text-paper-2">
                    <AgentGlyph agent={a.id} />
                    <span className="tc hidden text-[10px] text-faint sm:inline">0{i + 1}</span>
                  </span>
                  <span className="text-[12px] font-medium">{a.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="animate-rise [animation-delay:320ms]">
            <HeroMonitor />
          </div>
        </div>      </section>

      {/* FILM STRIP */}
      <section aria-label="Frames from the recorded run" className="relative overflow-hidden border-y border-line bg-ink-2 py-3">
        <div className="sprockets" />
        <div className="flex w-max animate-marquee gap-3 py-2">
          {[...STRIP, ...STRIP].map((f, i) => (
            <figure key={i} className="relative w-[260px] shrink-0 overflow-hidden rounded-[6px] border border-line">
              <img src={f.src} alt="" className="block aspect-video w-full object-cover" loading="lazy" />
              <figcaption className="tc absolute bottom-1.5 left-2 text-[10px] text-paper/70">
                {f.t.toFixed(2)} s · f{Math.round(f.t * 24)}
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="sprockets" />
      </section>

      <ScreeningRoom />

      {/* CREW */}
      <section id="crew" className="relative mx-auto max-w-[1400px] px-5 py-28 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <p className="label mb-4">The crew</p>
            <h2 className="font-display text-[clamp(40px,5.4vw,80px)] font-[850] uppercase leading-[0.9]">
              Five agents.
              <br />
              One sandbox.
              <br />
              <span className="text-signal">Zero GPUs.</span>
            </h2>
          </div>
          <p className="max-w-[560px] text-[17px] leading-relaxed text-paper-2 lg:justify-self-end">
            The same craft rules as our full trailer studio, compressed into a ten-minute run: a hook that works with the
            sound off, one idea per beat, one moment of release, and a critic that looks at the frames before anything
            ships.
          </p>
        </div>

        <ol className="mt-14 grid gap-3 md:grid-cols-5">
          {AGENTS.map((a, i) => (
            <li key={a.id} className="panel group relative flex min-h-[230px] flex-col justify-between overflow-hidden p-5">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal/60 to-transparent opacity-0 transition group-hover:opacity-100" />
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-line-2 text-paper">
                  <AgentGlyph agent={a.id} />
                </span>
                <span className="font-display text-[44px] font-[800] leading-none text-white/[0.06]">0{i + 1}</span>
              </div>
              <div>
                <h3 className="font-display text-[30px] font-[800] uppercase leading-none">{a.name}</h3>
                <p className="mt-2 text-[14px] text-paper-2">{a.role}</p>
                <p className="tc mt-4 inline-block rounded-md border border-line bg-ink px-2 py-1 text-[11.5px] text-tungsten">
                  → {a.makes}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* SANDBOX */}
      <section id="sandbox" className="relative overflow-hidden border-y border-line bg-ink-2/60">
        <div className="mx-auto grid max-w-[1400px] gap-14 px-5 py-28 sm:px-8 lg:grid-cols-2">
          <div>
            <p className="label mb-4">Inside the sandbox</p>
            <h2 className="font-display text-[clamp(40px,5.4vw,80px)] font-[850] uppercase leading-[0.9]">
              The agent writes code.
              <br />
              <span className="text-signal">CreateOS runs it.</span>
            </h2>
            <p className="mt-6 max-w-[520px] text-[17px] leading-relaxed text-paper-2">
              Every job runs in its own Firecracker microVM with its own kernel. The agent writes the film as a program,
              renders stills to check its work, and streams every file, command and frame to this page while it happens.
            </p>
            <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line bg-line">
              {[
                ["~210 ms", "to boot a microVM"],
                ["1 vCPU", "software raster, no GPU"],
                ["2 hosts", "egress allowlist, the rest is dropped"],
                ["≈ $0.005", "compute per trailer, billed per second"],
              ].map(([k, v]) => (
                <div key={k} className="bg-ink-2 p-5">
                  <dt className="font-display text-[38px] font-[800] leading-none">{k}</dt>
                  <dd className="mt-2 text-[13.5px] text-muted">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative min-w-0">
            <div className="absolute -inset-8 rounded-[40px] bg-tungsten/5 blur-3xl" aria-hidden />
            <div className="relative overflow-hidden rounded-[16px] border border-line-2 bg-[#070708] shadow-2xl">
              <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                <span className="label ml-3">sb_7f2a91 · s-1vcpu-1gb · eu</span>
              </div>
              <pre className="scroll-thin overflow-x-auto p-5 font-mono text-[13px] leading-[1.75]">
                {TERMINAL.map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.type === "cmd"
                        ? "text-paper"
                        : l.tone === "ok"
                          ? "text-go"
                          : l.tone === "warn"
                            ? "text-tungsten"
                            : "text-muted"
                    }
                  >
                    {l.type === "cmd" ? <span className="text-signal">› </span> : "  "}
                    {l.text}
                  </div>
                ))}
                <div className="text-paper">
                  <span className="text-signal">› </span>
                  <span className="inline-block h-4 w-2 translate-y-0.5 bg-paper animate-caret" />
                </div>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* STACK */}
      <section id="stack" className="mx-auto max-w-[1400px] px-5 py-28 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="label mb-4">The stack</p>
            <h2 className="font-display text-[clamp(40px,5.4vw,80px)] font-[850] uppercase leading-[0.9]">
              Provisioned from
              <br />
              <span className="text-signal">one terminal.</span>
            </h2>
            <p className="mt-6 max-w-[520px] text-[17px] leading-relaxed text-paper-2">
              Every service behind Cutroom was created with Stripe Projects: accounts, keys and environment variables in
              one CLI. Payments run on Stripe Checkout, in test mode.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {["CreateOS", "Vercel", "Upstash", "Cloudinary", "Stripe Checkout"].map((s) => (
                <span key={s} className="rounded-full border border-line-2 px-3.5 py-1.5 text-[13px] text-paper-2">
                  {s}
                </span>
              ))}
            </div>
          </div>
          <pre className="panel scroll-thin min-w-0 overflow-x-auto p-6 font-mono text-[13.5px] leading-[1.9] text-paper-2">
            <span className="text-faint"># the whole stack, from an empty directory</span>
            {"\n"}
            <span className="text-signal">$</span> stripe projects init cutroom
            {"\n"}
            <span className="text-signal">$</span> stripe projects add createos/project
            {"\n"}
            <span className="text-signal">$</span> stripe projects add vercel/project
            {"\n"}
            <span className="text-signal">$</span> stripe projects add upstash/redis
            {"\n"}
            <span className="text-signal">$</span> stripe projects add cloudinary/media
            {"\n"}
            <span className="text-signal">$</span> stripe projects status
            {"\n"}
            <span className="text-go">  ✓ 4 services healthy · spend 0.00 USD</span>
          </pre>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative overflow-hidden border-t border-line">
        <div className="beam -top-40 right-[10%]" aria-hidden />
        <div className="relative mx-auto flex max-w-[1400px] flex-col items-center px-5 py-32 text-center sm:px-8">
          <h2 className="font-display text-[clamp(56px,11vw,180px)] font-[850] uppercase leading-[0.84]">
            Every frame
            <br />
            is <span className="text-signal text-glow">code.</span>
          </h2>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#top"
              className="inline-flex items-center gap-2.5 rounded-full bg-signal px-6 py-3 font-display text-[20px] font-[800] uppercase tracking-[0.04em] text-ink shadow-[0_0_40px_-6px_rgba(255,77,26,0.9)] hover:bg-signal-2"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-ink" />
              Roll camera
            </a>
            <Link
              href="/jobs/demo"
              className="rounded-full border border-line-2 px-6 py-3 text-[15px] text-paper hover:border-paper"
            >
              Watch a recorded run
            </Link>
          </div>
        </div>
        <footer className="relative mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 border-t border-line px-5 py-6 text-[12.5px] text-muted sm:px-8">
          <Wordmark className="scale-90 opacity-80" />
          <span>Built for the CreateOS × Stripe hackathon · October 2026</span>
        </footer>
      </section>
    </main>
  );
}
