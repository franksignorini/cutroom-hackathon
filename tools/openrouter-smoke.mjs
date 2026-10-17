#!/usr/bin/env node
// Prova di OpenRouter con i modelli Free: una richiesta per modello, con un tool, come farà il Builder.
// Spende 1 richiesta per modello sulle 50 gratuite del giorno (3 con la lista di default). Mai modelli a pagamento.
//
//   node tools/openrouter-smoke.mjs                 # legge OPENROUTER_API_KEY e MODELS_FREE da web/.env o dal .env di Stripe Projects
//   node tools/openrouter-smoke.mjs google/gemma-4-31b-it:free
import { readFileSync } from "node:fs";

// web/.env first, then the .env Stripe Projects writes at the repo root (empty values do not count).
const env = {};
for (const file of ["../web/.env", "../.env"]) {
  try {
    for (const line of readFileSync(new URL(file, import.meta.url), "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)=([^#\s]*)/);
      if (m && m[2] && !env[m[1]]) env[m[1]] = m[2];
    }
  } catch {}
}
const key = process.env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY;
if (!key) {
  console.error("OPENROUTER_API_KEY mancante (web/.env o variabile d'ambiente).");
  process.exit(1);
}
const models = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (process.env.MODELS_FREE || env.MODELS_FREE || "nvidia/nemotron-3-ultra-550b-a55b:free,nvidia/nemotron-3.5-super-vl:free,google/gemma-4-31b-it:free,openrouter/free").split(",").filter((m) => !/^(groq|gemini):/.test(m)); // the fallbacks have their own test: pipeline/test/providers.test.mjs
const paid = models.filter((m) => !m.endsWith(":free") && m !== "openrouter/free");
if (paid.length) {
  console.error(`Solo modelli gratuiti: ${paid.join(", ")} costano.`);
  process.exit(1);
}

const tools = [
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write a file in the job workspace",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
  },
];

let failed = 0;
for (const model of models) {
  const t = performance.now();
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Cutroom smoke test" },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        tools,
        messages: [
          { role: "system", content: "You are the Director of a 10-second film trailer. Use the tools." },
          { role: "user", content: 'Write plan.json with {"title": "...", "beats": 3} for: a lighthouse keeper\'s last night.' },
        ],
      }),
    });
    const ms = Math.round(performance.now() - t);
    const j = await r.json();
    if (!r.ok) throw new Error(`${r.status} ${j.error?.message ?? JSON.stringify(j).slice(0, 200)}`);
    const msg = j.choices?.[0]?.message ?? {};
    const call = msg.tool_calls?.[0]?.function;
    console.log(
      `OK   ${model} → ${j.model} · ${ms} ms · ${j.usage?.prompt_tokens ?? "?"} in / ${j.usage?.completion_tokens ?? "?"} out · ` +
        (call ? `tool ${call.name}(${call.arguments.slice(0, 80)})` : `no tool call: "${(msg.content ?? "").slice(0, 80)}"`),
    );
  } catch (err) {
    failed++;
    console.log(`FAIL ${model} · ${Math.round(performance.now() - t)} ms · ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
