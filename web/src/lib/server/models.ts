import "server-only";
import type { Tier } from "./store";

// Which models the crew runs on, per tier, tried in order by pipeline/lib/llm.mjs. Every model must call tools; the
// Critic only asks the ones that see images. Ids without a prefix are OpenRouter's (the Stripe Projects service, so it
// leads); `groq:` and `gemini:` are the fallbacks when OpenRouter's free models are overloaded or out of quota (50 a
// day). All of them passed pipeline/test/providers.test.mjs on 2026-10-16 (Gemini also answers 503 "high demand" at
// times: the crew cools that model down and moves on). Free ids come and go, so re-run the test before the event.
const DEFAULTS: Record<Tier, string> = {
  free: "nvidia/nemotron-3.5-super-vl:free,groq:openai/gpt-oss-120b,gemini:gemini-3.5-flash,nvidia/nemotron-3-ultra-550b-a55b:free,gemini:gemini-2.5-flash,gemini:gemini-3.8-flash,groq:qwen/qwen3.8-27b,google/gemma-4-31b-it:free,openrouter/free,groq:openai/gpt-oss-20b",
  premium: "deepseek/deepseek-v4-pro",
};

// Premium runs on Claude Sonnet 5.5 (the A/B of 2026-10-16 on one prompt and one casting draw): it directs, writes the
// canvas code and reviews the frames. DeepSeek V4 Pro had cost $0.10-0.16 and drawn the worst films (crude pictures,
// words on top of words, a teal fire festival); Haiku 5.5 lost both its shots as the Builder and, as the Critic, wrote
// notes with no text that re-sent the values already there (NIGHT FERRY). Each role keeps the free chain behind it,
// never a paid fallback. MODELS_PREMIUM_<ROLE> overrides a role.
const PREMIUM_ROLES = {
  director: "anthropic/claude-sonnet-5.5@think=medium",
  builder: "anthropic/claude-sonnet-5.5",
  critic: "anthropic/claude-sonnet-5.5",
};

// OpenRouter allows 50 free-model requests a day (1,000 once $10 of credits were ever bought) and 20 a minute.
// The pipeline stops asking once a job has used its budget and ships what it has.
// A trailer takes 5-7 requests (plan, shot and retries, review, second look: tools/premium-cost.mjs). Premium spends
// real credit, so its cap is tight: 15 requests is at most ~$0.40 on Claude Opus 5.5 even if every step retries.
export const REQUEST_BUDGET: Record<Tier, number> = { free: 25, premium: 15 };

// The money cap per trailer, on top of the request count: the crew stops asking once its answers have cost this much
// (lib/llm.mjs reads OpenRouter's usage.cost) and ships what it has. A Premium trailer costs $0.04-0.12 on DeepSeek;
// Free costs nothing unless a free model id turns paid. Env: MAX_USD_FREE, MAX_USD_PREMIUM.
const usd = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && v !== "" && v !== undefined ? Number(v) : d);
export const MAX_USD: Record<Tier, number> = {
  free: usd(process.env.MAX_USD_FREE, 0.1),
  premium: usd(process.env.MAX_USD_PREMIUM, 1),
};

export function models(tier: Tier): string[] {
  const list = (v: string | undefined, d: string) =>
    (v || d)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const free = list(process.env.MODELS_FREE, DEFAULTS.free);
  if (tier === "free") return free;
  // Premium leads with the top model; without OpenRouter credit it answers 402 ("requires more credits", seen
  // 2026-10-16), and the crew carries on with the free chain instead of failing the paid trailer.
  const premium = list(process.env.MODELS_PREMIUM, DEFAULTS.premium);
  return [...premium, ...free.filter((m) => !premium.includes(m))];
}

/** Premium spends real OpenRouter credits, so it can be switched off (PREMIUM=off) when there are none. */
export type Crew = string[] | { director: string[]; builder: string[]; critic: string[] };

/** The chains the crew gets: Free is one chain for every agent; Premium is one per role, each ending in the free chain
 *  (no OpenRouter credit: 402, the role carries on with free models). Env: MODELS_PREMIUM_{DIRECTOR,BUILDER,CRITIC}. */
export function crew(tier: Tier): Crew {
  const free = models("free");
  // Free writes with the fast models first: Nemotron (first in MODELS_FREE because it sees images) runs ~100 tokens a
  // second and thought 3-4 minutes over a Builder shot, often to its token limit, in ten free films (2026-10-16: 5-9.5
  // min a trailer); Groq's gpt-oss-120b answered a plan in 5 s. The Critic keeps the chain as it is (it needs vision).
  // Then Gemini, before Nemotron: when Groq is rate-limited (most calls in thirty films on 2026-10-17) Nemotron took
  // 100-230 s per answer and twice ran out of tokens with no plan; Gemini Flash answers in seconds and sees images, so
  // it also leads the Critic (Nemotron's reviews hit their token limit five times that day).
  if (tier === "free") {
    const groq = free.filter((m) => m.startsWith("groq:")), gemini = free.filter((m) => m.startsWith("gemini:"));
    const text = [...groq, ...gemini, ...free.filter((m) => !groq.includes(m) && !gemini.includes(m))];
    // The Director: Groq's big model, then Gemini, then the small Groq ones: Qwen turned a guided trek into a horror film
    // called WILDFIRE with invented numbers (2026-10-17).
    const director = [...groq.slice(0, 1), ...gemini, ...text.filter((m) => m !== groq[0] && !gemini.includes(m))];
    // The Critic: Gemini, then Groq's Qwen 3.8, which sees images too (tested 2026-10-17, when Gemini's free daily quota ran
    // out mid-run and CONCRETE WAVES shipped with no review: Nemotron timed out, Gemma was rate-limited).
    const qwen = groq.filter((m) => /qwen3\.8/.test(m));
    return { director, builder: text, critic: [...gemini, ...qwen, ...free.filter((m) => !gemini.includes(m) && !qwen.includes(m))] };
  }
  const chain = (role: keyof typeof PREMIUM_ROLES) => {
    const own = (process.env[`MODELS_PREMIUM_${role.toUpperCase()}`] || PREMIUM_ROLES[role]).split(",").map((s) => s.trim()).filter(Boolean);
    return [...own, ...free.filter((m) => !own.includes(m))];
  };
  return { director: chain("director"), builder: chain("builder"), critic: chain("critic") };
}

/** The name Premium is sold under: the Director's model, the one that runs (an old MODELS_PREMIUM=claude-opus line
 *  in .env still labelled Checkout "Claude Opus 5.5" after the crew moved to DeepSeek, 2026-10-16). */
export function premiumLabel() {
  const c = crew("premium");
  return modelName((Array.isArray(c) ? c[0] : c.director[0]).split("@")[0]);
}

export function premiumEnabled() {
  return process.env.PREMIUM !== "off";
}

/** "anthropic/claude-opus-5.5" → "Claude Opus 5.5" */
export function modelName(id: string) {
  return id
    .split("/")
    .pop()!
    .replace(/:free$/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    .replace(/^Deepseek/, "DeepSeek")
    .replace(/^Gpt/, "GPT");
}
