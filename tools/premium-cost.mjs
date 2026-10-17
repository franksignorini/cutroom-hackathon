#!/usr/bin/env node
// premium-cost.mjs — what one Premium trailer costs on OpenRouter, per model, with today's prices.
// The token profile is measured from real runs of the crew (pipeline/pipeline.mjs): the prompts it sends, the plans,
// shots and reviews that came back, the contact sheets the Critic looked at. Prices come live from OpenRouter.
//
//   node tools/premium-cost.mjs [--budget 10] [--runs cutroom-ec5f9c20,cutroom-f0d918f6,...]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = resolve(process.env.ENGINE_DIR || join(REPO, '..', 'cinematic-studio'));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BUDGET = Number(arg('budget', 10));

// ~3.6 characters per token for English prose with JSON and code (Claude's tokenizer runs close to that).
const tok = (s) => Math.ceil(String(s).length / 3.6);
// An image costs about width*height/750 tokens on Claude (capped at ~1,600 for one image).
const imgTok = (w, h) => Math.min(1600, Math.ceil((w * h) / 750));

// ---------------------------------------------------------------- the measured profile
const P = (f) => readFileSync(join(REPO, 'pipeline', f), 'utf8');
const { PLAN_SCHEMA } = await import(new URL('../pipeline/lib/plan.mjs', import.meta.url));
const runs = (arg('runs') ?? readdirSync(join(ENGINE, 'projects')).filter((d) => d.startsWith('cutroom-') && existsSync(join(ENGINE, 'projects', d, 'film.json')) && existsSync(join(ENGINE, 'projects', d, 'shots'))).join(','))
  .split(',').map((d) => join(ENGINE, 'projects', d)).filter((d) => existsSync(join(d, 'film.json')));
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const planJson = runs.map((d) => { const f = JSON.parse(readFileSync(join(d, 'film.json'), 'utf8')); return JSON.stringify({ title: f.title, logline: f.statement, look: f.look, beats: f.beats.map(({ kind, words, sub, air, image }) => ({ kind, words, sub, air, image })) }); });
const shots = runs.flatMap((d) => readdirSync(join(d, 'shots')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(d, 'shots', f), 'utf8')));
const prompt = 'A hype teaser for the online hackathon "Build Agents That Run Code" by CreateOS x Stripe Projects: AI agents that write code and run it in their own sandbox, then ship with Stripe. Saturday October 17, 12:00 PT, online.';

const plan = Math.round(avg(planJson.map(tok)));            // what the Director writes, and what every later agent reads
const code = Math.round(avg(shots.map(tok)));               // the Builder's shot
const sheet = imgTok(1636, 434);                            // the contact sheet the Critic sees (six stills, half scale)
const director = { in: tok(P('agents/director.md')) + tok(JSON.stringify(PLAN_SCHEMA)) + tok(prompt), out: plan + 150 };
const builder = { in: tok(P('agents/builder.md')) + plan + 220, out: code + 120 };
const builderRetry = { in: builder.in + code + 80, out: code + 120 };   // the error and the previous shot come back
const critic = { in: tok(P('agents/critic.md')) + tok(prompt) + plan + sheet + 120, out: 420 };
const second = { in: 380 + sheet * 2, out: 160 };
const sum = (...rs) => rs.reduce((a, r) => ({ in: a.in + r.in, out: a.out + r.out }), { in: 0, out: 0 });

const PROFILES = {
  'best case (all first try)': sum(director, builder, critic, second),
  'typical (1 Builder retry)': sum(director, builder, builderRetry, critic, second),
  'worst case (2 plan tries, 3 shots)': sum(director, director, builder, builderRetry, builderRetry, critic, second),
};

// ---------------------------------------------------------------- live prices
// The strongest affordable model of each vendor, and a cheap one. --models a,b,c to price others.
const CANDIDATES = (arg('models') ?? [
  'anthropic/claude-opus-5.5', 'anthropic/claude-sonnet-5.5', 'anthropic/claude-haiku-5.5', 'anthropic/claude-fable-5.1',
  'openai/gpt-6.1-sol', 'openai/gpt-6-astra', 'openai/gpt-6-luna',
  'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4.1-flash',
  'google/gemini-4-argon', 'google/gemini-3.8-flash',
  'x-ai/grok-4.7', 'qwen/qwen3.8-max-0902', 'moonshotai/kimi-k3', 'z-ai/glm-5.3-prime',
].join(',')).split(',');
const models = (await (await fetch('https://openrouter.ai/api/v1/models')).json()).data;
const info = Object.fromEntries(models.filter((m) => CANDIDATES.includes(m.id)).map((m) => [m.id, {
  in: m.pricing.prompt * 1e6, out: m.pricing.completion * 1e6,
  img: (m.architecture?.input_modalities ?? []).includes('image'),
}]));
// A model that reasons before answering bills those hidden tokens as output. Our free reasoning models spent 3-12k
// output tokens a request against ~1-3k of answer: ×4 is the "thinks by default" estimate. Claude only thinks when
// asked (the crew never asks), so its first column is the real one.
const THINK = 4;
// A model that cannot see images still directs and builds; the Critic then runs on a cheap one that can.
const CRITIC_FALLBACK = 'deepseek/deepseek-v4.1-flash';

const usd = (p, r) => (r.in * p.in + r.out * p.out) / 1e6;
const typical = PROFILES['typical (1 Builder retry)'];
const criticPart = sum(critic, second);
console.log(`Measured from ${runs.length} real runs: plan ≈ ${plan} tokens, shot ≈ ${code} tokens, contact sheet ≈ ${sheet} tokens`);
for (const [name, r] of Object.entries(PROFILES)) console.log(`  ${name.padEnd(36)} ${String(r.in).padStart(6)} in · ${String(r.out).padStart(6)} out`);
console.log(`
One typical Premium trailer on OpenRouter (prices fetched ${new Date().toISOString().slice(0, 10)}), and how many fit in $${BUDGET}:`);
console.log(`${'model'.padEnd(32)} ${'$/M in'.padStart(7)} ${'$/M out'.padStart(8)}  img  ${'no thinking'.padStart(11)} ${'thinking ×4'.padStart(11)}   trailers in $${BUDGET}`);
const rows = [];
for (const id of CANDIDATES) {
  const p = info[id];
  if (!p) { console.log(`${id.padEnd(32)} not on OpenRouter today`); continue; }
  const cost = (k) => {
    const r = { in: typical.in, out: typical.out * k };
    if (p.img || !info[CRITIC_FALLBACK]) return usd(p, r);
    const c = { in: criticPart.in, out: criticPart.out * k };
    return usd(p, { in: r.in - c.in, out: r.out - c.out }) + usd(info[CRITIC_FALLBACK], c);
  };
  const [plain, think] = [cost(1), cost(THINK)];
  rows.push({ id, plain, think });
  console.log(`${id.padEnd(32)} ${('$' + p.in.toFixed(2)).padStart(7)} ${('$' + p.out.toFixed(2)).padStart(8)}  ${p.img ? 'yes' : ' no'}  ${('$' + plain.toFixed(3)).padStart(11)} ${('$' + think.toFixed(3)).padStart(11)}   ${String(Math.floor(BUDGET / think)).padStart(5)}-${Math.floor(BUDGET / plain)}`);
}
console.log(`
img "no": the Critic runs on ${CRITIC_FALLBACK}. Range: with thinking ×${THINK} (low) to without (high).`);

// ---------------------------------------------------------------- the Premium crew by role (web/src/lib/server/models.ts)
// Director and Critic on Claude Opus 5.5 with thinking, the Builder on DeepSeek V4 Pro without. OpenRouter turns an
// effort into a thinking budget as a share of max_tokens (about medium 50 %, low 20 %): the Director (8,000) may think
// up to ~4,000 tokens, the Critic (12,000) ~2,400, the second look (6,000) ~1,200. "Typical" assumes half of that.
const opus = info['anthropic/claude-opus-5.5'], ds = info['deepseek/deepseek-v4-pro'];
if (opus && ds) {
  const think = { director: 4000, critic: 2400, second: 1200 };
  const role = (f) => {
    const d = usd(opus, { in: director.in, out: director.out + think.director * f });
    const b = usd(ds, sum(builder, builderRetry));
    const c = usd(opus, { in: critic.in, out: critic.out + think.critic * f }) + usd(opus, { in: second.in, out: second.out + think.second * f });
    return { d, b, c, all: d + b + c };
  };
  const [typ, max] = [role(0.5), role(1)];
  const allOpus = usd(opus, typical);
  console.log(`\nPremium crew by role: Opus 5.5 thinks (Director, Critic), DeepSeek V4 Pro builds without thinking`);
  console.log(`  typical  $${typ.all.toFixed(3)}  (director $${typ.d.toFixed(3)} · builder $${typ.b.toFixed(3)} · critic $${typ.c.toFixed(3)})  -> ${Math.floor(BUDGET / typ.all)} trailers in $${BUDGET}`);
  console.log(`  ceiling  $${max.all.toFixed(3)}  (every thinking budget used in full)                       -> ${Math.floor(BUDGET / max.all)} trailers in $${BUDGET}`);
  const none = role(0);
  console.log(`  no thinking  $${none.all.toFixed(3)}  (Opus answers straight away, DeepSeek builds)          -> ${Math.floor(BUDGET / none.all)} trailers in $${BUDGET}`);
  console.log(`  vs all on Opus without thinking $${allOpus.toFixed(3)} -> ${Math.floor(BUDGET / allOpus)} trailers`);
}

// ---------------------------------------------------------------- the Premium crew on DeepSeek (current default)
// Director: V4 Pro thinking (medium), Builder: V4 Pro without thinking, Critic + second look: V4.1 Flash thinking (low).
const flash = info['deepseek/deepseek-v4.1-flash'];
if (ds && flash) {
  const think = { director: 4000, critic: 2400, second: 1200 };
  const crewCost = (f) => {
    const d = usd(ds, { in: director.in, out: director.out + think.director * f });
    const b = usd(ds, sum(builder, builderRetry));
    const c = usd(flash, { in: critic.in, out: critic.out + think.critic * f }) + usd(flash, { in: second.in, out: second.out + think.second * f });
    return { d, b, c, all: d + b + c };
  };
  const [typ, max] = [crewCost(0.5), crewCost(1)];
  console.log(`\nPremium crew on DeepSeek: V4 Pro thinks (Director) and builds, V4.1 Flash reviews the frames`);
  console.log(`  typical  $${typ.all.toFixed(4)}  (director $${typ.d.toFixed(4)} · builder $${typ.b.toFixed(4)} · critic $${typ.c.toFixed(4)})  -> ${Math.floor(BUDGET / typ.all)} trailers in $${BUDGET}`);
  console.log(`  ceiling  $${max.all.toFixed(4)}  (every thinking budget used in full)  -> ${Math.floor(BUDGET / max.all)} trailers in $${BUDGET}`);
}
