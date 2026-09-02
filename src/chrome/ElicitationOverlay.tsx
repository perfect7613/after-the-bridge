"use client";

import { useEffect, useState } from "react";
import type { Elicitation } from "@/src/chapter";

export interface ElicitationOverlayProps {
  pending: Elicitation | null;
  onAnswer: (answer: string) => void;
}

/**
 * Wren's question over the World, with the bar running down. Clicking answers;
 * the timeout itself is Wren's (her tool call resolves silence). This only shows it.
 */
export function ElicitationOverlay({ pending, onAnswer }: ElicitationOverlayProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [pending]);

  if (!pending) return null;

  const total = pending.expiresAt - pending.openedAt;
  const left = Math.max(0, pending.expiresAt - now);
  const fraction = total > 0 ? left / total : 0;
  const seconds = Math.ceil(left / 1000);

  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center bg-gradient-to-t from-black/85 via-black/40 to-transparent p-6 sm:items-center">
      <div className="card-in w-full max-w-lg rounded-lg border border-ember/40 bg-ink/90 p-5 shadow-2xl backdrop-blur">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember">Wren is asking</p>
          <p className="font-mono text-sm tabular-nums text-paper/70">{seconds}s</p>
        </div>
        <p className="mt-2 text-xl leading-snug">“{pending.question}”</p>
        <div className="mt-3 h-1 w-full overflow-hidden rounded bg-paper/10">
          <div
            className={`h-full transition-[width] duration-100 ease-linear ${fraction < 0.25 ? "bg-rust" : "bg-ember"}`}
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(pending.options.length ? pending.options : ["Yes", "No"]).map((o) => (
            <button
              key={o}
              onClick={() => onAnswer(o)}
              className="rounded-md border border-paper/20 bg-paper/[0.05] px-4 py-2.5 text-left text-base transition hover:border-ember hover:bg-ember/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/60"
            >
              {o}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs italic text-paper/40">Say nothing and she will remember that too.</p>
      </div>
    </div>
  );
}
