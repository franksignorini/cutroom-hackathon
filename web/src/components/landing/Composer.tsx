"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { takeReshoot } from "@/lib/reshoot";
import { clearSession, readSession, writeSession } from "@/lib/session";
import { QUICKSTART_TEXT_ID, QuickStart } from "./QuickStart";

// Stripe.js loads only when a Premium trailer goes to checkout.
const PayModal = dynamic(() => import("./PayModal"), { ssr: false });

const EXAMPLES = [
  "A 10-second teaser for a lighthouse keeper who lights the lamp by hand one last time.",
  "Show off my website: a night sky full of stars, then our logo rises like a sunrise.",
  "Launch teaser for a pixel-art roguelike: one hero, a thousand doors, release date on the last beat.",
  "We just crossed $10k MRR. 312 customers in 41 countries. Make it feel earned, not loud.",
  "A cold, minimal teaser for a new espresso machine. Steam, chrome, one word per cut.",
];

interface Option<T> {
  value: T;
  label: string;
  why?: string; // set = locked for this MVP, with the reason shown on hover or tap
  accent?: boolean; // selected in tungsten instead of paper
  paid?: boolean; // shows a $ next to the label
}

const LENGTHS: Option<number>[] = [
  { value: 10, label: "10 s" },
  { value: 15, label: "15 s" },
  {
    value: 30,
    label: "30 s",
    why: "30 s is locked for this demo. On a 1-vCPU sandbox the extra shots and the render push a run past 20 minutes. The pipeline handles it; a live presentation doesn't.",
  },
];

// No effort picker: the crew sets it. Free runs at medium (one hand-written shot, one review), Premium at high (it
// Claude Sonnet thinks first, paints the signature shot, reviews with a second look).
const effortOf = (tier: Tier) => (tier === "premium" ? "high" : "medium");

const MINUTES: Record<number, number> = { 10: 7, 15: 9 };

const TOUR_KEY = "cutroom:quickstart"; // localStorage: the first-visit tip was dismissed

type Tier = "free" | "premium";

export interface PremiumInfo {
  enabled: boolean; // PREMIUM=off when there are no OpenRouter credits to spend
  model: string; // e.g. "Claude Opus 5.5"
  priceCents: number | null; // set when Premium goes through Stripe Checkout (test mode)
  publishableKey: string | null; // set: the payment sheet opens on this page (Embedded Checkout)
}

export function Composer({ premium }: { premium: PremiumInfo }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(10);
  const [tier, setTier] = useState<Tier>("free");
  const [explain, setExplain] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [ex, setEx] = useState(0);
  const [resume, setResume] = useState<{ id: string; reopening: boolean } | null>(null);
  const [pay, setPay] = useState<{ jobId: string; owner?: string; clientSecret: string } | null>(null);
  // 409: this visitor already has a trailer in production. Watch it, or stop it and roll the new one.
  const [taken, setTaken] = useState<{ id: string; owner?: string; status: string; tier: Tier; minutes: number } | null>(null);
  const [tour, setTour] = useState(false);
  // Premium trailers this visitor has left (the server caps them per IP); null = no cap or not known yet.
  const [quota, setQuota] = useState<{ left: number | null; cap: number } | null>(null);

  const input = useRef<HTMLTextAreaElement>(null);
  const charge = tier === "premium" && premium.priceCents !== null;

  // Back from a Free trailer's "Re-shoot on Premium": the same prompt, the Premium crew selected.
  // (Read on the next frame: sessionStorage exists only in the browser, and a dev double-mount cancels the first read.)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const again = takeReshoot();
      if (!again) return;
      setPrompt(again);
      if (premium.enabled) setTier("premium");
      input.current?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(id);
  }, [premium.enabled]);

  // A trailer started in this tab is still shooting: re-open it. A finished one gets a link.
  useEffect(() => {
    const s = readSession();
    if (!s) return;
    let stop = false;
    fetch(`/api/jobs/${s.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ status: string }>) : null))
      .then((j) => {
        if (stop) return;
        if (!j) return clearSession();
        if (j.status === "queued" || j.status === "running") {
          setResume({ id: s.id, reopening: true });
          router.replace(`/jobs/${s.id}`);
        } else if (j.status === "done") setResume({ id: s.id, reopening: false });
        else if (j.status !== "awaiting_payment") clearSession();
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [router]);

  useEffect(() => {
    fetch("/api/jobs", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ premium?: { left: number | null; cap: number } }>) : null))
      .then((j) => {
        if (!j?.premium) return;
        setQuota(j.premium);
        if (j.premium.left === 0) setTier("free");
      })
      .catch(() => {});
  }, []);
  const premiumOut = quota?.left === 0;

  // The input is the page: focus it on arrival (desktop only, so phones do not pop the keyboard).
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) input.current?.focus({ preventScroll: true });
  }, []);

  // First visit: one quick-start tip pointing at the input, once the intro has played. ?tutorial=1 forces it.
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(TOUR_KEY) === "1";
    } catch {}
    if (seen && !/[?&]tutorial=1/.test(location.search)) return;
    const intro = document.getElementById("cutroom-intro")?.hasAttribute("data-play");
    const t = window.setTimeout(() => setTour(true), intro ? 2900 : 700);
    return () => window.clearTimeout(t);
  }, []);

  const endTour = useCallback(() => {
    setTour(false);
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {}
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setEx((i) => i + 1), 4200);
    return () => window.clearInterval(id);
  }, []);

  async function roll() {
    if (tour) endTour();
    const text = prompt.trim() || EXAMPLES[ex % EXAMPLES.length];
    setBusy(true);
    setError(null);
    setFull(false);
    try {
      const r = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, duration, tier }),
      });
      const j = (await r.json()) as {
        redirect?: string;
        checkout?: { clientSecret: string };
        error?: string;
        jobId?: string;
        owner?: string;
        full?: boolean;
        active?: { status: string; tier: Tier; since: number };
        premium?: { left: number | null; cap: number };
      };
      if (j.premium) {
        setQuota(j.premium);
        if (j.premium.left === 0) setTier("free");
      }
      if (r.status === 429 && j.full) {
        setFull(true);
        throw new Error(j.error);
      }
      // Premium: the payment sheet opens here. The camera rolls when Stripe says the (test) payment went through.
      if (r.ok && j.checkout && j.jobId) {
        writeSession({ id: j.jobId, owner: j.owner });
        setPay({ jobId: j.jobId, owner: j.owner, clientSecret: j.checkout.clientSecret });
        setBusy(false);
        return;
      }
      // 409: this visitor already has a trailer in production: ask whether to watch it or replace it.
      if (r.status === 409 && j.jobId && j.active) {
        writeSession({ id: j.jobId, owner: j.owner });
        setTaken({ id: j.jobId, owner: j.owner, status: j.active.status, tier: j.active.tier, minutes: Math.max(1, Math.round((Date.now() - j.active.since) / 60000)) });
        setBusy(false);
        return;
      }
      if ((!r.ok && r.status !== 409) || !j.redirect) throw new Error(j.error ?? "Something went wrong");
      if (j.jobId) writeSession({ id: j.jobId, owner: j.owner });
      if (j.redirect.startsWith("http")) window.location.href = j.redirect;
      else router.push(j.redirect);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  // The safety valve for a crew that stalls: stop the visitor's running trailer (the same CUT as on its page), then
  // roll the one they just wrote.
  async function replace() {
    if (!taken) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/jobs/${taken.id}/cancel`, { method: "POST", headers: { "x-owner-token": taken.owner ?? "" } });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Could not stop the old trailer");
      clearSession(taken.id);
      setTaken(null);
      await roll();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  // Closing the sheet cancels the unpaid job (and expires its Checkout Session) so nothing is left half-open.
  const closePay = useCallback(() => {
    if (!pay) return;
    setPay(null);
    clearSession(pay.jobId);
    fetch(`/api/jobs/${pay.jobId}/cancel`, { method: "POST", headers: { "x-owner-token": pay.owner ?? "" } }).catch(() => {});
  }, [pay]);

  return (
    <div className="w-full">
      {pay && premium.publishableKey && (
        <PayModal
          publishableKey={premium.publishableKey}
          clientSecret={pay.clientSecret}
          model={premium.model}
          priceCents={premium.priceCents ?? 0}
          onComplete={() => router.push(`/jobs/${pay.jobId}`)}
          onClose={closePay}
        />
      )}
      {resume && (
        <Link
          href={`/jobs/${resume.id}`}
          className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-full border border-signal/40 bg-signal/10 px-4 py-1.5 text-[13px] text-paper hover:border-signal"
        >
          <span className={`h-2 w-2 rounded-full ${resume.reopening ? "bg-signal animate-rec" : "bg-go"}`} />
          {resume.reopening ? "Re-opening your trailer…" : "Your last trailer is ready · watch it"}
        </Link>
      )}
      <div className="relative">
        <div className="absolute -inset-px rounded-[20px] bg-gradient-to-b from-signal/50 via-white/10 to-white/5" />
        <div className="relative rounded-[20px] bg-ink-2 p-2 shadow-[0_40px_140px_-30px_rgba(255,77,26,0.45)] backdrop-blur-xl">
          <div
            className={`relative rounded-[14px] border bg-ink/70 px-5 pb-3 pt-4 transition focus-within:border-signal/40 ${
              tour ? "border-tungsten/50 shadow-[0_0_0_4px_rgba(255,181,71,0.10)]" : "border-line"
            }`}
          >
            {tour && (
              <QuickStart
                onDismiss={() => {
                  endTour();
                  input.current?.focus({ preventScroll: true });
                }}
              />
            )}
            <div className="label mb-2 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-signal animate-rec" />
              <span className="truncate">INT. YOUR IDEA — anything: a film, a game, a launch, your website</span>
            </div>
            <textarea
              ref={input}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                if (tour) endTour();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) roll();
              }}
              rows={3}
              maxLength={600}
              aria-label="Describe your trailer"
              aria-describedby={tour ? QUICKSTART_TEXT_ID : undefined}
              placeholder={EXAMPLES[ex % EXAMPLES.length]}
              className="w-full resize-none bg-transparent font-mono text-[17px] leading-relaxed text-paper caret-signal outline-none placeholder:text-faint sm:text-[19px]"
            />
          </div>

          {/* The toggles wrap among themselves; Roll camera stays on their line from sm up. */}
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3 px-2 pt-3 sm:flex-nowrap" onMouseLeave={() => setExplain(null)}>
            <div className="flex w-full min-w-0 flex-wrap items-end gap-x-5 gap-y-3 sm:w-auto sm:flex-1">
              <Segmented
                label="Crew"
                options={[
                  { value: "free", label: "Free" },
                  {
                    value: "premium",
                    label: "Premium",
                    accent: true,
                    paid: true,
                    why: premiumOut
                      ? `You have shot all ${quota!.cap} Premium trailers this studio gives one visitor. The Free crew runs the same pipeline on open models.`
                      : premium.enabled
                      ? undefined
                      : `Premium runs ${premium.model} on paid OpenRouter credits, and this demo has none to spend. The Free crew runs the same pipeline on open models.`,
                  },
                ]}
                value={tier}
                onChange={(v) => setTier(v as Tier)}
                onExplain={setExplain}
              />
              <Segmented label="Length" options={LENGTHS} value={duration} onChange={setDuration} onExplain={setExplain} />
            </div>
            <button
              onClick={roll}
              disabled={busy}
              className="ml-auto inline-flex shrink-0 items-center gap-2.5 rounded-full bg-signal px-6 py-3 font-display text-[21px] font-[800] uppercase leading-none tracking-[0.04em] text-ink shadow-[0_0_44px_-6px_rgba(255,77,26,0.95)] transition hover:bg-signal-2 disabled:opacity-70"
            >
              <span className={`h-2.5 w-2.5 rounded-full bg-ink ${busy ? "animate-rec" : ""}`} />
              {busy ? (charge ? "Opening checkout" : "Booting sandbox") : "Roll camera"}
            </button>
          </div>

          <div
            aria-live="polite"
            className={`mx-2 mb-1 mt-3 flex min-h-[44px] items-start gap-2.5 rounded-[10px] border px-3 py-2.5 text-[13px] leading-snug transition-colors ${
              explain ? "border-tungsten/30 bg-tungsten/[0.06] text-paper" : "border-line bg-ink/40 text-paper-2"
            }`}
          >
            {explain ? (
              <>
                <LockIcon className="mt-0.5 shrink-0 text-tungsten" />
                <span>{explain}</span>
              </>
            ) : (
              <>
                <ClockIcon className="mt-0.5 shrink-0 text-muted" />
                <span>
                  <span className="text-paper">
                    {duration} s · {effortOf(tier) === "high" ? "High" : "Medium"} effort · {tier === "premium" ? "Premium" : "Free"} crew · ≈ {MINUTES[duration]} min
                    {charge && ` · ${(premium.priceCents! / 100).toFixed(2)} in Stripe test mode`}
                    {tier === "premium" && quota?.left != null && ` · ${quota.left} of ${quota.cap} Premium left`}
                  </span>{" "}
                  {tier === "premium"
                    ? `${premium.model} directs, writes every shot and reviews the frames`
                    : "Open models on OpenRouter's free tier"}
                  , in a 1-vCPU CreateOS sandbox: one plan, every shot written as code, one critique round, one fix pass.
                </span>
              </>
            )}
          </div>

          {taken && (
            <div className="mx-3 mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] border border-tungsten/30 bg-tungsten/[0.06] px-4 py-3 text-[13px]" role="alert">
              <span className="min-w-0 flex-1 text-paper-2">
                <span className="text-paper">You already have a trailer {taken.status === "queued" ? "in line" : "shooting"}</span>
                {" "}({taken.tier === "premium" ? "Premium, " : ""}started {taken.minutes} min ago). One at a time per visitor.
                {taken.tier === "premium" && " Stopping it gives no refund."}
              </span>
              <span className="flex shrink-0 gap-2">
                <Link href={`/jobs/${taken.id}`} className="rounded-full border border-line-2 px-3.5 py-1.5 text-paper hover:border-paper">
                  Watch it
                </Link>
                <button
                  onClick={replace}
                  disabled={busy}
                  className="rounded-full border border-signal/50 px-3.5 py-1.5 text-signal hover:bg-signal hover:text-ink disabled:opacity-60"
                >
                  {busy ? "Stopping…" : "Stop it and roll this one"}
                </button>
              </span>
            </div>
          )}
          {error && (
            <p className="px-3 pb-2 text-[13px] text-signal-2">
              {error}{" "}
              {full && (
                <Link href="/jobs/demo" className="underline hover:text-paper">
                  Watch a recorded run
                </Link>
              )}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px] text-paper-2">
        <Link href="/jobs/demo" className="group inline-flex items-center gap-2 hover:text-paper">
          <span className="grid h-6 w-6 place-items-center rounded-full border border-line-2 group-hover:border-paper">
            <svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor" aria-hidden>
              <path d="M0 0v10l9-5z" />
            </svg>
          </span>
          Watch a full recorded run
        </Link>
        <span className="text-faint">·</span>
        <span className="text-muted">Stripe test mode · nothing is charged</span>
      </div>
    </div>
  );
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  onExplain,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  onExplain: (why: string | null) => void;
}) {
  const [shake, setShake] = useState<T | null>(null);
  return (
    <div role="radiogroup" aria-label={label}>
      <div className="label mb-1.5 text-[10px]">{label}</div>
      <div className="inline-flex rounded-full border border-line bg-ink/60 p-0.5">
        {options.map((o) => {
          const locked = !!o.why;
          const on = value === o.value;
          return (
            <button
              key={String(o.value)}
              role="radio"
              aria-checked={on}
              aria-disabled={locked || undefined}
              aria-label={locked ? `${o.label}, locked for this MVP` : undefined}
              onMouseEnter={() => onExplain(o.why ?? null)}
              onFocus={() => onExplain(o.why ?? null)}
              onBlur={() => onExplain(null)}
              onClick={() => {
                if (!locked) return onChange(o.value);
                onExplain(o.why!);
                setShake(o.value);
                window.setTimeout(() => setShake(null), 400);
              }}
              className={`tc inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] transition ${
                on
                  ? o.accent
                    ? "bg-tungsten text-ink shadow-[0_0_18px_-4px_rgba(255,181,71,0.8)]"
                    : "bg-paper text-ink"
                  : locked
                    ? "cursor-help text-faint hover:text-tungsten"
                    : "text-muted hover:text-paper"
              } ${shake === o.value ? "animate-[shake_0.4s]" : ""}`}
            >
              {locked ? (
                <LockIcon className="h-2.5 w-2.5" />
              ) : (
                o.paid && <DollarIcon className={on ? "" : "text-tungsten"} />
              )}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="12" height="13" viewBox="0 0 10 11" fill="none" stroke="currentColor" strokeWidth="1.4" className={className} aria-hidden>
      <rect x="1" y="5" width="8" height="5.5" rx="1" />
      <path d="M3 5V3.5a2 2 0 0 1 4 0V5" />
    </svg>
  );
}

function DollarIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" className={className} aria-hidden>
      <circle cx="7" cy="7" r="6" />
      <path d="M9 5c-.3-.6-1-1-2-1-1.1 0-1.9.6-1.9 1.4C5.1 7.3 9 6.5 9 8.5c0 .9-.9 1.5-2 1.5-1 0-1.7-.4-2.1-1M7 2.9V4M7 10v1.1" />
    </svg>
  );
}

function ClockIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" className={className} aria-hidden>
      <circle cx="6" cy="6" r="5" />
      <path d="M6 3v3l2 1.4" />
    </svg>
  );
}
