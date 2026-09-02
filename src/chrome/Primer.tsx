"use client";

import { useState } from "react";

/** Four sentences that explain the rules, in the words the story uses. Collapses after a first read. */
export function Primer({ webmcp }: { webmcp: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="shrink-0 rounded-md border border-paper/10 bg-paper/[0.03]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.3em] text-paper/45 hover:text-paper/80"
        aria-expanded={open}
      >
        How this works
        <span>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <dl className="grid gap-2 px-3 pb-3 text-[13px] leading-snug text-paper/70">
          <Row k="Wren">
            {webmcp
              ? "Your companion. She watches your cards, then answers with site tools. She cannot take your move."
              : "Your companion. Open this page inside Codex and an AI plays her; without one, she speaks her own lines."}
          </Row>
          <Row k="Cards">Your decisions. After you click, they hide until Wren finishes answering.</Row>
          <Row k="Moments">Three per scene. Looking, waiting and silence spend them. At zero, the moment passes without you.</Row>
          <Row k="Trust">Starts at 3 of 6. Below 3, Wren stops doing things on your word, and remembers why.</Row>
          <Row k="Light">The clock. When it runs out, the scene ends the way it ends.</Row>
        </dl>
      )}
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[64px_1fr] gap-2">
      <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-ember/80 pt-0.5">{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}
