// Chat completions with tool calling, for the crew. Models are tried in order (MODELS). A model that refuses
// (401-404) is dropped for the rest of the job; one that is busy (429, 5xx, "overloaded", a timeout) cools down for a
// minute and comes back. Every request counts against REQUEST_BUDGET.
// Free models often reason before they answer: the output budgets below leave room for that (3,000+ tokens).
//
// Three providers, all on the OpenAI chat format. A model id names its provider with a prefix; no prefix = OpenRouter:
//   nvidia/nemotron-3-ultra-550b-a55b:free   OpenRouter (OPENROUTER_API_KEY): 50 free requests a day per account
//   groq:openai/gpt-oss-120b                 Groq (GROQ_API_KEY): free tier, fast; no images
//   gemini:gemini-3.8-flash                  Google AI Studio (GOOGLE_API_KEY), OpenAI-compatible endpoint; sees images
// The fallback chain mixes them, so one provider down or out of quota does not stop the crew.

export const PROVIDERS = {
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', env: 'OPENROUTER_API_KEY' },
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', env: 'GROQ_API_KEY' },
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', env: 'GOOGLE_API_KEY' },
};
const COOL_MS = 60_000;
// Free models that answer at ~100 tokens a second and think for minutes: asked only when no fast model is back within a minute
const SLOW = /nemotron|openrouter\/free|gemma/i;
const MAX_MS = 300_000; // the longest a streaming answer may run, however steadily it arrives

/** An OpenRouter stream (server-sent events) -> the same JSON a non-streaming answer has: { model, choices: [{
 *  message: { content, tool_calls }, finish_reason }], usage, error }. `progress` is touched on every token. */
export async function readStream(r, progress = { chars: 0, at: 0 }) {
  const out = { choices: [{ message: { role: 'assistant', content: '' }, finish_reason: null }] };
  const msg = out.choices[0].message, calls = [];
  const dec = new TextDecoder();
  let buf = '';
  const line = (l) => {
    // ": OPENROUTER PROCESSING" keep-alives: before the first chunk they only say the request waits in a queue; once the
    // answer has started they say the provider is writing it. Some buffer a whole tool call and send it in one piece
    // (2026-10-16: the Premium Builder sent 3 characters, then only keep-alives while it wrote the shot), so after the
    // start they count as life. MAX_MS still ends an answer that never comes.
    if (l.startsWith(':')) { if (progress.started) progress.at = Date.now(); return; }
    if (!l.startsWith('data:')) return;
    const data = l.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let j;
    try { j = JSON.parse(data); } catch { return; }
    if (j.error) { out.error = j.error; return; }
    out.model ??= j.model;
    if (j.usage) out.usage = j.usage;
    const c = j.choices?.[0];
    if (!c) return;
    progress.started = true;
    if (c.finish_reason) out.choices[0].finish_reason = c.finish_reason;
    const d = c.delta ?? {};
    const n = (d.content?.length ?? 0) + (d.reasoning?.length ?? 0) + (d.tool_calls ?? []).reduce((a, t) => a + (t.function?.arguments?.length ?? 0), 0);
    if (n) { progress.chars += n; progress.at = Date.now(); }
    if (d.content) msg.content += d.content;
    for (const t of d.tool_calls ?? []) {
      const i = t.index ?? calls.length;
      calls[i] ??= { id: t.id, type: 'function', function: { name: '', arguments: '' } };
      if (t.id) calls[i].id = t.id;
      if (t.function?.name) calls[i].function.name += t.function.name;
      if (t.function?.arguments) calls[i].function.arguments += t.function.arguments;
    }
  };
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    const parts = buf.split('\n');
    buf = parts.pop();
    parts.forEach((l) => line(l.trim()));
  }
  line(buf.trim());
  if (calls.length) msg.tool_calls = calls.filter(Boolean);
  return out;
}

/** 'groq:openai/gpt-oss-120b' -> { provider: 'groq', id: 'openai/gpt-oss-120b' }; no known prefix -> OpenRouter.
 *  A suffix sets the model's thinking on OpenRouter (its `reasoning` parameter):
 *    anthropic/claude-opus-5.5@think=medium   reasons first (low | medium | high)
 *    deepseek/deepseek-v4-pro@nothink         a model that reasons by default answers straight away */
export function route(model) {
  const [name, flag = ''] = model.split('@');
  const i = name.indexOf(':');
  const p = i > 0 ? name.slice(0, i) : '';
  const reasoning = flag === 'nothink' ? { enabled: false } : flag.startsWith('think') ? { effort: flag.split('=')[1] || 'medium' } : undefined;
  const r = PROVIDERS[p] ? { provider: p, id: name.slice(i + 1) } : { provider: 'openrouter', id: name };
  return reasoning ? { ...r, reasoning } : r;
}

export class BudgetError extends Error {}

// Models that accept images (the Critic looks at the contact sheet).
export const seesImages = (spec) => /(-vl|vision|gemma-[34]|claude|gpt-[456]|gemini|inkling|deepseek-v4\.1-flash|grok-4|kimi-k3|qwen3\.8)/i.test(route(spec).id);

/** models: one chain for every role (an array), or one per role: { director, builder, critic, default }. Premium uses
 *  roles: Claude Opus thinks for the Director and the Critic, DeepSeek V4 Pro writes the Builder's code. */
export function createLLM({ key, keys = {}, models: wanted, budget = 25, maxUsd = Infinity, onUsage = () => {}, onLog = () => {}, title = 'Cutroom' }) {
  const keyOf = { ...Object.fromEntries(Object.entries(PROVIDERS).map(([p, v]) => [p, process.env[v.env]])), ...(key ? { openrouter: key } : {}), ...keys };
  const chains = Array.isArray(wanted) ? { default: wanted } : { ...wanted, default: wanted.default ?? wanted.director ?? Object.values(wanted)[0] };
  const all = [...new Set(Object.values(chains).flat())];
  const skipped = all.filter((m) => !keyOf[route(m).provider]);
  if (skipped.length) onLog(`no key for ${[...new Set(skipped.map((m) => PROVIDERS[route(m).provider].env))].join(', ')}: skipping ${skipped.join(', ')}`, 'dim');
  for (const r of Object.keys(chains)) chains[r] = chains[r].filter((m) => keyOf[route(m).provider]);
  if (!chains.default.length) throw new Error(`no model has a key (${Object.values(PROVIDERS).map((p) => p.env).join(', ')})`);
  const dead = new Set();
  const cool = new Map(); // model -> until (ms)
  const noForce = new Set(); // models that refuse a forced tool call (Claude Opus 5.5): asked with the tool optional
  const maxCap = new Map(); // model -> the most output tokens it takes
  const total = { requests: 0, tokens: 0, usd: 0 };

  async function chat({ messages, tools, toolChoice, maxTokens = 6000, temperature = 0.8, vision = false, timeoutMs = 60_000, avoid, role, think, fast = false }) {
    const models = chains[role] ?? chains.default;
    // fast: only models that answer in seconds (the Builder: a hand-written shot is a bonus, and with Groq and Gemini out
    // for the day GLOW waited 600 s on two slow models that never answered, 2026-10-17)
    const usable = models.filter((m) => !dead.has(m) && (!vision || seesImages(m)) && !(fast && SLOW.test(m)));
    if (!usable.length) throw new Error(vision ? 'no model that sees images is available' : 'every model failed');
    // Ready models first (the one to avoid last), then the cooling ones, soonest back first.
    const now = Date.now();
    const ready = usable.filter((m) => (cool.get(m) ?? 0) <= now).sort((a, b) => (a === avoid) - (b === avoid));
    const cooling = usable.filter((m) => (cool.get(m) ?? 0) > now).sort((a, b) => cool.get(a) - cool.get(b));
    // A minute's wait for a fast model beats a slow one: with Groq and Gemini rate-limited, Nemotron wrote LUNA ROSSA's
    // shot in 278 s and again in 242 s (2026-10-17), where Groq was back after 60 s. Slow ones go after the fast cooling.
    const isSlow = (m) => SLOW.test(m);
    const fastSoon = cooling.filter((m) => !SLOW.test(m) && cool.get(m) - now <= 65_000);
    const order = [...ready.filter((m) => !isSlow(m)), ...fastSoon, ...ready.filter(isSlow), ...cooling.filter((m) => !fastSoon.includes(m))];
    let last;
    for (const model of order) {
      if (dead.has(model)) continue; // its provider was dropped earlier in this loop
      const wait = (cool.get(model) ?? 0) - Date.now();
      if (wait > 0) {
        if (wait > (fastSoon.includes(model) ? 65_000 : 30_000)) continue;
        onLog(`every model is busy: waiting ${Math.ceil(wait / 1000)} s for ${model}`, 'dim');
        await new Promise((r) => setTimeout(r, wait));
      }
      if (total.requests >= budget) throw new BudgetError(`request budget spent (${budget})`);
      // The money cap (MAX_USD_*): a trailer stops asking once its answers have cost this much, and ships what it has.
      if (total.usd >= maxUsd) throw new BudgetError(`cost cap reached: $${total.usd.toFixed(3)} of $${maxUsd.toFixed(2)}`);
      total.requests++;
      const t0 = Date.now();
      const { provider, id, reasoning: own } = route(model);
      // think: false answers straight away even on a role that thinks (the second look thought for 21k tokens and never
      // answered, 2026-10-16: every fix was kept unchecked).
      const reasoning = think === false && own ? { enabled: false } : own;
      const openrouter = provider === 'openrouter';
      // With thinking on, Anthropic only takes the default temperature.
      const thinking = !!(openrouter && reasoning?.effort);
      // OpenRouter answers as a stream. Without it a thinking model sends nothing until it is done: the Premium Director
      // (DeepSeek V4 Pro, think=medium, the long prompt) reasons for more than 90 s, and the old 90 s timeout gave up
      // on it mid-thought, paid, every time (2026-10-16), while a short request starts streaming in 1.6 s. Now
      // `timeoutMs` is the longest silence allowed: a model still sending tokens keeps going, up to MAX_MS.
      const stream = openrouter;
      const progress = { chars: 0, at: Date.now() };
      const ctl = new AbortController();
      let why = '';
      const stop = (w) => { why = w; ctl.abort(); };
      const idle = setInterval(() => { if (Date.now() - progress.at > timeoutMs) stop(`no answer in ${Math.round(timeoutMs / 1000)} s`); }, 1000);
      const cap = setTimeout(() => stop(`still answering after ${MAX_MS / 1000} s`), stream ? MAX_MS : timeoutMs);
      // Never silent: a line every 15 s shows the crew is thinking or waiting, not stuck.
      const ticker = setInterval(() => {
        const s = Math.round((Date.now() - t0) / 1000), who = role ?? 'crew';
        onLog(progress.chars > 40 ? `${who}: ${id} is thinking… ${Math.round(progress.chars / 4)} tokens, ${s} s`
          : progress.started ? `${who}: ${id} is writing its answer (it arrives in one piece)… ${s} s`
          : `${who}: waiting for ${id}… ${s} s`, 'dim');
      }, 15_000);
      const done = () => { clearInterval(ticker); clearInterval(idle); clearTimeout(cap); };
      try {
        const r = await fetch(PROVIDERS[provider].url, {
          method: 'POST',
          signal: ctl.signal,
          headers: { authorization: `Bearer ${keyOf[provider]}`, 'content-type': 'application/json', ...(openrouter ? { 'x-title': title } : {}) },
          body: JSON.stringify({
            model: id,
            messages,
            ...(tools ? { tools, ...(toolChoice && !noForce.has(model) ? { tool_choice: toolChoice } : {}) } : {}),
            max_tokens: Math.min(maxTokens, maxCap.get(model) ?? Infinity),
            ...(thinking && id.startsWith('anthropic/') ? {} : { temperature }),
            ...(openrouter ? { usage: { include: true }, ...(reasoning ? { reasoning } : {}) } : {}),
            ...(stream ? { stream: true } : {}),
          }),
        });
        const raw = stream && r.ok && /event-stream/.test(r.headers?.get?.('content-type') ?? '')
          ? await readStream(r, progress)
          : await r.json().catch((err) => { if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw err; return {}; });
        done();
        const j = Array.isArray(raw) ? raw[0] ?? {} : raw; // Gemini sometimes wraps its error in an array
        if (!r.ok || j.error) {
          // OpenRouter says "Provider returned error" and puts the provider's reason in metadata.raw (2026-10-16: Claude
          // Opus 5.5 refuses a forced tool, and only the raw message says so).
          let msg = j.error?.message ?? `HTTP ${r.status}`;
          const raw = j.error?.metadata?.raw;
          if (raw) {
            try { msg = `${msg}: ${JSON.parse(raw).error?.message ?? raw}`; } catch { msg = `${msg}: ${String(raw).slice(0, 200)}`; }
          }
          // An output budget over the model's own limit: Groq's Qwen 3.8 refused the Builder's 20k ("must be less than or
          // equal to 16384") and was dropped for the job, the Critic's only fallback with eyes when Gemini ran out (2026-10-17).
          const capN = r.status === 400 && /max_tokens/.test(msg) ? Number(/less than or equal to `?(\d+)/.exec(msg)?.[1]) : 0;
          if (capN > 0 && !maxCap.has(model)) {
            maxCap.set(model, capN);
            total.requests--;
            onLog(`${model}: at most ${capN} output tokens, asking again`, 'dim');
            return chat({ messages, tools, toolChoice, maxTokens, temperature, vision, timeoutMs, avoid, role, think, fast });
          }
          // A provider that rejects tool_choice: retry this model once without it.
          // (Anthropic refuses a forced tool together with thinking.)
          if (r.status === 400 && toolChoice && !noForce.has(model) && /tool_choice|tool choice|thinking/i.test(msg)) {
            noForce.add(model); // remembered for the rest of the job: one wasted request, not one per call
            onLog(`${model}: no forced tool calls, asking with the tool optional`, 'dim');
            return chat({ messages, tools, toolChoice, maxTokens, temperature, vision, timeoutMs, avoid, role, think, fast });
          }
          if (r.status === 401 || r.status === 403 && /api key|permission/i.test(msg)) {
            for (const m of models) if (route(m).provider === provider) dead.add(m); // a bad key: the whole provider is out
            last = new Error(`${provider}: ${msg}`);
            onLog(`${provider} → ${r.status} ${msg.slice(0, 100)} · provider dropped`, 'warn');
            continue;
          }
          // Busy, or one bad answer (Groq rejects a tool call whose arguments miss the schema): try it again later.
          const busy = r.status === 429 || r.status >= 500 || /overload|rate|busy|temporar|upstream|quota|exhausted|high demand|tool call validation|failed to call a function|failed_generation/i.test(msg);
          // a daily quota used up does not come back in a minute: Gemini's free tier ran out mid-run and every later call
          // still waited on it (2026-10-17); out for the rest of the job
          // (the per-minute limit says "exceeded your current quota" too: only the quota id in the details tells them apart)
          // Gemini says when: "Please retry in 8h22m41s" (20 free requests a day per model) or "retry in 31s"
          const rt = /(?:retry|try again) in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(msg), retryMs = rt && (rt[1] || rt[2] || rt[3]) ? ((+rt[1] || 0) * 3600 + (+rt[2] || 0) * 60 + (+rt[3] || 0)) * 1000 : 0;
          const spent = retryMs > 10 * 60_000 || /PerDay|per day|daily limit/i.test(JSON.stringify(j.error ?? j));
          if (busy && !spent) cool.set(model, Date.now() + Math.max(COOL_MS, retryMs));
          else dead.add(model);
          last = new Error(`${model}: ${msg}`);
          onLog(`${model} → ${r.status || 'error'} ${msg.slice(0, 110)} · ${busy ? 'cooling down' : 'dropped'}, next model`, 'warn');
          continue;
        }
        const choice = j.choices?.[0];
        const usage = j.usage ?? {};
        const tokens = (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
        total.tokens += tokens;
        total.usd += usage.cost ?? 0;
        onUsage({ ...total, model: j.model ?? model, ms: Date.now() - t0, last: tokens });
        if (choice?.finish_reason === 'length') onLog(`${model}: the answer hit the ${maxTokens}-token limit`, 'warn');
        if (!choice?.message) {
          cool.set(model, Date.now() + COOL_MS);
          last = new Error(`${model}: empty answer`);
          continue;
        }
        return { message: choice.message, model: j.model ?? model, finish: choice.finish_reason };
      } catch (err) {
        done();
        if (err instanceof BudgetError || /OpenRouter:/.test(err.message)) throw err;
        cool.set(model, Date.now() + COOL_MS);
        last = new Error(`${model}: ${why || (err.name === 'TimeoutError' || err.name === 'AbortError' ? `no answer in ${Math.round(timeoutMs / 1000)} s` : err.message)}`);
        onLog(`${last.message.slice(0, 140)} · cooling down, next model`, 'warn');
      }
    }
    throw last ?? new Error('every model is busy');
  }

  return { chat, total, dead };
}

/** The arguments of the first call to `name`, or a JSON object found in the text (free models sometimes answer inline). */
export function toolArgs(message, name) {
  const call = message.tool_calls?.find((c) => c.function?.name === name) ?? message.tool_calls?.[0];
  const src = call?.function?.arguments ?? message.content ?? '';
  if (typeof src === 'object') return src;
  const text = String(src).trim();
  try {
    return JSON.parse(text);
  } catch {}
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(text.slice(a, b + 1));
    } catch {}
  }
  return null;
}

export const tool = (name, description, parameters) => ({ type: 'function', function: { name, description, parameters } });
