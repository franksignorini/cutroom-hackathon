import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

// A stand-in for the CreateOS sandbox control plane (https://api.sb.createos.sh) until we have a key.
// It answers the calls src/lib/server/createos.ts makes through the official SDK, with the same paths, the same JSend
// envelope ({ status: "success", data }) and latencies in the range CreateOS publishes (boot ~30 ms p90, time to
// interactive ~210 ms median). Nothing runs: the sandboxes live in this process's memory.
// TODO(saturday): with a CreateOS key set (createos.ts) the SDK goes to the real API and this route is no longer called.

interface MockSandbox {
  id: string;
  name: string;
  ip: string;
  shape: string;
  rootfs: string;
  region: string;
  status: "running" | "paused";
  spawn_ms: number;
  egress: string[];
  ingress_enabled: boolean;
  created_at: string;
  files: Record<string, number>;
}

const SHAPES: Record<string, [number, number]> = {
  "s-0.25vcpu-512mb": [1, 512],
  "s-0.5vcpu-1gb": [1, 1024],
  "s-1vcpu-256mb": [1, 256],
  "s-1vcpu-1gb": [1, 1024],
  "s-1vcpu-2gb": [1, 2048],
  "s-2vcpu-2gb": [2, 2048],
  "s-2vcpu-4gb": [2, 4096],
  "s-4vcpu-4gb": [4, 4096],
  "s-4vcpu-8gb": [4, 8192],
};

const g = globalThis as unknown as { __createosMock?: Map<string, MockSandbox> };
const boxes = (g.__createosMock ??= new Map());

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const between = (a: number, b: number) => Math.round(a + Math.random() * (b - a));
const ok = (data: unknown, status = 200) => NextResponse.json({ status: "success", data }, { status });
const fail = (status: number, message: string) => NextResponse.json({ status: "error", message }, { status });

function view(s: MockSandbox) {
  const [vcpu, mem_mib] = SHAPES[s.shape];
  return {
    id: s.id,
    name: s.name,
    ip: s.ip,
    shape: s.shape,
    rootfs: s.rootfs,
    region: s.region,
    status: s.status,
    spawn_ms: s.spawn_ms,
    egress: s.egress,
    ingress_enabled: s.ingress_enabled,
    created_at: s.created_at,
    vcpu,
    mem_mib,
    disk_mib: 10240,
    running_at: s.created_at,
    bandwidth_quota_bytes: 50 * 2 ** 30,
    ingress_url_template: s.ingress_enabled ? `https://${s.id.slice(3, 15)}-<port>.${s.region}.mock.sb.createos.sh` : undefined,
  };
}

async function handle(req: NextRequest, ctx: RouteContext<"/api/mock/createos/[...path]">) {
  const path = (await ctx.params).path;
  const route = `${req.method} /${path.join("/")}`;
  if (path[0] !== "healthz" && !req.headers.get("x-api-key")) return fail(401, "missing X-Api-Key");

  await sleep(between(18, 45)); // network round trip to the control plane

  if (route === "GET /healthz") return ok({ up: true });
  if (route === "GET /v1/whoami") return ok({ user_id: "usr_mock", plan: "free", stats: { running: boxes.size } });

  if (route === "POST /v1/sandboxes") {
    const body = (await req.json()) as { shape?: string; rootfs?: string; region?: string; name?: string; egress?: string[]; ingress_enabled?: boolean };
    const shape = body.shape ?? "s-1vcpu-1gb";
    if (!SHAPES[shape]) return fail(422, `unknown shape ${shape}`);
    // The POST answers once the VM is up and its agent responds: boot plus readiness probe.
    const spawn_ms = between(22, 38);
    await sleep(spawn_ms + between(140, 220));
    if (boxes.size >= 50) boxes.delete(boxes.keys().next().value!);
    const s: MockSandbox = {
      id: `sb_${randomBytes(13).toString("hex").slice(0, 26)}`,
      name: body.name ?? "sandbox",
      ip: `10.42.${between(0, 255)}.${between(2, 254)}`,
      shape,
      rootfs: body.rootfs ?? "alpine:3.20",
      region: body.region ?? "eu",
      status: "running",
      spawn_ms,
      egress: body.egress ?? [],
      ingress_enabled: !!body.ingress_enabled,
      created_at: new Date().toISOString(),
      files: {},
    };
    boxes.set(s.id, s);
    return ok(view(s));
  }

  const s = path[0] === "v1" && path[1] === "sandboxes" ? boxes.get(path[2]) : undefined;
  if (!s) return fail(404, "sandbox not found");
  const sub = path.slice(3).join("/");

  if (req.method === "GET" && !sub) return ok(view(s));
  if (req.method === "POST" && sub === "resume") {
    await sleep(between(25, 60));
    s.status = "running";
    return ok(view(s));
  }
  if (req.method === "PUT" && sub === "egress") {
    s.egress = ((await req.json()) as { egress: string[] | null }).egress ?? [];
    return ok({ egress: s.egress });
  }
  if (req.method === "PUT" && sub === "files") {
    const at = req.nextUrl.searchParams.get("path") ?? "/";
    s.files[at] = (await req.arrayBuffer()).byteLength;
    return ok({ path: at, bytes: s.files[at] });
  }
  if (req.method === "POST" && sub === "exec") {
    const exec_ms = between(9, 30);
    await sleep(exec_ms);
    const [vcpu] = SHAPES[s.shape];
    return ok({ result: { stdout: `node v24.4.1\nffmpeg version 6.1.1\nGoogle Chrome 141.0.7390.65\n${vcpu} vCPU\n`, stderr: "", exit_code: 0 }, exec_ms });
  }
  return fail(404, `the mock does not implement ${route}`);
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
