# Cutroom

Type a trailer, watch an agent shoot it. An AI crew writes the trailer **as code** inside a CreateOS sandbox, runs
it, watches its own frames, fixes them and renders an MP4. No GPU, no diffusion: every frame is code.

## Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

- `/`: the landing page. The prompt box is focused on arrival.
- `/jobs/demo`: the studio floor, replaying a recorded run. `?speed=1|4|12` (default 4).

## How it fits together

- **`src/lib/events.ts`**: the event contract. The pipeline inside the sandbox streams these events over SSE: sandbox,
  agent, say, plan, fs, cmd/out, still, note/fix, render, cost, done. The same reducer builds the UI for live runs
  and replays.
- **`src/lib/demo-run.ts`**: a recorded run (the studio's 12 s canvas film), used when no live pipeline is wired, and
  as the demo's safety net.
- **`src/lib/feed.ts`**: `useReplayFeed` (recorded run, any speed) and `useLiveFeed` (`EventSource` on the sandbox's
  ingress URL).
- **`src/app/api/jobs`**: creates a job (10 or 15 s, always 16:9).
  - Without payments or a live pipeline, it plays the replay.
  - With `PAYMENTS=on`, a Premium job goes through a Stripe Checkout Session first (test mode only: live keys are
    refused). Free jobs never do.
  - With `STRIPE_PUBLISHABLE_KEY` (`pk_test_`) the payment sheet is Stripe's Embedded Checkout, opened in a modal on
    the landing page (`src/components/landing/PayModal.tsx`), with the 4242 test card one click away. Without it,
    the visitor goes to Stripe's hosted page. Closing the sheet cancels the job and expires the session.
  - With `PIPELINE=live`, it starts the sandbox job. This part is still a stub in `src/lib/server/jobs.ts`.
- **`PIPELINE=local`** (`src/lib/server/local.ts`): the real crew (`../pipeline/pipeline.mjs`, see its README) runs on
  this machine as a child of the Next server. The studio follows its feed exactly as it will in the sandbox.
- **CreateOS boot** (`src/lib/server/createos.ts`, `POST /api/jobs/[id]/boot`, `src/components/studio/BootScreen.tsx`):
  when a job gets its slot, the studio first shows the sandbox booting. The server runs each step with the official
  SDK (`@nodeops-createos/sandbox`): whoami, create (or wake `CREATEOS_SANDBOX_ID`), egress allowlist, upload
  `brief.json`, a toolchain check, the preview URL. Each step streams to the screen (NDJSON) with the time it took,
  then "Generated in xx ms", and the record is saved on the job, so a refresh goes straight to the studio.
  - **The key:** `CREATEOS_PROJECT_API_KEY`, written by `stripe projects add createos/project` to the repo root's
    `.env`, which `next.config.ts` also reads (it never overrides `web/.env`). `CREATEOS_SANDBOX_API_KEY` wins if set.
  - **Without a key, or with `CREATEOS_MOCK=on`,** the SDK talks to `src/app/api/mock/createos`, a mock of the
    CreateOS REST API (same paths, JSend envelope, published latencies). The screen shows a "mock API" badge.
    Today the real API answers `402 insufficient credit` when creating a sandbox, so `CREATEOS_MOCK=on` stays until
    the account has credit.
  - When a job ends, `releaseSandbox()` destroys its sandbox (or pauses the warm one, `CREATEOS_SANDBOX_ID`).
- **`src/app/api/stripe/webhook`**: starts a paid job on `checkout.session.completed`. `GET /api/jobs/[id]` also checks
  the session directly, so the flow works without webhook forwarding.
- **Job store:** Upstash Redis REST when configured, process memory otherwise.

### Jobs, queue and the CUT button (`src/lib/server/queue.ts`)

- **Limits:** `MAX_RUNNING` jobs shoot at once (default 2) and `MAX_QUEUE` wait (default 5). Beyond that, a new
  request gets "the studio is full" (429). Each visitor (by hashed IP) can have one active job; asking again re-opens
  it (409).
- **No cron.** Every API call on a job runs `tick()`, behind a Redis lock. It:
  - reaps dead jobs (a live run that stops sending heartbeats for 90 s, or runs over 15 min, becomes `failed`);
  - drops queued jobs nobody is watching for 2 min (`abandoned`);
  - starts the next jobs in line.
- **CUT:** only the creator's browser holds the owner token (`sessionStorage`). `POST /api/jobs/:id/cancel` frees the
  slot at once. A live pipeline learns about it from its next `POST /api/jobs/:id/heartbeat`, whose answer is
  `{ stop: true }`, and reports the end with `POST /api/jobs/:id/done`.
- **Refresh:** the job id lives in `sessionStorage`. The home page re-opens a running job, and the studio joins it at
  its current point, not from the start.
- **`PIPELINE=simulate`:** the whole system runs with the recorded run standing in for the sandbox.

### Free and Premium (`src/lib/server/models.ts`)

The visitor picks the crew on the input. Both tiers run the same pipeline through OpenRouter; only the models change.
- **Free** (default): OpenRouter's free models, tried in order (`MODELS_FREE`). OpenRouter allows 50 free requests a
  day per account (1,000 once $10 of credits were ever bought), so a job gets a budget of 25.
- **Premium:** the top model (`MODELS_PREMIUM`, Claude Opus 5.5), paid through Checkout when `PAYMENTS=on`.
  `PREMIUM=off` locks it in the UI when there are no credits to spend. The landing page is static, so changing it
  needs a rebuild.

Vercel only runs short routes. The 6-10 minute job runs inside the CreateOS sandbox, and the browser reads its SSE
stream directly.

## Stack (provisioned with Stripe Projects)

CreateOS (sandbox) · Vercel (this app) · Upstash (job state) · OpenRouter (the crew's models) · Cloudinary (MP4 CDN) ·
Stripe Checkout (test mode, Premium).

Built on our existing code-rendered trailer engine (`lib/`, `render.mjs`), which runs inside the sandbox image.
