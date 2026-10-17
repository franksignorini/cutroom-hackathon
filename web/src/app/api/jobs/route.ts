import { NextResponse } from "next/server";
import { pipelineMode } from "@/lib/server/jobs";
import { premiumEnabled, premiumLabel } from "@/lib/server/models";
import { getKV } from "@/lib/server/kv";
import { activeJobForIp, enqueue, finish, hashIp, LIMITS, premiumQuota, queueLength, rememberIp } from "@/lib/server/queue";
import { newJobId, saveJob, secret, type Job, type Tier } from "@/lib/server/store";
import { paymentsEnabled, PRICE_CENTS, publishableKey, stripe } from "@/lib/server/stripe";
import type Stripe from "stripe";

/** What this visitor may still roll: Premium trailers left (null = no limit). */
export async function GET(req: Request) {
  return NextResponse.json({ premium: await premiumQuota(hashIp(req)) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<Job> | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 8 || prompt.length > 600)
    return NextResponse.json({ error: "Describe the trailer in 8 to 600 characters." }, { status: 400 });

  const tier: Tier = body?.tier === "premium" ? "premium" : "free";
  if (tier === "premium" && !premiumEnabled())
    return NextResponse.json({ error: "Premium is switched off right now. The Free crew is ready." }, { status: 400 });

  const ipHash = hashIp(req);
  if (tier === "premium") {
    const quota = await premiumQuota(ipHash);
    if (quota.left === 0)
      return NextResponse.json(
        { error: `You have shot all ${quota.cap} Premium trailers this studio gives one visitor. The Free crew is still yours.`, premium: quota },
        { status: 429 },
      );
  }

  const mode = pipelineMode();
  // Free never goes through Checkout; Premium does when payments are on.
  const charge = paymentsEnabled() && tier === "premium";

  // No pipeline and nothing to charge: play the recorded run.
  if (mode === "replay" && !charge) return NextResponse.json({ redirect: "/jobs/demo", mode });

  // One active trailer per visitor. An unfinished Checkout is replaced; a queued or running job is re-opened.
  if (LIMITS.perIp > 0) {
    const mine = await activeJobForIp(ipHash);
    if (mine?.status === "awaiting_payment") await finish(mine, "canceled");
    else if (mine)
      return NextResponse.json(
        {
          error: "You already have a trailer in production.",
          redirect: `/jobs/${mine.id}`,
          jobId: mine.id,
          owner: mine.owner,
          // The composer offers to stop it and roll the new one (a crew that stalls must not lock its visitor out).
          active: { status: mine.status, tier: mine.tier, since: mine.startedAt ?? mine.createdAt },
        },
        { status: 409 },
      );
  }

  if ((await queueLength()) >= LIMITS.waiting)
    return NextResponse.json(
      {
        error: `The studio is full: ${LIMITS.waiting} trailers are already waiting. Try again in a few minutes, or watch a recorded run.`,
        full: true,
      },
      { status: 429 },
    );

  // Daily cap on Free trailers with a real crew: the free model quotas are per day (OpenRouter 50 requests, Groq and
  // Gemini their own), and one trailer costs 4-6. Beyond the cap, the recorded run. FREE_DAILY_CAP=0 turns it off.
  const real = mode === "live" || mode === "local";
  const capKey = `cutroom:free:${new Date().toISOString().slice(0, 10)}`;
  const freeToday = real && tier === "free" ? Number((await getKV().get(capKey)) ?? 0) : 0;
  if (real && tier === "free" && LIMITS.freeDaily > 0 && freeToday >= LIMITS.freeDaily)
    return NextResponse.json(
      {
        error: `Today's ${LIMITS.freeDaily} free trailers are all shot: the free models are out of quota until midnight UTC. Watch a recorded run${premiumEnabled() ? ", or roll a Premium one" : ""}.`,
        full: true,
      },
      { status: 429 },
    );

  const job = await saveJob({
    id: newJobId(),
    prompt,
    preset: "free",
    tier,
    duration: body?.duration === 15 ? 15 : 10,
    format: "16:9",
    effort: tier === "premium" ? "high" : "medium",
    mode,
    status: charge ? "awaiting_payment" : "queued",
    createdAt: Date.now(),
    owner: secret(),
    token: secret(),
    ipHash,
  });
  await rememberIp(job);
  if (real && tier === "free") await getKV().set(capKey, String(freeToday + 1), 60 * 60 * 26);

  if (charge) {
    const origin = new URL(req.url).origin;
    // With a publishable key the payment sheet opens on our page (Embedded Checkout); without one, Stripe's hosted
    // page. Both are test mode: stripe() refuses live keys.
    const embedded = !!publishableKey();
    const where: Stripe.Checkout.SessionCreateParams = embedded
      ? { ui_mode: "embedded_page", redirect_on_completion: "if_required", return_url: `${origin}/jobs/${job.id}` }
      : { success_url: `${origin}/jobs/${job.id}`, cancel_url: `${origin}/?canceled=1` };
    const session = await stripe().checkout.sessions.create({
      ...where,
      mode: "payment",
      custom_text: {
        submit: { message: "Test mode: card 4242 4242 4242 4242, any future date, any CVC. Nothing is charged." },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: PRICE_CENTS,
            product_data: {
              name: `Cutroom Premium trailer · ${premiumLabel()} · ${job.duration} s`,
              description: prompt.slice(0, 300),
            },
          },
        },
      ],
      metadata: { jobId: job.id },
    });
    await saveJob({ ...job, checkoutSessionId: session.id });
    if (embedded)
      return NextResponse.json({ checkout: { clientSecret: session.client_secret }, jobId: job.id, owner: job.owner });
    return NextResponse.json({ redirect: session.url, jobId: job.id, owner: job.owner });
  }

  await enqueue(job);
  return NextResponse.json({ redirect: `/jobs/${job.id}`, jobId: job.id, owner: job.owner });
}
