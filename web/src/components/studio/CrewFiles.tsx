"use client";

import { motion } from "motion/react";
import { Fragment, useState, type ReactNode } from "react";
import { AgentGlyph } from "@/components/Glyphs";
import { AGENTS, type StudioState } from "@/lib/events";

// What each agent wrote and did (crew/*.md from the pipeline, lib/crew.mjs), read after the film like a workspace:
// a file per agent, opened as `cat` prints it, in the order the crew worked.
const ORDER = ["director", "sound", "builder", "critic"];

export function CrewFiles({ state }: { state: StudioState }) {
  const files = [...state.crew].sort((a, b) => ORDER.indexOf(a.agent) - ORDER.indexOf(b.agent));
  const [open, setOpen] = useState(files[0]?.path);
  const file = files.find((f) => f.path === open) ?? files[0];
  if (!file) return null;

  return (
    <section className="panel mt-10 overflow-hidden" aria-label="The crew's files">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <span className="label flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-go" /> The crew&apos;s files · what every agent wrote and did
        </span>
        <span className="tc text-[11px] text-faint">workspace/crew/</span>
      </header>
      <div className="grid md:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto border-b border-line p-2 md:flex-col md:border-b-0 md:border-r" aria-label="Files">
          {files.map((f) => {
            const a = AGENTS.find((x) => x.id === f.agent);
            const on = f.path === file.path;
            return (
              <button
                key={f.path}
                onClick={() => setOpen(f.path)}
                className={`flex shrink-0 items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors ${
                  on ? "bg-signal/[0.08] text-paper" : "text-paper-2 hover:bg-white/[0.03] hover:text-paper"
                }`}
                aria-current={on}
              >
                <span className={on ? "text-signal" : "text-faint"}>
                  <AgentGlyph agent={f.agent} />
                </span>
                <span className="min-w-0">
                  <span className="tc block text-[12.5px]">{f.path.split("/").pop()}</span>
                  <span className="block truncate text-[11px] text-muted">{a?.role}</span>
                </span>
              </button>
            );
          })}
        </nav>
        <motion.div
          key={file.path}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="scroll-thin max-h-[640px] min-w-0 overflow-y-auto px-5 py-4"
        >
          <div className="tc mb-3 text-[12px] text-faint">
            <span className="text-go">crew@sandbox</span>:~/workspace$ cat {file.path}
          </div>
          <Markdown md={file.md} />
        </motion.div>
      </div>
    </section>
  );
}

// A small markdown reader for what lib/crew.mjs writes: headings, quotes, lists, fenced code, `code` and **bold**.
function Markdown({ md }: { md: string }) {
  const out: ReactNode[] = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("```")) {
      const code: string[] = [];
      while (++i < lines.length && !lines[i].startsWith("```")) code.push(lines[i]);
      out.push(
        <pre key={i} className="scroll-thin my-3 overflow-x-auto rounded-[10px] border border-line bg-black/50 p-3 text-[12px] leading-[1.55] text-paper-2">
          <code className="tc">
            {code.map((c, n) => (
              <Fragment key={n}>
                <span className="mr-4 inline-block w-6 select-none text-right text-faint">{n + 1}</span>
                {c}
                {"\n"}
              </Fragment>
            ))}
          </code>
        </pre>,
      );
    } else if (l.startsWith("# ")) out.push(<h3 key={i} className="font-display text-[34px] font-[850] uppercase leading-none text-paper">{inline(l.slice(2))}</h3>);
    else if (l.startsWith("## ")) out.push(<h4 key={i} className="label mt-5 mb-2 text-signal">{inline(l.slice(3))}</h4>);
    else if (l.startsWith("> ")) {
      const q: string[] = [l.slice(2)];
      while (lines[i + 1]?.startsWith("> ")) q.push(lines[++i].slice(2));
      out.push(<blockquote key={i} className="my-2 border-l-2 border-signal/60 pl-3 text-[14.5px] leading-relaxed text-paper">{inline(q.join(" "))}</blockquote>);
    } else if (/^\s+- /.test(l)) out.push(<p key={i} className="ml-9 text-[13px] leading-relaxed text-muted">{inline(l.replace(/^\s+- /, ""))}</p>);
    else if (/^(\d+\.|-) /.test(l)) {
      const [, mark, rest] = /^(\d+\.|-) (.*)$/.exec(l)!;
      out.push(
        <p key={i} className="mt-1 flex gap-3 text-[13.5px] leading-relaxed text-paper-2">
          <span className="tc w-6 shrink-0 text-right text-faint">{mark === "-" ? "·" : mark}</span>
          <span className="min-w-0">{inline(rest)}</span>
        </p>,
      );
    } else if (l.trim()) out.push(<p key={i} className="my-1.5 text-[13.5px] leading-relaxed text-paper-2">{inline(l)}</p>);
  }
  return <div className="break-words">{out}</div>;
}

function inline(s: string): ReactNode[] {
  return s.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("`") && part.endsWith("`") ? (
      <code key={i} className="tc rounded bg-white/[0.06] px-1 py-px text-[0.9em] text-paper">
        {/^#[0-9a-f]{6}$/i.test(part.slice(1, -1)) && (
          <span className="mr-1 inline-block h-2.5 w-2.5 rounded-[3px] align-[-1px] ring-1 ring-white/20" style={{ background: part.slice(1, -1) }} />
        )}
        {part.slice(1, -1)}
      </code>
    ) : part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-paper">{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
}
