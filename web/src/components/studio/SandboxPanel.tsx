"use client";

import { useEffect, useMemo, useRef } from "react";
import type { BootSandbox } from "@/lib/boot";
import type { FileEntry, StudioState } from "@/lib/events";
import { bytes } from "@/lib/feed";

export function SandboxPanel({
  state,
  workspace,
  sandbox,
  offline,
}: {
  state: StudioState;
  workspace: string;
  sandbox?: BootSandbox; // the sandbox this job really booted; the recorded run's own one otherwise
  offline?: string; // a run with no sandbox (recorded on the dev machine): say so instead of "booting"
}) {
  const sb = sandbox ?? state.sandbox;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <section className="panel p-4" aria-label="CreateOS sandbox">
        <header className="flex items-center justify-between">
          <span className="label">CreateOS sandbox</span>
          <span className={`flex items-center gap-1.5 text-[11px] ${sb ? "text-go" : "text-faint"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${sb ? "bg-go shadow-[0_0_8px_rgba(124,227,139,0.9)]" : "bg-faint animate-rec"}`} />
            <span className="tc uppercase tracking-[0.12em]">{sb ? (state.done ? "paused" : "running") : offline ? "no sandbox" : "booting"}</span>
          </span>
        </header>
        <div className="mt-2 truncate font-display text-[26px] font-[800] leading-none" title={sb?.id}>
          {sb?.id ?? (offline ? "dev machine" : "sb_…")}
        </div>
        {!sb && offline && <p className="mt-2 text-[12px] leading-snug text-muted">{offline}</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[sb?.shape ?? "s-2vcpu-4gb", sb?.rootfs ?? "devbox:1", sb ? `region ${sb.region}` : "region —", sb ? `boot ${sb.bootMs} ms` : "boot —"].map(
            (c) => (
              <span key={c} className="tc rounded-md border border-line bg-ink px-1.5 py-0.5 text-[11px] text-paper-2">
                {c}
              </span>
            ),
          )}
        </div>
        <div className="mt-3 border-t border-line pt-3">
          <div className="label mb-1.5 flex items-center gap-1.5 text-[10px]">
            <svg width="10" height="11" viewBox="0 0 10 11" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
              <rect x="1" y="5" width="8" height="5.5" rx="1" />
              <path d="M3 5V3.5a2 2 0 0 1 4 0V5" />
            </svg>
            Egress allowlist
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(sb?.egress ?? []).map((h) => (
              <span key={h} className="tc rounded-md bg-go/10 px-1.5 py-0.5 text-[11px] text-go">
                {h}
              </span>
            ))}
            {sb && <span className="tc rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-faint">* → dropped</span>}
          </div>
        </div>
      </section>

      <FileTree files={state.files} workspace={workspace} />
      <Terminal state={state} />
    </div>
  );
}

function FileTree({ files, workspace }: { files: FileEntry[]; workspace: string }) {
  const rows = useMemo(() => {
    const all = new Map<string, FileEntry>();
    for (const f of files) {
      all.set(f.path, f);
      const parts = f.path.split("/");
      for (let i = 1; i < parts.length; i++) {
        const d = parts.slice(0, i).join("/");
        if (!all.has(d)) all.set(d, { path: d, dir: true, at: f.at });
      }
    }
    const list = [...all.values()];
    const key = (e: FileEntry) =>
      e.path
        .split("/")
        .map((p, i, a) => (i === a.length - 1 && !e.dir ? `1${p}` : `0${p}`))
        .join("/");
    return list.sort((a, b) => key(a).localeCompare(key(b)));
  }, [files]);

  return (
    <section className="panel flex h-[300px] flex-col overflow-hidden xl:h-auto xl:min-h-0 xl:flex-1" aria-label="Workspace files">
      <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="label">/workspace/{workspace}</span>
        <span className="tc text-[11px] text-faint">{files.filter((f) => !f.dir).length} files</span>
      </header>
      <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto py-1.5 font-mono text-[12.5px]">
        {rows.length === 0 && <li className="px-4 py-2 text-faint">empty</li>}
        {rows.map((f) => {
          const depth = f.path.split("/").length - 1;
          const name = f.path.split("/").at(-1);
          return (
            <li
              key={`${f.path}@${f.at}`}
              className="new-row flex items-center gap-2 px-4 py-[3px]"
              style={{ paddingLeft: 16 + depth * 14 }}
            >
              <span className={f.dir ? "text-tungsten" : "text-faint"}>{f.dir ? "▸" : "·"}</span>
              <span className={`truncate ${f.dir ? "text-paper" : "text-paper-2"}`}>
                {name}
                {f.dir ? "/" : ""}
              </span>
              <span className="tc ml-auto shrink-0 text-[11px] text-faint">{bytes(f.bytes)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Terminal({ state }: { state: StudioState }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [state.terminal.length]);

  return (
    <section className="flex h-[320px] flex-col overflow-hidden rounded-[14px] border border-line-2 bg-[#060607] xl:h-auto xl:min-h-0 xl:flex-[1.15]" aria-label="Sandbox terminal">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-white/10" />
        <span className="h-2 w-2 rounded-full bg-white/10" />
        <span className="h-2 w-2 rounded-full bg-white/10" />
        <span className="label ml-2">stdout · streamCommand</span>
      </header>
      <div ref={box} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-[1.7]">
        {state.terminal.map((l, i) => (
          <div key={i} className="grid grid-cols-[42px_1fr] gap-2">
            <span className="tc text-[10.5px] text-faint">{fmt(l.at)}</span>
            <span
              className={`break-words ${
                l.kind === "cmd"
                  ? "text-paper"
                  : l.tone === "ok"
                    ? "text-go"
                    : l.tone === "warn"
                      ? "text-tungsten"
                      : "text-muted"
              }`}
            >
              {l.kind === "cmd" && <span className="text-signal">› </span>}
              {l.text}
            </span>
          </div>
        ))}
        {!state.done && (
          <div className="grid grid-cols-[42px_1fr] gap-2">
            <span />
            <span>
              <span className="text-signal">› </span>
              <span className="inline-block h-3.5 w-[7px] translate-y-0.5 bg-paper animate-caret" />
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}
