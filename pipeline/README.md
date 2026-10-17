# The crew (pipeline/)

One trailer, from a sentence to an MP4: **Director → Sound → Builder → Critic → Render**, with the studio's engine
(`../cinematic-studio`: `lib/`, `render.mjs`, `tools/sound.mjs`). It is the program that runs **inside the CreateOS
sandbox**; on the PC it runs the same way (`PIPELINE=local`) while the sandbox has no credit.

| Step | Who | What it makes |
|---|---|---|
| Director | LLM (OpenRouter), `agents/director.md` | `film.json`: request type, peak family, signature device, beats, words, look, fonts, music |
| Sound | code, `lib/plan.mjs score()` | `sound.json` → `audio/mix.wav` (VSCO 2 CE instruments + the studio's voices, -14 LUFS) |
| Builder | LLM, `agents/builder.md` | `shots/<beat>.js`: one signature shot written by hand in canvas code, rendered and fed back on errors |
| Critic | vision LLM, `agents/critic.md` | up to 3 notes on the contact sheet, applied as patches, the shots re-shot |
| Render | `render.mjs` (Chrome + ffmpeg) | `out/final.mp4` (720p, with the score), `out/poster.png` |

The film page is `film/index.html`: it reads `film.json` and builds every beat from a recipe (statement, world, slams,
card, rush, hud, drop, title) with the studio's kit, or from the Builder's custom shot. The craft rules come from the
studio (`cinematic-studio/docs/TRAILER_CRAFT.md`, `SIGNATURES.md`, the `trailer-critic` agent): hook in frame 0, one
peak with its family, one signature device, fragments not sentences, the title as the longest hold, settled stills for
the critic, a score that grows and goes silent before the peak.

## Run it
```bash
node --env-file=.env pipeline/pipeline.mjs --brief brief.json
```
`brief.json`: `{ "id", "prompt", "tier", "duration", "models": [...], "requestBudget" }`. Env: `OPENROUTER_API_KEY`
(Stripe Projects writes it to the repo root `.env`), `ENGINE_DIR` (default `../cinematic-studio`), and for the app
`CUTROOM_URL` + `JOB_TOKEN` (heartbeat, CUT, done), `FEED_PORT`, `HOST`, `PUBLIC_URL`, `CHROME_PATH`, `RENDER_SCALE`.

The feed (`lib/feed.mjs`) serves `/events` (SSE, the contract in `web/src/lib/events.ts`, replayed from the start or
from `Last-Event-ID`) and `/files/...` (stills, video, poster). The studio page connects to it directly.

## Into the sandbox
1. `node pipeline/pack.mjs` → `dist/cutroom-crew.tgz` (~220 MB: the engine files render and sound need, the pipeline,
   and only the instrument samples the score can play).
2. `cd web && node scripts/setup-sandbox.mjs` (needs CreateOS credit): creates the warm sandbox, uploads and unpacks the
   pack, installs ffmpeg and Chrome, renders a still and 4 s of video inside the VM, prints `CREATEOS_SANDBOX_ID`.
   `--mock` runs the same flow against the app's mock API.
3. `web/.env`: `PIPELINE=live`, `CREATEOS_SANDBOX_ID=...`, `CREATEOS_MOCK=off`. The boot screen's last step, "Starting
   the crew", launches `pipeline.mjs` in the sandbox and waits for its feed on the ingress URL.

## Models and fallbacks
A trailer costs 4-6 requests. `MODELS` (from `web/src/lib/server/models.ts` or `MODELS_FREE`) is tried in order:
OpenRouter first (the Stripe Projects service; 50 free requests a day), then **Groq** (`groq:openai/gpt-oss-120b`,
`groq:qwen/qwen3.8-27b`, `groq:openai/gpt-oss-20b`; `GROQ_API_KEY`) and **Gemini** (`gemini:gemini-3.5-flash`,
`gemini:gemini-2.5-flash`, `gemini:gemini-3.8-flash`, which also see images; `GOOGLE_API_KEY`), all free tiers. A busy
model (429, 5xx, "high demand", a tool call that missed the schema) cools down for a minute; a bad key drops its
provider; a provider without a key is skipped. Free models reason before they answer: the output budgets are 8-12k.

Tests:
```bash
node --test pipeline/test/llm.test.mjs                                                  # offline, fetch stubbed
node --env-file=.env --env-file=web/.env --test --test-concurrency=1 pipeline/test/providers.test.mjs   # live
```
On 2026-10-16 every Groq model and Gemini 2.5/3.5/3.8 Flash passed (tool call; images for Gemini). Gemini
3.1 Flash Lite only answered 503 and is left out. A full trailer on Groq + Gemini alone took 92 s.
