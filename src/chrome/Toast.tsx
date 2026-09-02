"use client";

import { useEffect, useRef, useState } from "react";

export interface ToastMessage {
  id: number;
  text: string;
}

const TOAST_MS = 3200;

/** Shows each new message once, briefly. Messages present at mount are not shown. */
export function Toasts({ items }: { items: ToastMessage[] }) {
  const seen = useRef<Set<number> | null>(null);
  if (seen.current === null) seen.current = new Set(items.map((t) => t.id));
  const [dismissed, setDismissed] = useState<Set<number>>(() => new Set(items.map((t) => t.id)));

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const t of items) {
      if (seen.current!.has(t.id)) continue;
      seen.current!.add(t.id);
      timers.push(setTimeout(() => setDismissed((d) => new Set(d).add(t.id)), TOAST_MS));
    }
    return () => timers.forEach(clearTimeout);
  }, [items]);

  const visible = items.filter((t) => !dismissed.has(t.id)).slice(-2);
  if (!visible.length) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex flex-col items-center gap-2">
      {visible.map((t) => (
        <div
          key={t.id}
          className="card-in rounded-full border border-ember/40 bg-ink/90 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.25em] text-ember"
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
