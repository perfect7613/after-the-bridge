"use client";

import { useEffect, useRef } from "react";
import type { DialogueLine } from "@/src/chapter";

const NAMES: Record<DialogueLine["speaker"], string> = {
  wren: "Wren",
  stranger: "Stranger",
  narrator: "",
  chapter: "",
};

export function Dialogue({ lines }: { lines: DialogueLine[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [lines.length]);

  const recent = lines.slice(-18);

  return (
    <div className="scrollbar-thin flex h-full flex-col gap-3 overflow-y-auto pr-2" aria-live="polite">
      {recent.map((l, i) => {
        const last = i === recent.length - 1;
        if (l.speaker === "narrator") {
          return (
            <p key={l.id} className={`fade-in text-[15px] leading-relaxed ${last ? "text-paper/90" : "text-paper/55"}`}>
              {l.text}
            </p>
          );
        }
        if (l.speaker === "chapter") {
          return (
            <p
              key={l.id}
              className="fade-in border-l-2 border-ember/50 pl-3 font-mono text-[12px] leading-relaxed tracking-wide text-ember/90"
            >
              {l.text}
            </p>
          );
        }
        return (
          <p key={l.id} className="fade-in leading-relaxed">
            <span className="mr-2 font-mono text-[11px] uppercase tracking-[0.25em] text-ember/80">
              {NAMES[l.speaker]}
              {l.tone ? ` · ${l.tone}` : ""}
            </span>
            <span className={`text-[16px] ${last ? "text-paper" : "text-paper/70"}`}>“{l.text}”</span>
          </p>
        );
      })}
      <div ref={end} />
    </div>
  );
}
