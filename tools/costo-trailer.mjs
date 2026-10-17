#!/usr/bin/env node
// What one Cutroom trailer costs: CreateOS compute + OpenRouter tokens. Zero dependencies.
//
//   node tools/costo-trailer.mjs                          every scenario, as markdown tables
//   node tools/costo-trailer.mjs --profile high --seconds 15
//
// Every number below is an estimate until the CreateOS spike measures a real run (06-piano.md, section 4).
// When it does, replace PHASES and PROFILES with the measured values and run this again.

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) => (a.startsWith("--") ? [[a.slice(2), all[i + 1]]] : [])),
);

// ---------------------------------------------------------------- prices (read on 2026-10-13)

// CreateOS bills per second while the sandbox runs. Paused: RAM and storage only. $1 = 100 credits (MPP gateway).
const CREATEOS = { vcpuHour: 0.03616, gibHour: 0.01159, storageGbHour: 0.0001584, usdPerCredit: 0.01 };

const SHAPES = {
  free: { label: "Free · s-1vcpu-1gb", vcpu: 1, gib: 1, diskGb: 10, cpuSpeedup: 1 },
  // 4 render workers do not scale perfectly; 3.2x is a guess to replace with the spike's number.
  beginner: { label: "Beginner · s-4vcpu-8gb", vcpu: 4, gib: 8, diskGb: 10, cpuSpeedup: 3.2 },
};

// OpenRouter, $ per million tokens (https://openrouter.ai/api/v1/models). Cache writes: the 5-minute cache.
const MODELS = [
  { label: "Free · Inkling :free", tier: "free", in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
  { label: "Claude Haiku 5.5", in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  { label: "Claude Sonnet 5.5", in: 2, out: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  { label: "Premium · Claude Opus 5.5", tier: "premium", in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
  { label: "Claude Fable 5.1", in: 10, out: 50, cacheRead: 0.25, cacheWrite: 12.5 },
];

// ---------------------------------------------------------------- what a job does

// Seconds per phase for a 10 s trailer on 1 vCPU. `wait` is time spent waiting on the model (does not get faster
// with more CPU); `cpu` is Chrome and ffmpeg (stills, render), which does.
const PHASES = {
  boot: { wait: 10, cpu: 0 }, // wake the warm sandbox, upload the brief, copy the template
  director: { wait: 45, cpu: 0 },
  builder: { wait: 120, cpu: 60 }, // writes the shots, renders half-scale stills to check them
  critic: { wait: 30, cpu: 5 }, // contact sheet + one vision call
  fix: { wait: 40, cpu: 20 },
  render: { wait: 0, cpu: 150 }, // 10 s at 720p, 24 fps, software raster: THE number the spike must measure
  upload: { wait: 10, cpu: 0 },
  idle: { wait: 60, cpu: 0 }, // running after the job until auto-pause kicks in
};

// Token sizes. Images follow Anthropic's rule: width x height / 750.
const PROMPTS = {
  director: { system: 7000, brief: 400, out: 3500 }, // narrator + goosebumps + wow-director, condensed
  builder: { system: 12000, filmJson: 1500, toolResult: 300 }, // kit API + shot cookbook + rules
  critic: { system: 4000, context: 2000, out: 900 },
  stillTokens: Math.round((960 * 540) / 750), // a half-scale 16:9 still
  sheetTokens: Math.round((1600 * 900) / 750), // the contact sheet
};

const PROFILES = {
  low: { builderTurns: 12, fixTurns: 3, outPerTurn: 1000, stillEvery: 3 },
  typical: { builderTurns: 18, fixTurns: 6, outPerTurn: 1400, stillEvery: 3 },
  high: { builderTurns: 30, fixTurns: 10, outPerTurn: 2000, stillEvery: 2 },
};

// A 15 s trailer: more shots, more frames.
function scaled(profile, seconds) {
  const k = seconds / 10;
  return { ...profile, builderTurns: Math.round(profile.builderTurns * (1 + (k - 1) * 0.5)) };
}

// ---------------------------------------------------------------- simulation

/** The requests one job sends: { cached, fresh, out } tokens each. `cached` is the prefix a cache can serve. */
function requests(profile) {
  const list = [];
  const d = PROMPTS.director;
  list.push({ agent: "director", cached: 0, fresh: d.system + d.brief, out: d.out });

  // The Builder is one growing conversation. Each turn re-sends everything so far: with caching that prefix is a
  // cheap cache read, and only the new tail (last answer + tool result + any image) is a cache write.
  const b = PROMPTS.builder;
  let context = 0;
  let tail = b.system + b.filmJson;
  const turn = (agent, i) => {
    list.push({ agent, cached: context, fresh: tail, out: profile.outPerTurn });
    context += tail;
    tail = profile.outPerTurn + b.toolResult + (i % profile.stillEvery === profile.stillEvery - 1 ? PROMPTS.stillTokens : 0);
  };
  for (let i = 0; i < profile.builderTurns; i++) turn("builder", i);

  const c = PROMPTS.critic;
  list.push({ agent: "critic", cached: 0, fresh: c.system + c.context + PROMPTS.sheetTokens, out: c.out });

  tail += c.out; // the critic's notes join the Builder's conversation
  for (let i = 0; i < profile.fixTurns; i++) turn("fix", i);
  return list;
}

function llmCost(model, reqs, caching) {
  let usd = 0;
  let input = 0;
  let output = 0;
  for (const r of reqs) {
    input += r.cached + r.fresh;
    output += r.out;
    // Single calls (director, critic) are not worth a cache write; the Builder's conversation is.
    const cacheable = caching && (r.agent === "builder" || r.agent === "fix");
    usd += cacheable
      ? (r.cached * model.cacheRead + r.fresh * model.cacheWrite) / 1e6
      : ((r.cached + r.fresh) * model.in) / 1e6;
    usd += (r.out * model.out) / 1e6;
  }
  return { usd, input, output, requests: reqs.length };
}

function computeSeconds(shape, seconds) {
  const k = seconds / 10;
  let total = 0;
  for (const [name, p] of Object.entries(PHASES)) {
    const cpu = name === "render" ? p.cpu * k : p.cpu * (1 + (k - 1) * 0.5);
    total += p.wait + cpu / shape.cpuSpeedup;
  }
  return total;
}

function computeCost(shape, seconds) {
  const s = computeSeconds(shape, seconds);
  const perHour = shape.vcpu * CREATEOS.vcpuHour + shape.gib * CREATEOS.gibHour + shape.diskGb * CREATEOS.storageGbHour;
  return { seconds: s, usd: (s / 3600) * perHour, perHour };
}

// ---------------------------------------------------------------- report

const usd = (n) => (n === 0 ? "$0" : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const k = (n) => `${Math.round(n / 1000)}k`;
const min = (s) => `${(s / 60).toFixed(1)} min`;
const table = (head, rows) =>
  [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

const seconds = Number(args.seconds ?? 10);
const profileName = args.profile ?? "typical";
const profile = scaled(PROFILES[profileName], seconds);
const reqs = requests(profile);
const free = computeCost(SHAPES.free, seconds);
const beginner = computeCost(SHAPES.beginner, seconds);

console.log(`## One ${seconds} s trailer, "${profileName}" profile\n`);
console.log(
  table(
    ["Model", "Requests", "Input tokens", "Output tokens", "LLM, with cache", "LLM, no cache", "CreateOS (Free)", "**Total**"],
    MODELS.map((m) => {
      const c = llmCost(m, reqs, true);
      const n = llmCost(m, reqs, false);
      return [m.label, c.requests, k(c.input), k(c.output), usd(c.usd), usd(n.usd), usd(free.usd), `**${usd(c.usd + free.usd)}**`];
    }),
  ),
);

console.log(`\n## Premium (Opus 5.5) across profiles, with cache\n`);
const opus = MODELS.find((m) => m.tier === "premium");
console.log(
  table(
    ["Profile", "Length", "Requests", "LLM", "CreateOS (Free)", "Total"],
    Object.keys(PROFILES).flatMap((p) =>
      [10, 15].map((s) => {
        const c = llmCost(opus, requests(scaled(PROFILES[p], s)), true);
        const cc = computeCost(SHAPES.free, s);
        return [p, `${s} s`, c.requests, usd(c.usd), usd(cc.usd), usd(c.usd + cc.usd)];
      }),
    ),
  ),
);

console.log(`\n## CreateOS per trailer\n`);
console.log(
  table(
    ["Shape", "$/hour running", "Job time (10 s)", "$/trailer (10 s)", "Job time (15 s)", "$/trailer (15 s)", "Credits/trailer (10 s)", "Trailers per 500 credits"],
    [SHAPES.free, SHAPES.beginner].map((sh) => {
      const a = computeCost(sh, 10);
      const b = computeCost(sh, 15);
      return [
        sh.label,
        usd(a.perHour),
        min(a.seconds),
        usd(a.usd),
        min(b.seconds),
        usd(b.usd),
        (a.usd / CREATEOS.usdPerCredit).toFixed(2),
        Math.floor((500 * CREATEOS.usdPerCredit) / a.usd),
      ];
    }),
  ),
);
const pausedHour = SHAPES.free.gib * CREATEOS.gibHour + SHAPES.free.diskGb * CREATEOS.storageGbHour;
console.log(
  `\nWarm sandbox for the whole evening (7 h): running ${usd(7 * free.perHour)}, paused ${usd(7 * pausedHour)} (Free shape).`,
);

// A Free job stops at REQUEST_BUDGET.free (web/src/lib/server/models.ts) and ships what it has.
const FREE_BUDGET = 25;
console.log(`\n## Free tier: how many trailers a day\n`);
const freeReq = Math.min(llmCost(MODELS[0], reqs, true).requests, FREE_BUDGET);
console.log(
  table(
    ["OpenRouter account", "Free requests/day", `Trailers/day (${freeReq} requests each, budget ${FREE_BUDGET})`],
    [
      ["No credits ever bought", 50, Math.floor(50 / freeReq)],
      ["$10 of credits bought once", 1000, Math.floor(1000 / freeReq)],
    ],
  ),
);

const price = 4.99;
const fee = price * 0.029 + 0.3;
const premiumTotal = llmCost(opus, reqs, true).usd + free.usd;
console.log(`\n## If Premium were sold live at ${usd(price)}\n`);
console.log(
  table(
    ["Price", "Stripe fee (2.9% + $0.30)", "Cost (Opus 5.5 + CreateOS)", "Margin"],
    [[usd(price), usd(fee), usd(premiumTotal), usd(price - fee - premiumTotal)]],
  ),
);

console.log(`\n(Beginner shape for comparison: ${min(beginner.seconds)} and ${usd(beginner.usd)} per ${seconds} s trailer.)`);
