import type { AgentId } from "@/lib/events";

const common = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function AgentGlyph({ agent, className }: { agent: AgentId; className?: string }) {
  switch (agent) {
    case "director": // clapperboard
      return (
        <svg {...common} className={className} aria-hidden>
          <path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
          <path d="M4 10 3.2 6.2a1 1 0 0 1 .8-1.2l13.8-2.6a1 1 0 0 1 1.2.8L19.6 7" />
          <path d="m8.5 4.6 2.2 4M13.6 3.7l2.2 4.3" />
        </svg>
      );
    case "builder": // code brackets
      return (
        <svg {...common} className={className} aria-hidden>
          <path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 4.5l-3 15" />
        </svg>
      );
    case "critic": // eye
      return (
        <svg {...common} className={className} aria-hidden>
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "sound": // waveform
      return (
        <svg {...common} className={className} aria-hidden>
          <path d="M3 12h1.5M7 8v8M10.5 5v14M14 9v6M17.5 6.5v11M21 12h-1" />
        </svg>
      );
    case "render": // film frame
      return (
        <svg {...common} className={className} aria-hidden>
          <rect x="3" y="4.5" width="18" height="15" rx="1.5" />
          <path d="M7 4.5v15M17 4.5v15M3 9h4M3 15h4M17 9h4M17 15h4" />
        </svg>
      );
  }
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="relative inline-block h-2.5 w-2.5 rounded-full bg-signal shadow-[0_0_14px_rgba(255,77,26,0.8)]" />
      <span className="font-stencil text-[22px] font-[800] uppercase leading-none tracking-[0.06em]">Cutroom</span>
    </span>
  );
}
