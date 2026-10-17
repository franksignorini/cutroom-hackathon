# Cutroom

**Type a trailer, watch an agent shoot it.**

<!-- TODO before submission: hero GIF (media/hero.gif, ~15 s: boot → Builder error → fix → premiere, ≤ 10 MB) linking
     to the demo video, plus media/createos-boot.png and media/stripe-projects.png (no secrets on screen). -->

🌐 **[Try it live](https://cutroom-vert-psi.vercel.app)** · 🎬 **[Watch a recorded run](https://cutroom-vert-psi.vercel.app/jobs/demo)**

Cutroom is an AI film crew that writes a 10-15 second trailer **as code** inside a **CreateOS sandbox**, runs it,
watches its own frames, fixes what is broken and renders an MP4. No GPU, no diffusion: every frame is a program. The
whole stack is provisioned from the CLI with **Stripe Projects**.

Built for the **CreateOS × Stripe Projects "Build Agents That Run Code" hackathon** (2026-10-17).

## The problem

Small businesses, indie makers and event organizers need short promo videos (a launch, a sale, an event, a milestone)
but can't afford a motion designer or learn After Effects. Generative video models are expensive and hard to control:
the text comes out garbled and the brand gets lost. Cutroom writes the video as code, so the words are exact, the result
is reproducible and every frame can be inspected and fixed — by the agent itself.

## What we built

- **An agent that writes, runs and fixes its own code.** The Builder writes each signature shot in canvas code, the
  sandbox renders it, and crashes, off-frame text or black frames come back to the model as errors until the shot
  passes.
- **A crew of agents** (Director, Builder, Critic) plus a deterministic renderer: from one sentence to an MP4 with a
  score in a few minutes.
- **A live studio floor.** You watch the sandbox boot call by call, then the plan, files appearing, the terminal, the
  stills, the Critic's notes and the premiere — streamed straight from the sandbox.
- **A real product flow:** a job queue with limits, a CUT button, resume after refresh, Free and Premium crews.

## How it works

1. You type the trailer you want ("a horror trailer for my escape room, opening Friday").
2. The app wakes a warm **CreateOS sandbox**, locks its egress, uploads the brief and starts the crew. Each step streams
   to the browser with its timing.
3. Inside the sandbox the crew runs:

| Step | Who | What it does |
|---|---|---|
| Director | LLM | writes `film.json`: request type, beats, words, look, fonts, music |
| Sound | code | scores the trailer from the plan (`audio/mix.wav`) |
| Builder | LLM | **writes a custom shot in canvas code, runs it in the sandbox, reads the errors and rewrites it until it works** |
| Critic | vision LLM | looks at the contact sheet, writes up to 3 notes; the shots are patched and re-shot |
| Render | Chrome + ffmpeg | `final.mp4` (720p, with the score) and a poster |

4. The finished MP4 and poster are uploaded to Cloudinary with a one-off signature from the app (the secret never
   enters the sandbox), so they outlive the sandbox.

The free crew runs on OpenRouter's free models, falling back to Groq and Gemini free tiers when a model is busy.

## ⚡ How we used CreateOS Sandbox

- **The agent's code runs only in the sandbox.** Every shot the Builder writes is rendered by headless Chrome inside a
  Firecracker microVM (`s-2vcpu-4gb`, `devbox:1`); command output and exit codes go back to the agent.
- **Egress control.** Before the crew starts, the sandbox's egress is locked to 12 hosts (the model providers, fonts,
  icons, the media CDN and the app). Code written by the agent can't reach anything else.
- **Live URL (ingress).** The crew serves its event feed (SSE) and frames on port 8080; the browser connects straight to
  the sandbox's public HTTPS URL.
- **A warm sandbox, provisioned once.** `web/scripts/setup-sandbox.mjs` creates it, uploads the crew and engine (223 MB),
  installs ffmpeg and Chrome and test-renders inside the VM in about 90 s. Jobs then wake it in ~100 ms; the boot code
  waits out any in-flight pause/resume before touching it.
- **Measured inside the VM:** a still renders in 2.8 s and 4 s of video in 24 s on 2 vCPU (8.4 s and > 4 min on 1 vCPU).

Code: [`web/src/lib/server/createos.ts`](web/src/lib/server/createos.ts) (boot, egress, crew start, release) and
[`web/scripts/setup-sandbox.mjs`](web/scripts/setup-sandbox.mjs).

## 💳 How we used Stripe Projects

The whole stack was provisioned from the CLI during the event, starting from an empty directory:

```bash
stripe projects init cutroom
stripe projects add createos/free && stripe projects add createos/project   # the sandbox
stripe projects add openrouter/api                                          # the crew's models
stripe projects add vercel/hobby && stripe projects add vercel/project      # this app
stripe projects add upstash/redis --config '{"price":"free"}'               # job queue and state
stripe projects add cloudinary/free && stripe projects add cloudinary/media # MP4 + poster CDN
```

Every service is on a free plan and the project has no payment method, so nothing can be charged. Credentials land in
`.env` and `.projects/vault` (both gitignored); only the service list ([`.projects/state.json`](.projects/state.json))
is committed. Premium trailers can go through **Stripe Checkout** in test mode (`PAYMENTS=on`).

## Tech

Next.js 16 on Vercel · CreateOS Sandbox (`@nodeops-createos/sandbox`) · Stripe Projects · Stripe Checkout (test mode) ·
OpenRouter (+ Groq, Gemini fallbacks) · Upstash Redis · Cloudinary · headless Chrome + ffmpeg inside the sandbox.

## Run it locally

```bash
git clone https://github.com/franksignorini/cutroom-hackathon && cd cutroom-hackathon
stripe projects pull          # or: cp .env.example .env and fill it in
cd web && npm install && npm run dev
```

- `/` — the landing page. `/jobs/demo` — the studio floor replaying a recorded run (no keys needed).
- `PIPELINE=simulate` runs the whole job system on a recorded run; `PIPELINE=local` runs the crew on your machine;
  `PIPELINE=live` runs it in the CreateOS sandbox (`node pipeline/pack.mjs`, then `node web/scripts/setup-sandbox.mjs`).

Every variable is listed in [`.env.example`](.env.example).

## Built before vs. during the event

In the spirit of transparency:

- **Before the event:** our code-rendered trailer engine (canvas film kit, renderer, sound; it lives outside this repo
  and is packed into the sandbox image), the crew pipeline (`pipeline/`), the studio web app (`web/`) and its tools.
- **During the event:** the Stripe Projects stack from an empty directory; the CreateOS account, EU endpoint and the
  2-vCPU warm sandbox; running the crew live in the sandbox (env handling, pause/resume races, lingering crews);
  Upstash, Cloudinary and the Vercel deploy; copy and UI fixes.

<!-- TODO: ## Team — team name, members + Discord handles -->
