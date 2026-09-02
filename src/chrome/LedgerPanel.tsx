"use client";

import type { LedgerEntry, Snapshot } from "@/src/chapter";
import { SCENES } from "@/src/chapter";
import type { WrenState } from "@/src/wren";

export interface LedgerPanelProps {
  snapshot: Snapshot;
  wren: WrenState;
  open: boolean;
  onClose: () => void;
}

/** Wren's inspectable memory and body: trust, every entry, and the tools she wears right now. */
export function LedgerPanel({ snapshot, wren, open, onClose }: LedgerPanelProps) {
  return (
    <aside
      className={`fixed inset-y-0 right-0 z-30 w-full max-w-md transform border-l border-paper/10 bg-ink/95 backdrop-blur transition-transform duration-300 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
      aria-hidden={!open}
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-paper/10 px-5 py-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-paper/45">Wren&apos;s ledger</p>
            <p className="mt-1 text-sm text-paper/60">What she remembers, and what she can do.</p>
          </div>
          <button onClick={onClose} className="rounded px-2 py-1 text-sm text-paper/60 hover:text-paper" aria-label="Close ledger">
            Close
          </button>
        </header>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">
          <Trust value={snapshot.trust} threshold={snapshot.trustThreshold} />

          <Section title="Body" note={wren.webmcp ? "Registered site tools" : "No WebMCP on this page; cards only"}>
            <div className="flex flex-wrap gap-1.5">
              {snapshot.capabilities.map((c) => (
                <span
                  key={c}
                  className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${
                    wren.registered.includes(c) ? "border-emerald-400/40 text-emerald-200/90" : "border-paper/20 text-paper/60"
                  }`}
                >
                  {c}
                </span>
              ))}
            </div>
            <Missing snapshot={snapshot} />
          </Section>

          <Section title="Memory" note={`${snapshot.ledger.length} entries`}>
            <ol className="space-y-3">
              {[...snapshot.ledger].reverse().map((e) => (
                <Entry key={e.id} entry={e} />
              ))}
            </ol>
          </Section>

          <Section title="Activity" note="Tool calls and toolchange">
            <ol className="space-y-1 font-mono text-[11px] text-paper/60">
              {[...wren.activity]
                .reverse()
                .slice(0, 40)
                .map((a) => (
                  <li key={a.id} className="flex gap-2">
                    <span className={activityColor(a.kind)}>{a.kind}</span>
                    <span className="text-paper/80">{a.name}</span>
                    {a.detail && <span className="truncate text-paper/40">{a.detail}</span>}
                  </li>
                ))}
            </ol>
          </Section>
        </div>
      </div>
    </aside>
  );
}

function Trust({ value, threshold }: { value: number; threshold: number }) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-paper/45">Trust</p>
        <p className="font-mono text-sm text-paper/70">
          {value} / 6 <span className="text-paper/35">· needs {threshold}</span>
        </p>
      </div>
      <div className="mt-2 flex gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className={`h-2 flex-1 rounded-sm ${i < value ? (value < threshold ? "bg-rust" : "bg-ember") : "bg-paper/10"}`}
          />
        ))}
      </div>
      <p className="mt-2 text-xs italic text-paper/50">
        {value < threshold ? "Below the line. She will not follow blind, and she may refuse." : "She will follow your lead."}
      </p>
    </div>
  );
}

function Missing({ snapshot }: { snapshot: Snapshot }) {
  const gone: string[] = [];
  if (snapshot.wren.wounded) gone.push("run — wounded");
  if (!snapshot.wren.inventory.includes("crowbar") && SCENES[snapshot.scene].openables.length) gone.push("open — no crowbar");
  if (snapshot.trust < snapshot.trustThreshold) gone.push("follow_my_lead — trust");
  if (!gone.length) return null;
  return (
    <p className="mt-3 text-xs text-rust/90">
      Gone: <span className="font-mono">{gone.join(" · ")}</span>
    </p>
  );
}

function Entry({ entry }: { entry: LedgerEntry }) {
  const delta = entry.trustDelta ?? 0;
  return (
    <li className="border-l border-paper/15 pl-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper/35">
        {SCENES[entry.scene].title} · beat {entry.beat} · {entry.kind}
        {delta !== 0 && <span className={delta < 0 ? " text-rust" : " text-emerald-300"}> · trust {delta > 0 ? "+" : ""}{delta}</span>}
      </p>
      <p className="mt-0.5 text-sm text-paper/90">{entry.text}</p>
      {entry.feeling && <p className="mt-0.5 text-sm italic text-paper/55">{entry.feeling}</p>}
    </li>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.3em] text-paper/45">{title}</h3>
        {note && <span className="text-xs text-paper/35">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function activityColor(kind: string): string {
  switch (kind) {
    case "register":
      return "text-emerald-300/80";
    case "unregister":
      return "text-rust";
    case "refused":
      return "text-amber-300";
    case "error":
      return "text-rust/80";
    default:
      return "text-paper/40";
  }
}
