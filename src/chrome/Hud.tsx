"use client";

import type { Snapshot } from "@/src/chapter";

export interface HudProps {
  snapshot: Snapshot;
  remainingSec: number | null;
  worldLabel: string;
  worldTone: "live" | "warn" | "muted";
  holdingForWorld?: boolean;
}

export function Hud({ snapshot, remainingSec, worldLabel, worldTone, holdingForWorld }: HudProps) {
  const toneClass =
    worldTone === "live"
      ? "bg-emerald-400/90 shadow-[0_0_10px_rgba(52,211,153,0.6)]"
      : worldTone === "warn"
        ? "bg-amber-300/90"
        : "bg-paper/30";

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent p-3 sm:p-5">
      <div className="fade-in min-w-0">
        <p className="text-[10px] uppercase tracking-[0.35em] text-paper/45 sm:text-[11px]">
          Chapter one · Scene {sceneIndex(snapshot.scene)} of 3
        </p>
        <h2 className="mt-1 truncate text-xl font-light leading-none sm:text-2xl">{snapshot.sceneTitle}</h2>
        <p className="mt-1 hidden text-sm italic text-paper/55 sm:block">{snapshot.sceneSubtitle}</p>
        <p className="mt-2 max-w-sm rounded-md bg-black/45 px-2.5 py-1.5 text-[13px] leading-snug text-paper/85 backdrop-blur-sm sm:mt-3 sm:px-3 sm:py-2 sm:text-sm">
          <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.25em] text-ember/80">
            {snapshot.waitingOnWren || holdingForWorld
              ? "Wren"
              : snapshot.phase === "situation"
                ? "You need"
                : snapshot.phase === "resolved"
                  ? "Decided"
                  : "Ended"}
          </span>
          {holdingForWorld
            ? snapshot.waitingOnWren
              ? "She has the floor. The world is taking her move."
              : "The world is catching up with her move."
            : snapshot.waitingOnWren
              ? "She has the floor. Your cards will return when she is done."
              : snapshot.phase === "situation"
                ? snapshot.goal
                : snapshot.phase === "resolved"
                  ? remainingSec === null
                    ? "The light went. Pick a way on."
                    : "Pick a way on before the light goes."
                  : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:gap-2">
        <div className="font-mono text-2xl tabular-nums tracking-tight text-paper/90 sm:text-3xl" aria-live="off">
          {remainingSec === null ? "—:——" : clock(remainingSec)}
        </div>
        <div className="flex max-w-[9rem] items-center gap-2 truncate text-[10px] uppercase tracking-[0.25em] text-paper/50 sm:max-w-none sm:text-[11px]">
          <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${toneClass}`} />
          <span className="truncate">{worldLabel}</span>
        </div>
        <div className="mt-1 flex items-center gap-2" aria-label={`${snapshot.beatsLeft} moments left`}>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper/40">
            {snapshot.phase === "situation" ? `${snapshot.beatsLeft} ${snapshot.beatsLeft === 1 ? "moment" : "moments"} left` : "light"}
          </span>
          <span className="flex items-center gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <span
                key={i}
                className={`h-1 w-5 rounded-sm ${i < snapshot.beatsLeft ? "bg-ember/80" : "bg-paper/15"}`}
              />
            ))}
          </span>
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
