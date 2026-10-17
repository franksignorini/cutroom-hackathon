// The contract between the pipeline running inside the CreateOS sandbox and this UI.
// The sandbox streams these over SSE (live), or the UI replays a recorded run (replay).
// `at` is seconds since the job started.

export type AgentId = "director" | "builder" | "critic" | "sound" | "render";

export const AGENTS: { id: AgentId; name: string; role: string; makes: string }[] = [
  { id: "director", name: "Director", role: "Story, hook and the one peak", makes: "film.json" },
  { id: "builder", name: "Builder", role: "Writes every shot as code", makes: "index.html + shots/" },
  { id: "critic", name: "Critic", role: "Watches its own frames", makes: "notes" },
  { id: "sound", name: "Sound", role: "Score on the beat grid", makes: "score.wav" },
  { id: "render", name: "Render", role: "Software raster to MP4", makes: "final.mp4" },
];

export interface Beat {
  name: string;
  t: number;
  dur: number;
  words: string[];
}

export type JobEvent =
  | { at: number; type: "job"; status: "booting" | "shooting" | "rendering" | "done" }
  | {
      at: number;
      type: "sandbox";
      id: string;
      shape: string;
      rootfs: string;
      region: string;
      bootMs: number;
      egress: string[];
      previewUrl?: string;
    }
  | { at: number; type: "agent"; agent: AgentId; state: "working" | "done"; say?: string }
  | { at: number; type: "say"; agent: AgentId; text: string }
  | { at: number; type: "plan"; title: string; logline: string; duration: number; beats: Beat[] }
  | { at: number; type: "fs"; op: "mkdir" | "write"; path: string; bytes?: number }
  | { at: number; type: "cmd"; text: string }
  | { at: number; type: "out"; text: string; tone?: "dim" | "ok" | "warn" }
  | { at: number; type: "still"; id: string; src: string; t: number; beat: string; rev: number; replaces?: string }
  | { at: number; type: "note"; n: number; text: string; still?: string; score?: string }
  | { at: number; type: "fix"; n: number }
  | { at: number; type: "render"; frame: number; of: number }
  | { at: number; type: "cost"; usd: number; vcpuSeconds: number; tokens: number }
  | { at: number; type: "crew"; agent: AgentId; path: string; md: string }
  | { at: number; type: "done"; video: string; poster: string; post: string };

export interface Still {
  id: string;
  src: string;
  t: number;
  beat: string;
  rev: number;
  at: number;
  superseded: boolean;
  replaces?: string;
}

export interface FileEntry {
  path: string;
  dir: boolean;
  bytes?: number;
  at: number;
}

export interface TermLine {
  kind: "cmd" | "out";
  text: string;
  tone?: "dim" | "ok" | "warn";
  at: number;
}

export interface Segment {
  agent: AgentId;
  from: number;
  to?: number;
}

export interface StudioState {
  at: number;
  status: "standby" | "booting" | "shooting" | "rendering" | "done";
  sandbox?: Extract<JobEvent, { type: "sandbox" }>;
  agents: Record<AgentId, { state: "idle" | "working" | "done"; say?: string }>;
  plan?: Extract<JobEvent, { type: "plan" }>;
  files: FileEntry[];
  terminal: TermLine[];
  stills: Still[];
  notes: { n: number; text: string; still?: string; score?: string; fixed: boolean; at: number }[];
  render?: { frame: number; of: number };
  cost: { usd: number; vcpuSeconds: number; tokens: number };
  segments: Segment[];
  /** Each agent's own file (crew/DIRECTOR.md...), what it wrote and did, for the viewer after the film. */
  crew: { agent: AgentId; path: string; md: string; at: number }[];
  done?: Extract<JobEvent, { type: "done" }>;
}

export function initialState(): StudioState {
  return {
    at: 0,
    status: "standby",
    agents: {
      director: { state: "idle" },
      builder: { state: "idle" },
      critic: { state: "idle" },
      sound: { state: "idle" },
      render: { state: "idle" },
    },
    files: [],
    terminal: [],
    stills: [],
    notes: [],
    cost: { usd: 0, vcpuSeconds: 0, tokens: 0 },
    segments: [],
    crew: [],
  };
}

export type Action = JobEvent | { type: "reset" };

export function reduce(s: StudioState, e: Action): StudioState {
  if (e.type === "reset") return initialState();
  const next: StudioState = { ...s, at: Math.max(s.at, e.at) };
  switch (e.type) {
    case "job":
      next.status = e.status;
      return next;
    case "sandbox":
      next.sandbox = e;
      return next;
    case "agent": {
      next.agents = { ...s.agents, [e.agent]: { state: e.state, say: e.say ?? s.agents[e.agent].say } };
      if (e.state === "working") next.segments = [...s.segments, { agent: e.agent, from: e.at }];
      else
        next.segments = s.segments.map((g) => (g.agent === e.agent && g.to === undefined ? { ...g, to: e.at } : g));
      return next;
    }
    case "say":
      next.agents = { ...s.agents, [e.agent]: { ...s.agents[e.agent], say: e.text } };
      return next;
    case "plan":
      next.plan = e;
      return next;
    case "fs": {
      const files = s.files.filter((f) => f.path !== e.path);
      files.push({ path: e.path, dir: e.op === "mkdir", bytes: e.bytes, at: e.at });
      next.files = files;
      return next;
    }
    case "cmd":
      next.terminal = [...s.terminal, { kind: "cmd" as const, text: e.text, at: e.at }].slice(-200);
      return next;
    case "out":
      next.terminal = [...s.terminal, { kind: "out" as const, text: e.text, tone: e.tone, at: e.at }].slice(-200);
      return next;
    case "still": {
      const stills = s.stills.map((x) => (x.id === e.replaces ? { ...x, superseded: true } : x));
      stills.push({
        id: e.id,
        src: e.src,
        t: e.t,
        beat: e.beat,
        rev: e.rev,
        at: e.at,
        superseded: false,
        replaces: e.replaces,
      });
      next.stills = stills;
      return next;
    }
    case "note":
      next.notes = [...s.notes, { n: e.n, text: e.text, still: e.still, score: e.score, fixed: false, at: e.at }];
      return next;
    case "fix":
      next.notes = s.notes.map((x) => (x.n === e.n ? { ...x, fixed: true } : x));
      return next;
    case "render":
      next.render = { frame: e.frame, of: e.of };
      return next;
    case "cost":
      next.cost = { usd: e.usd, vcpuSeconds: e.vcpuSeconds, tokens: e.tokens };
      return next;
    case "crew":
      next.crew = [...s.crew.filter((c) => c.path !== e.path), { agent: e.agent, path: e.path, md: e.md, at: e.at }];
      return next;
    case "done":
      next.done = e;
      next.status = "done";
      return next;
  }
}
