import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getJob } from "@/lib/server/store";

// Signs a direct upload to Cloudinary for the crew (pipeline.mjs), so the finished MP4 and poster outlive the sandbox.
// The Cloudinary secret stays here: the crew only proves it is this job's (x-job-token) and gets a one-off signature
// for one file at a fixed public id. Not configured (no CLOUDINARY_URL): 404, and the crew keeps serving the files.
//   POST { kind: "video" | "image", name: "final" | "poster" } -> { url, fields }

// `stripe projects add cloudinary/media` writes the credentials to the repo root .env (read by next.config.ts). The names
// carry the resource prefix, so take any CLOUDINARY…_URL (cloudinary://<api_key>:<api_secret>@<cloud_name>), or the
// cloud name, key and secret as separate CLOUDINARY…_CLOUD_NAME / _API_KEY / _API_SECRET variables.
function cloudinary() {
  const env = Object.entries(process.env).filter(([k, v]) => k.startsWith("CLOUDINARY") && v);
  const url = env.find(([k, v]) => k.endsWith("URL") && v!.startsWith("cloudinary://"))?.[1];
  if (url) {
    try {
      const u = new URL(url);
      return { key: decodeURIComponent(u.username), secret: decodeURIComponent(u.password), cloud: u.hostname };
    } catch {}
  }
  const pick = (suffix: string) => env.find(([k]) => k.endsWith(suffix))?.[1];
  const cloud = pick("CLOUD_NAME"), key = pick("API_KEY"), secret = pick("API_SECRET");
  return cloud && key && secret ? { cloud, key, secret } : null;
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/jobs/[id]/upload">) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job || req.headers.get("x-job-token") !== job.token)
    return NextResponse.json({ error: "Unknown job or bad token" }, { status: 403 });
  const c = cloudinary();
  if (!c) return NextResponse.json({ error: "Cloudinary is not configured" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { kind?: string; name?: string };
  const kind = body.kind === "image" ? "image" : "video";
  const name = body.name === "poster" ? "poster" : "final";
  // Signed params, sorted by name, then the secret appended (Cloudinary's upload signature).
  const params: Record<string, string> = {
    folder: `cutroom/${job.id}`,
    overwrite: "true",
    public_id: name,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  const signature = createHash("sha1").update(toSign + c.secret).digest("hex");
  return NextResponse.json({
    url: `https://api.cloudinary.com/v1_1/${c.cloud}/${kind}/upload`,
    fields: { ...params, api_key: c.key, signature },
  });
}
