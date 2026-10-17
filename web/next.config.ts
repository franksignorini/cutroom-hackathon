import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Stripe Projects writes the credentials it provisions (CreateOS, OpenRouter, …) to the repo root's .env.
// Read them too, without overriding anything set in web/.env* or in the environment (empty values count as unset).
const projectsEnv = path.join(__dirname, "..", ".env");
if (existsSync(projectsEnv)) {
  for (const line of readFileSync(projectsEnv, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
