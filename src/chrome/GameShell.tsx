"use client";

import type { ReactNode } from "react";
import type { Snapshot } from "@/src/chapter";
import type { WrenState } from "@/src/wren";
import { Cards } from "./Cards";
import { Dialogue } from "./Dialogue";
import { ElicitationOverlay } from "./ElicitationOverlay";
import { Hud } from "./Hud";
import { LedgerPanel } from "./LedgerPanel";
import { Primer } from "./Primer";
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
  onReady: () => void;
  /** True while the live world is still applying Wren's last steer. */
  holdingForWorld?: boolean;
}

export function GameShell(p: GameShellProps) {
  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-ink">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-paper/10 px-3 py-2 sm:px-5">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate text-base tracking-tight sm:text-lg">After the Bridge</h1>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.3em] text-paper/35 xl:inline">
            {p.wren.webmcp ? `${p.wren.registered.length} tools registered` : "cards only"}
          </span>
        </div>
        <nav className="flex shrink-0 items-center gap-1.5 overflow-x-auto sm:gap-2">
          <CopyPromptButton className="hidden xl:inline-block" />
          {p.onToggleWorld && <Ghost onClick={p.onToggleWorld}>{p.worldLabel}</Ghost>}
          <Ghost onClick={p.onToggleVoice}>{p.voiceLabel}</Ghost>
          <Ghost onClick={p.onToggleLedger} active={p.ledgerOpen}>
            Ledger · {p.snapshot.trust}/6
          </Ghost>
        </nav>
      </header>

      <main className="grid min-h-0 flex-1 grid-rows-[minmax(11rem,34vh)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_22rem] xl:grid-rows-1">
        <section className="relative min-h-0 overflow-hidden bg-black">
          {p.world}
          <Hud
            snapshot={p.snapshot}
            remainingSec={p.remainingSec}
            worldLabel={p.worldLabel}
            worldTone={p.worldTone}
            holdingForWorld={p.holdingForWorld}
          />
          <ElicitationOverlay pending={p.snapshot.pending} onAnswer={p.onAnswer} />
          <Toasts items={p.toasts} />
          {p.showSceneCard && <SceneCard snapshot={p.snapshot} />}
        </section>

        <aside className="flex min-h-0 flex-col gap-3 overflow-hidden border-t border-paper/10 p-3 sm:p-5 xl:border-l xl:border-t-0">
          <Primer webmcp={p.wren.webmcp} />
          <div className="min-h-0 flex-1 overflow-hidden">
            <Dialogue lines={p.snapshot.dialogue} />
          </div>
          <div className="max-h-[46%] shrink-0 overflow-y-auto">
            <Cards
              snapshot={p.snapshot}
              onChoice={p.onChoice}
              onExit={p.onExit}
              onReady={p.onReady}
              disabled={p.showSceneCard}
              holdingForWorld={p.holdingForWorld}
            />
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
      className={`whitespace-nowrap rounded-md border px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition sm:px-3 sm:text-[11px] ${
        active ? "border-paper/50 bg-paper/10 text-paper" : "border-paper/15 text-paper/60 hover:border-paper/40 hover:text-paper"
      }`}
    >
      {children}
    </button>
  );
}
