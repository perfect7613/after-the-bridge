"use client";

import { useState } from "react";
import type { LedgerEntry, Snapshot } from "@/src/chapter";
import { SCENES } from "@/src/chapter";
import { OPENING_PROMPT } from "./prompt";

export function CopyPromptButton({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(OPENING_PROMPT);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          window.prompt("Copy this and paste it to Codex:", OPENING_PROMPT);
        }
      }}
      className={`rounded-md border border-ember/50 bg-ember/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-ember transition hover:bg-ember/20 ${className}`}
    >
      {copied ? "Copied" : "Copy opening prompt"}
    </button>
  );
}

export interface StartCardProps {
  webmcp: boolean;
  liveWorld: boolean;
  onBegin: () => void;
}

export function StartCard({ webmcp, liveWorld, onBegin }: StartCardProps) {
  return (
    <div className="grain relative flex min-h-screen flex-col items-center justify-center bg-ink px-6 py-16 text-center">
      <p className="fade-in font-mono text-[11px] uppercase tracking-[0.4em] text-paper/40">A one-chapter survival story</p>
      <h1 className="fade-in mt-4 text-6xl font-light tracking-tight sm:text-7xl">After the Bridge</h1>
      <p className="fade-in mt-6 max-w-xl text-lg leading-relaxed text-paper/70" style={{ animationDelay: "150ms" }}>
        You travel with Wren. She is an agent wearing the tools this page gives her. What she can do is what is
        registered; what she remembers is in a ledger you can open. The world is generated live. She cannot see it.
      </p>

      <div className="fade-in mt-10 grid w-full max-w-2xl gap-3 text-left sm:grid-cols-3" style={{ animationDelay: "300ms" }}>
        <Step n="1" title="Open this page in Codex" body="ChatGPT desktop → Codex → in-app browser. Site tools appear in the composer." />
        <Step n="2" title="Paste the opening prompt" body="It puts Wren's persona with you, not in the tools." />
        <Step n="3" title="Or just play the cards" body="Cards and tools are the same input. Wren is optional; the story is not." />
      </div>

      <div className="fade-in mt-8 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "450ms" }}>
        <CopyPromptButton />
        <button
          onClick={onBegin}
          className="rounded-md bg-paper px-6 py-2.5 font-mono text-[12px] uppercase tracking-[0.25em] text-ink transition hover:bg-white"
        >
          Begin
        </button>
      </div>

      <div className="fade-in mt-8 flex flex-wrap justify-center gap-4 font-mono text-[11px] uppercase tracking-[0.2em] text-paper/40" style={{ animationDelay: "600ms" }}>
        <span className="flex items-center gap-2">
          <Dot on={webmcp} /> {webmcp ? "WebMCP detected" : "No WebMCP here · cards only"}
        </span>
        <span className="flex items-center gap-2">
          <Dot on={liveWorld} /> {liveWorld ? "Live world" : "Placeholder world"}
        </span>
      </div>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-md border border-paper/10 bg-paper/[0.03] p-4">
      <p className="font-mono text-[11px] text-ember">{n}</p>
      <p className="mt-1 text-base">{title}</p>
      <p className="mt-1 text-sm text-paper/55">{body}</p>
    </div>
  );
}

function Dot({ on }: { on: boolean }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${on ? "bg-emerald-400" : "bg-paper/25"}`} />;
}

export function SceneCard({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="fade-in absolute inset-0 z-40 flex flex-col items-center justify-center bg-black text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.4em] text-paper/40">{snapshot.sceneSubtitle}</p>
      <h2 className="mt-3 text-5xl font-light">{snapshot.sceneTitle}</h2>
      {snapshot.wren.wounded && <p className="mt-4 text-sm italic text-rust">Wren is limping.</p>}
    </div>
  );
}

export function EndingCard({ snapshot, onAgain }: { snapshot: Snapshot; onAgain: () => void }) {
  const together = snapshot.ending === "together";
  return (
    <div className="grain relative min-h-screen bg-ink px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <p className="fade-in font-mono text-[11px] uppercase tracking-[0.4em] text-paper/40">Chapter one · ending</p>
        <h1 className={`fade-in mt-4 text-6xl font-light tracking-tight ${together ? "text-paper" : "text-rust"}`}>
          {together ? "Together" : "Alone"}
        </h1>
        <p className="fade-in mt-6 text-lg leading-relaxed text-paper/75" style={{ animationDelay: "150ms" }}>
          {snapshot.narration}
        </p>

        <div className="fade-in mt-10" style={{ animationDelay: "300ms" }}>
          <div className="flex items-baseline justify-between border-b border-paper/10 pb-2">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.3em] text-paper/45">Everything Wren remembers</h2>
            <span className="font-mono text-xs text-paper/45">trust {snapshot.trust} / 6</span>
          </div>
          <ol className="mt-4 space-y-4">
            {snapshot.ledger.map((e) => (
              <EndingEntry key={e.id} entry={e} />
            ))}
          </ol>
        </div>

        <div className="fade-in mt-12 flex flex-wrap items-center gap-3" style={{ animationDelay: "450ms" }}>
          <button
            onClick={onAgain}
            className="rounded-md bg-paper px-5 py-2 font-mono text-[12px] uppercase tracking-[0.25em] text-ink hover:bg-white"
          >
            Play again
          </button>
          <p className="text-sm italic text-paper/45">The other ending is on the other side of the ledger.</p>
        </div>
      </div>
    </div>
  );
}

function EndingEntry({ entry }: { entry: LedgerEntry }) {
  const delta = entry.trustDelta ?? 0;
  return (
    <li className="grid gap-1 sm:grid-cols-[140px_1fr]">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper/35">
        {SCENES[entry.scene].title.replace("The ", "")}
        {delta !== 0 && <span className={delta < 0 ? " text-rust" : " text-emerald-300"}> {delta > 0 ? "+" : ""}{delta}</span>}
      </p>
      <div>
        <p className={`${entry.kind === "refusal" ? "text-amber-200" : "text-paper/90"}`}>{entry.text}</p>
        {entry.feeling && <p className="text-sm italic text-paper/50">{entry.feeling}</p>}
      </div>
    </li>
  );
}
