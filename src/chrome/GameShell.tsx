"use client";

import type { ReactNode } from "react";
import type { Snapshot } from "@/src/chapter";
import type { WrenState } from "@/src/wren";
import { Cards } from "./Cards";
import { Dialogue } from "./Dialogue";
import { ElicitationOverlay } from "./ElicitationOverlay";
import { Hud } from "./Hud";
import { LedgerPanel } from "./LedgerPanel";
import { CopyPromptButton, SceneCard } from "./TitleCards";
import { Toasts, type ToastMessage } from "./Toast";

export interface GameShellProps {
  snapshot: Snapshot;
  wren: WrenState;
  /** The World surface. Chrome never knows which adapter it is. */
  world: ReactNode;
  worldLabel: string;
  worldTone: "live" | "warn" | "muted";
  remainingSec: number | null;
  showSceneCard: boolean;
  ledgerOpen: boolean;
  toasts: ToastMessage[];
  voiceLabel: string;
  onToggleLedger: () => void;
  onToggleVoice: () => void;
  onToggleWorld?: () => void;
  onChoice: (id: string) => void;
  onExit: (id: string) => void;
  onAnswer: (answer: string) => void;
}

export function GameShell(p: GameShellProps) {
  return (
    <div className="flex h-screen flex-col bg-ink">
      <header className="flex items-center justify-between border-b border-paper/10 px-5 py-2.5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg tracking-tight">After the Bridge</h1>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.3em] text-paper/35 sm:inline">
            {p.wren.webmcp ? `${p.wren.registered.length} tools registered` : "cards only"}
          </span>
        </div>
        <nav className="flex items-center gap-2">
          <CopyPromptButton className="hidden sm:inline-block" />
          {p.onToggleWorld && <Ghost onClick={p.onToggleWorld}>{p.worldLabel}</Ghost>}
          <Ghost onClick={p.onToggleVoice}>{p.voiceLabel}</Ghost>
          <Ghost onClick={p.onToggleLedger} active={p.ledgerOpen}>
            Ledger · {p.snapshot.trust}/6
          </Ghost>
        </nav>
      </header>

      <main className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-1">
        <section className="relative min-h-0 bg-black">
          {p.world}
          <Hud snapshot={p.snapshot} remainingSec={p.remainingSec} worldLabel={p.worldLabel} worldTone={p.worldTone} />
          <ElicitationOverlay pending={p.snapshot.pending} onAnswer={p.onAnswer} />
          <Toasts items={p.toasts} />
          {p.showSceneCard && <SceneCard snapshot={p.snapshot} />}
        </section>

        <aside className="flex min-h-0 flex-col gap-4 border-t border-paper/10 p-5 lg:border-l lg:border-t-0">
          <div className="min-h-0 flex-1">
            <Dialogue lines={p.snapshot.dialogue} />
          </div>
          <div className="shrink-0">
            <Cards snapshot={p.snapshot} onChoice={p.onChoice} onExit={p.onExit} disabled={p.showSceneCard} />
          </div>
        </aside>
      </main>

      <LedgerPanel snapshot={p.snapshot} wren={p.wren} open={p.ledgerOpen} onClose={p.onToggleLedger} />
    </div>
  );
}

function Ghost({ children, onClick, active }: { children: ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] transition ${
        active ? "border-paper/50 bg-paper/10 text-paper" : "border-paper/15 text-paper/60 hover:border-paper/40 hover:text-paper"
      }`}
    >
      {children}
    </button>
  );
}
