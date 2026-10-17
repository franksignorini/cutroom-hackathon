<!-- DRAFT. Move to the repo root as README.md after the code is copied in (22:00 step).
     Fill the <...> placeholders. Keep the "Built before vs. during the event" section honest. -->

# Cutroom

**Type a trailer, watch an agent shoot it.**

<!-- HERO: a GIF (≤10 MB, ~15 s, 960px wide) of the studio floor: prompt → sandbox boot → Builder error → fix →
     premiere. Save as media/hero.gif (NOT under docs/, which is gitignored).
     Clicking it opens the full demo video. -->
[![Cutroom demo: an AI crew writes, runs and fixes a trailer inside a CreateOS sandbox](media/hero.gif)](<demo video URL>)

▶️ **[Watch the 3-minute demo](<demo video URL>)** · 🌐 **[Try it live](<https://...vercel.app>)**

Cutroom is an AI film crew that writes a 10-15 second trailer **as code** inside a **CreateOS sandbox**, runs it,
watches its own frames, fixes what is broken and renders an MP4. No GPU, no diffusion: every frame is a program. The
whole stack is provisioned from the CLI with **Stripe Projects**.

Built for the **CreateOS × Stripe Projects "Build Agents That Run Code" hackathon** (2026-10-17).

## What we built

- **An agent that writes, runs and fixes its own code:** the Builder writes each shot in canvas code, the sandbox runs
  it, crashes / off-frame text / black frames come back as errors, and the agent rewrites until it passes.
- **A crew of agents** (Director, Builder, Critic) plus a deterministic renderer: from one sentence to an MP4 with a
  score, in a few minutes.
- **A live studio floor:** you watch the sandbox boot, files appear, the terminal, the stills, the Critic's notes and
  the premiere — in real time, streamed straight from the sandbox.
- **A real product flow:** job queue with limits, a CUT button, resume after refresh, Free / Premium tiers with
  Stripe Checkout (test mode).

| Prompt | Result |
|---|---|
| "<demo prompt 1>" | <poster / GIF 1> |
| "<demo prompt 2>" | <poster / GIF 2> |
| "<demo prompt 3>" | <poster / GIF 3> |

## ⚡ Spotlight: CreateOS Sandbox

<!-- Screenshot of the boot screen (each SDK call with its timing) goes here: media/createos-boot.png -->
![CreateOS sandbox booting, each SDK call streamed with its timing](media/createos-boot.png)

<Fill from "How we used CreateOS Sandbox" below; keep the feature list judges score: egress control, live URL,
pause/resume, fork, exec + exit codes.>

## 💳 Spotlight: Stripe Projects

<!-- Screenshot of `stripe projects status` / `spend` in the terminal (no secrets visible): media/stripe-projects.png -->
![The whole stack provisioned with Stripe Projects](media/stripe-projects.png)

<Fill from "How we used Stripe Projects" below: init from an empty folder, services added, spend, Checkout.>

## The problem

Small businesses, indie makers and event organizers need short promo videos (a launch, a sale, an event, a milestone)
but can't afford a motion designer or learn After Effects. Generative video models are expensive, slow and
uncontrollable: the text is garbled and the brand is lost. Cutroom writes the video as code, so the words are exact,
the result is reproducible and every frame can be inspected and fixed.

## How it works

1. You type the trailer you want ("a horror trailer for my escape room, opening Friday").
2. The app boots a **CreateOS sandbox** and streams each step to the browser.
3. Inside the sandbox the crew runs:

| Step | Who | What it does |
|---|---|---|
| Director | LLM | writes `film.json`: beats, words, look, fonts, music |
| Sound | code | scores the trailer from the plan (`audio/mix.wav`) |
| Builder | LLM | **writes a custom shot in canvas code, runs it in the sandbox, reads the errors (crash, off-frame text, black frame) and rewrites it until it works** |
| Critic | vision LLM | looks at the contact sheet, writes up to 3 notes, the shots are patched and re-shot |
| Render | Chrome + ffmpeg | `final.mp4` (720p, with the score) and a poster |

4. You watch it live on the **studio floor**: the crew, the script, files appearing, the terminal, stills, the
   timeline, then the premiere.

### The agent loop: write → run → fix

<Short example from a real run: the Builder's first shot fails with "<error>", the sandbox output goes back to the
model, the second attempt passes. Screenshot or GIF here.>

## How we used CreateOS Sandbox

- **Code execution:** the agent's code (shots, the film page) runs only inside the sandbox micro-VM, never on our
  server. `exec` output and exit codes go back to the agent.
- **Egress control:** the sandbox can reach only the model providers, fonts, icons, our media CDN and the app. Code
  written by the agent can't call anywhere else.
- **Live URL (ingress):** the crew's event feed (SSE) and the frames are served from the sandbox's public HTTPS URL;
  the browser connects to it directly.
- **Pause / resume:** a warm sandbox is reused between jobs and paused when idle.
- <fork / other features, if used>

## How we used Stripe Projects

The whole stack was provisioned from the CLI during the event, starting from an empty directory:

```bash
stripe projects init cutroom
stripe projects add createos/project
stripe projects add openrouter/api
stripe projects add upstash/redis
stripe projects add cloudinary/media
stripe projects add vercel/project
```

Credentials land in `.env` (never committed). <`stripe projects status` / `spend` output or screenshot.>
Premium trailers can be paid with **Stripe Checkout** (test mode).

## Tech

Next.js (Vercel) · CreateOS Sandbox (`@nodeops-createos/sandbox`) · Stripe Projects · Stripe Checkout (test mode) ·
OpenRouter · Upstash Redis · Cloudinary · Chrome headless + ffmpeg (inside the sandbox).

## Run it locally

```bash
git clone <repo-url> && cd <repo>
stripe projects init   # or copy .env.example to .env and fill it
cd web
npm install
npm run dev
```

- `/` — the landing page.
- `/jobs/demo` — the studio floor replaying a recorded run (no keys needed).
- `PIPELINE=simulate` runs the whole job system with a recorded run; `PIPELINE=live` uses the CreateOS sandbox.

See [`.env.example`](.env.example) for every variable.

## Built before vs. during the event

In the spirit of transparency:

- **Before the event:** our code-rendered trailer engine (canvas film kit, renderer, sound), used as a dependency
  inside the sandbox image, plus <list what else was prepared>.
- **During the event:** the Stripe Projects stack, <list: sandbox wiring, live pipeline, deploy, agent prompts tuning,
  ...>.

## Team

<Team name> — <member (Discord handle)>, ...
