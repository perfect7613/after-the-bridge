"use client";

import { useEffect, useRef } from "react";
import { SCENES } from "@/src/chapter";
import { TRAVEL_SECONDS, type WorldProps } from "../types";

const GRADIENTS: Record<string, string> = {
  night_rain: "radial-gradient(ellipse at 50% 20%, #3a2a12 0%, #0b0d12 45%, #05060a 100%)",
  dawn_smoke: "radial-gradient(ellipse at 30% 60%, #4a4a52 0%, #23252c 40%, #0c0d12 100%)",
  dusk_wind: "radial-gradient(ellipse at 50% 90%, #7a3a1a 0%, #3b1e3a 45%, #0a0810 100%)",
  black: "#000",
};

/**
 * No network. A gradient for the mood and the scene's words. Runs the same
 * per-scene clock the live adapter does, so the Chapter behaves identically.
 */
export function PlaceholderWorld({ scene, mood, steer, active, onClock, onEnded, onStatus }: WorldProps) {
  const endedFor = useRef<string | null>(null);

  useEffect(() => {
    onStatus("placeholder");
  }, [onStatus]);

  useEffect(() => {
    if (!active) {
      onClock(null);
      return;
    }
    endedFor.current = null;
    onClock(TRAVEL_SECONDS);
    const started = Date.now();
    const id = setInterval(() => {
      const left = Math.max(0, TRAVEL_SECONDS - Math.floor((Date.now() - started) / 1000));
      onClock(left);
      if (left === 0 && endedFor.current !== scene) {
        endedFor.current = scene;
        clearInterval(id);
        onEnded(scene);
      }
    }, 250);
    return () => clearInterval(id);
  }, [scene, active, onClock, onEnded]);

  const data = SCENES[scene];
  return (
    <div
      className="relative h-full w-full overflow-hidden transition-[background] duration-1000"
      style={{ background: GRADIENTS[active ? mood : "black"] }}
      aria-label="World"
    >
      <div className="absolute inset-0 rain" aria-hidden />
      {active && (
        <div className="absolute inset-x-0 bottom-0 p-6 text-left">
          <p className="font-serif text-[13px] uppercase tracking-[0.3em] text-white/40">
            {data.title} · {data.subtitle}
          </p>
          <p key={steer.seq} className="steer-in mt-2 max-w-2xl font-serif text-lg leading-snug text-white/75">
            {steer.instruction}
          </p>
        </div>
      )}
    </div>
  );
}
