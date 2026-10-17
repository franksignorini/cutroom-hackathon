// The recorded run, replayed by the UI when no live crew is connected (/jobs/demo, PIPELINE=simulate) and as the
// demo's safety net. It is a real run of the crew (pipeline/pipeline.mjs): its own events, stills, film and poster,
// captured by tools/record-run.mjs into web/public/demo/run/ and ./recorded-run.json. Re-record after a better run:
//   node tools/record-run.mjs ../cinematic-studio/projects/cutroom-<id> [--where sandbox]

import type { JobEvent } from "./events";
import recorded from "./recorded-run.json";

export const RECORDED = {
  source: recorded.source,
  where: recorded.where as "local" | "sandbox",
  recordedAt: recorded.recordedAt,
};

export const DEMO_JOB = {
  id: "demo",
  prompt: recorded.job.prompt,
  preset: "free",
  duration: recorded.job.duration,
  format: "16:9",
};

export const DEMO_EVENTS = recorded.events as JobEvent[];

// Frames sampled from the film, shown on the monitor while the replay "renders".
export const FILM_FRAMES: { t: number; src: string }[] = recorded.frames;

export function frameAt(seconds: number) {
  let best = FILM_FRAMES[0];
  for (const f of FILM_FRAMES) if (f.t <= seconds + 0.3) best = f;
  return best.src;
}

// The run's length, plus a beat on the wrap screen.
export const DEMO_TOTAL = Math.ceil(Math.max(...DEMO_EVENTS.map((e) => e.at)) + 2);

const done = DEMO_EVENTS.find((e): e is Extract<JobEvent, { type: "done" }> => e.type === "done");
export const DEMO_VIDEO = done?.video ?? "/demo/final.mp4";
export const DEMO_POSTER = done?.poster ?? "/demo/poster.jpg";
