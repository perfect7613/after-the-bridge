"use client";

import type { Snapshot } from "@/src/chapter";

export interface HudProps {
  snapshot: Snapshot;
  remainingSec: number | null;
  worldLabel: string;
  worldTone: "live" | "warn" | "muted";
}

export function Hud({ snapshot, remainingSec, worldLabel, worldTone }: HudProps) {
  const toneClass =
    worldTone === "live"
      ? "bg-emerald-400/90 shadow-[0_0_10px_rgba(52,211,153,0.6)]"
      : worldTone === "warn"
        ? "bg-amber-300/90"
        : "bg-paper/30";

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5">
      <div className="fade-in">
        <p className="text-[11px] uppercase tracking-[0.35em] text-paper/45">
          Chapter one · Scene {sceneIndex(snapshot.scene)} of 3
        </p>
        <h2 className="mt-1 text-2xl font-light leading-none">{snapshot.sceneTitle}</h2>
        <p className="mt-1 text-sm italic text-paper/55">{snapshot.sceneSubtitle}</p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="font-mono text-3xl tabular-nums tracking-tight text-paper/90" aria-live="off">
          {remainingSec === null ? "—:——" : clock(remainingSec)}
        </div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-paper/50">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${toneClass}`} />
          {worldLabel}
        </div>
        <div className="mt-1 flex items-center gap-1" aria-label={`${snapshot.beatsLeft} beats left`}>
          {Array.from({ length: 3 }).map((_, i) => (
            <span
              key={i}
              className={`h-1 w-5 rounded-sm ${i < snapshot.beatsLeft ? "bg-ember/80" : "bg-paper/15"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function sceneIndex(id: Snapshot["scene"]): number {
  return id === "underpass" ? 1 : id === "pharmacy" ? 2 : 3;
}

export function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
