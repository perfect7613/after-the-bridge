"use client";

import type { Snapshot } from "@/src/chapter";

export interface CardsProps {
  snapshot: Snapshot;
  onChoice: (id: string) => void;
  onExit: (id: string) => void;
  onReady?: () => void;
  disabled?: boolean;
  holdingForWorld?: boolean;
}

/** Player choice cards and exits. Hidden while Wren still has the floor, or the world is catching up. */
export function Cards({ snapshot, onChoice, onExit, onReady, disabled, holdingForWorld }: CardsProps) {
  const choices = snapshot.choices.filter((c) => !c.wrenOnly);
  const exits = snapshot.exits;

  if (snapshot.ending) return null;

  if (snapshot.waitingOnWren || holdingForWorld) {
    const copy = holdingForWorld
      ? snapshot.waitingOnWren
        ? "Wren is answering. Your next cards wait until the world has her move."
        : "The world is catching up with Wren's move."
      : "Wren is answering. Your next cards wait until she calls ready.";
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[11px] uppercase tracking-[0.3em] text-paper/40">Wren's move</p>
        <p className="rounded-md border border-ember/25 bg-ember/5 px-4 py-3 text-sm leading-snug text-paper/70">
          {copy}
        </p>
        {onReady && snapshot.waitingOnWren && !holdingForWorld && (
          <button
            type="button"
            onClick={onReady}
            className="rounded-md border border-paper/20 px-4 py-2 text-left text-sm text-paper/70 transition hover:border-paper/50 hover:text-paper"
          >
            Take the cards back
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] uppercase tracking-[0.3em] text-paper/40">
        {snapshot.phase === "situation" ? "Your move" : "The way on"}
      </p>
      {choices.length === 0 && exits.length === 0 && (
        <p className="text-sm italic text-paper/45">Nothing to decide. Wren is thinking.</p>
      )}
      <div className="grid gap-2">
        {choices.map((c, i) => (
          <button
            key={c.id}
            disabled={disabled}
            onClick={() => onChoice(c.id)}
            className="card-in group rounded-md border border-paper/15 bg-paper/[0.04] px-4 py-3 text-left transition hover:border-ember/60 hover:bg-ember/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/60 disabled:opacity-40"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <span className="block text-base leading-tight">{c.label}</span>
            <span className="mt-1 block text-xs italic text-paper/45 group-hover:text-paper/65">{c.hint}</span>
          </button>
        ))}
        {exits.map((e, i) => (
          <button
            key={e.id}
            disabled={disabled}
            onClick={() => onExit(e.id)}
            className="card-in rounded-md border border-dashed border-paper/20 px-4 py-3 text-left transition hover:border-paper/60 hover:bg-paper/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-paper/40 disabled:opacity-40"
            style={{ animationDelay: `${(choices.length + i) * 60}ms` }}
          >
            <span className="block text-base leading-tight">{e.label} →</span>
          </button>
        ))}
      </div>
    </div>
  );
}
