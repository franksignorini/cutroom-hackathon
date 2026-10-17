import "server-only";
import Stripe from "stripe";

// Cutroom runs Stripe in test mode only: a live key is refused, so nothing real can be charged.

export const PRICE_CENTS = Number(process.env.TRAILER_PRICE_CENTS ?? 499);

export function paymentsEnabled() {
  return process.env.PAYMENTS === "on" && !!process.env.STRIPE_SECRET_KEY;
}

/** The browser key for Embedded Checkout (the payment sheet opens on our page). Test keys only, like the secret key. */
export function publishableKey() {
  const key = process.env.STRIPE_PUBLISHABLE_KEY;
  return key?.startsWith("pk_test_") ? key : null;
}

let client: Stripe | undefined;

export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_"))
    throw new Error("Refusing a live Stripe key: Cutroom only runs in test mode");
  return (client ??= new Stripe(key));
}
