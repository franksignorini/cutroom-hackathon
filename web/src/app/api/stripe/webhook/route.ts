import { NextResponse } from "next/server";
import { enqueue } from "@/lib/server/queue";
import { getJob } from "@/lib/server/store";
import { stripe } from "@/lib/server/stripe";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });

  let event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch (err) {
    return NextResponse.json({ error: `Bad signature: ${(err as Error).message}` }, { status: 400 });
  }

  // Paid trailers always get a place in line, even when the queue filled up during Checkout.
  if (event.type === "checkout.session.completed" && event.data.object.payment_status === "paid") {
    const jobId = event.data.object.metadata?.jobId;
    const job = jobId ? await getJob(jobId) : undefined;
    if (job?.status === "awaiting_payment") await enqueue(job);
  }
  return NextResponse.json({ received: true });
}
