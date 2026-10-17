"use client";

import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Stripe's own Embedded Checkout, in test mode, opened over the landing page when a Premium trailer rolls.
// Loaded with next/dynamic, so Stripe.js is only fetched when someone actually picks Premium. Portaled to <body>:
// the composer sits in an animated (transformed) box, which would otherwise trap `position: fixed` and the z-index.

const TEST_CARD = "4242 4242 4242 4242";

let stripePromise: Promise<Stripe | null> | undefined;

export default function PayModal({
  publishableKey,
  clientSecret,
  model,
  priceCents,
  onComplete,
  onClose,
}: {
  publishableKey: string;
  clientSecret: string;
  model: string;
  priceCents: number;
  onComplete: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  stripePromise ??= loadStripe(publishableKey);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(TEST_CARD.replaceAll(" ", ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {}
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pay for a Premium trailer (Stripe test mode)"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/80 backdrop-blur-md sm:items-center sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[94svh] w-full max-w-[520px] animate-rise flex-col overflow-hidden rounded-t-[20px] border border-line-2 bg-ink-2 shadow-[0_40px_140px_-30px_rgba(255,181,71,0.45)] sm:rounded-[20px]">
        <div className="flex items-start gap-3 px-5 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <div className="label flex items-center gap-2 text-[10px]">
              <span className="h-1.5 w-1.5 rounded-full bg-tungsten" />
              Premium crew · {model}
            </div>
            <p className="mt-1 font-display text-[26px] font-[800] uppercase leading-none text-paper">
              ${(priceCents / 100).toFixed(2)} <span className="text-[15px] text-muted">per trailer</span>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close and cancel"
            className="grid h-8 w-8 place-items-center rounded-full border border-line-2 text-muted transition hover:border-paper hover:text-paper"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M1 1l8 8M9 1L1 9" />
            </svg>
          </button>
        </div>

        <div className="mx-5 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-tungsten/30 bg-tungsten/[0.07] px-3 py-2 text-[12.5px] text-paper">
          <span className="tc text-[10.5px] uppercase tracking-[0.16em] text-tungsten">Test mode</span>
          <span className="text-paper-2">Nothing is charged. Pay with Stripe&apos;s test card:</span>
          <button
            onClick={copy}
            className="tc ml-auto rounded-full border border-tungsten/40 px-2.5 py-1 text-[11px] text-tungsten transition hover:bg-tungsten hover:text-ink"
          >
            {copied ? "Copied" : `${TEST_CARD} · copy`}
          </button>
        </div>

        <div className="min-h-[420px] flex-1 overflow-y-auto bg-white">
          <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret, onComplete }}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      </div>
    </div>,
    document.body,
  );
}
