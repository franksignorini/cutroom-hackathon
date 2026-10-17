// The CreateOS boot that runs when a trailer gets its slot, before the studio opens. Shared by the server (which runs
// the steps against the CreateOS API and times them) and the boot screen (which shows them as they land).

export type BootStepId = "connect" | "sandbox" | "egress" | "brief" | "toolchain" | "ingress" | "crew";

/** The steps in order, so the screen can list what is still to come. */
export const BOOT_PLAN: { id: BootStepId; label: string }[] = [
  { id: "connect", label: "Connecting to CreateOS" },
  { id: "sandbox", label: "Creating the sandbox" },
  { id: "egress", label: "Locking egress" },
  { id: "brief", label: "Uploading the brief" },
  { id: "toolchain", label: "Checking the toolchain" },
  { id: "ingress", label: "Opening the preview port" },
  { id: "crew", label: "Starting the crew" },
];

export interface BootStep {
  id: BootStepId;
  label: string;
  detail: string;
  ms: number; // wall time of the API call(s), measured on our server
}

export interface BootSandbox {
  id: string;
  shape: string;
  rootfs: string;
  region: string;
  bootMs: number; // spawn_ms as reported by CreateOS
  egress: string[];
  previewUrl?: string;
}

export interface BootRecord {
  api: "createos" | "mock"; // mock: our stand-in for the CreateOS API (no key yet), same SDK, same calls
  host: string; // the API host the SDK talked to
  steps: BootStep[];
  totalMs: number;
  sandbox: BootSandbox;
  eventsUrl?: string; // live: the crew's feed inside the sandbox
  at: number;
}

/** One NDJSON line of POST /api/jobs/[id]/boot. */
export type BootEvent =
  | { type: "start"; id: BootStepId; label: string }
  | { type: "step"; step: BootStep }
  | { type: "done"; boot: BootRecord }
  | { type: "error"; message: string; id?: BootStepId };
