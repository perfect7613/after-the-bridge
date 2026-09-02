"use client";

import {
  HappyOysterProvider,
  HappyOysterVideo,
  useHappyOyster,
  useHappyOysterTravelError,
  useHappyOysterTravelStatus,
} from "@reactor-models/happy-oyster/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SCENES, type SceneId } from "@/src/chapter";
import { TRAVEL_SECONDS, type WorldProps, type WorldStatus } from "../types";
import { getJwt } from "./token";
import { resolveWorld } from "./worlds";

export interface HappyOysterWorldProps extends WorldProps {
  /** Persistent world ids from the server config. Missing scenes are created on demand. */
  worlds: Partial<Record<SceneId, string>>;
  muted?: boolean;
}

/**
 * The live World: one persistent Directing world per Scene, one Travel per
 * visit. attachWorld → startTravel → instruct on every Chapter steer. JWT
 * minting happens behind getJwt; nothing above this file knows about tokens.
 */
export function HappyOysterWorld(props: HappyOysterWorldProps) {
  return (
    <HappyOysterProvider mode="directing" jwt={getJwt} autoConnect={false}>
      <Travel {...props} />
    </HappyOysterProvider>
  );
}

function Travel({ scene, steer, active, worlds, muted, onClock, onEnded, onStatus }: HappyOysterWorldProps) {
  const ho = useHappyOyster();
  const [status, setStatus] = useState<WorldStatus>("idle");
  const [detail, setDetail] = useState<string | undefined>();
  const generation = useRef(0);
  const liveScene = useRef<SceneId | null>(null);
  const lastSteerSeq = useRef(-1);
  const clockStart = useRef<number | null>(null);
  const endedFor = useRef<SceneId | null>(null);

  const report = useCallback(
    (s: WorldStatus, d?: string) => {
      setStatus(s);
      setDetail(d);
      onStatus(s, d);
    },
    [onStatus],
  );

  const finish = useCallback(
    (which: SceneId) => {
      if (endedFor.current === which) return;
      endedFor.current = which;
      clockStart.current = null;
      onClock(null);
      report("ended");
      onEnded(which);
    },
    [onClock, onEnded, report],
  );

  useHappyOysterTravelStatus((travelStatus) => {
    if (travelStatus === "completed" || travelStatus === "failed") {
      if (liveScene.current) finish(liveScene.current);
    }
  });

  useHappyOysterTravelError((err) => {
    report("held", err instanceof Error ? err.message : String(err));
  });

  // Surface the world id the moment the model names it, so a build that is
  // interrupted still leaves an id to pin in REACTOR_WORLD_IDS.
  useEffect(
    () =>
      ho.model.onWorldState((s) => {
        if (s.encrypted_world_id) console.info(`[world] ${s.phase} ${s.world_status ?? ""} id=${s.encrypted_world_id}`);
      }),
    [ho.model],
  );

  // Scene lifecycle: end the previous Travel, attach this scene's world, start.
  useEffect(() => {
    const gen = ++generation.current;
    const stale = () => gen !== generation.current;

    if (!active) {
      clockStart.current = null;
      onClock(null);
      void ho.endTravelSession().catch(() => {});
      return;
    }

    (async () => {
      try {
        if (ho.phase === "idle" || ho.phase === "failed" || ho.phase === "ended") {
          report("connecting");
          await ho.connect(getJwt);
          if (stale()) return;
        }
        if (ho.streaming) {
          await ho.endTravelSession();
          if (stale()) return;
        }
        report("building", "Attaching the world");
        const { id, created } = await resolveWorld(scene, worlds, async (prompt) => {
          report("building", "Creating a new world. This takes a minute.");
          const state = await ho.createWorld({ prompt, resolution: "720p", layout: "Stable", narrative: "Calm" });
          if (!state.encrypted_world_id) throw new Error("World created without an id.");
          return state.encrypted_world_id;
        });
        if (stale()) return;
        if (!created) await ho.attachWorld(id);
        if (stale()) return;

        report("starting", "Opening the travel");
        await ho.startTravel();
        if (stale()) return;

        liveScene.current = scene;
        endedFor.current = null;
        lastSteerSeq.current = -1;
        clockStart.current = Date.now();
        report("live");
      } catch (err) {
        if (stale()) return;
        const message = err instanceof Error ? err.message : String(err);
        report("failed", message);
      }
    })();
    // ho is a stable facade; scene and active are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, active]);

  // Steer the live picture on every Chapter beat.
  useEffect(() => {
    if (status !== "live" || !ho.streaming) return;
    if (steer.seq === lastSteerSeq.current || !steer.instruction) return;
    lastSteerSeq.current = steer.seq;
    void ho.instruct(steer.instruction).catch((err) => {
      report("held", err instanceof Error ? err.message : String(err));
    });
  }, [steer.seq, steer.instruction, status, ho, report]);

  // Client clock: Directing travels report no cap, so 3:00 is ours to count.
  useEffect(() => {
    if (status !== "live") return;
    const id = setInterval(() => {
      if (clockStart.current === null) return;
      const left = Math.max(0, TRAVEL_SECONDS - Math.floor((Date.now() - clockStart.current) / 1000));
      onClock(left);
      if (left === 0 && liveScene.current) finish(liveScene.current);
    }, 250);
    return () => clearInterval(id);
  }, [status, onClock, finish]);

  useEffect(() => () => void ho.disconnect().catch(() => {}), [ho]);

  const data = SCENES[scene];
  const showVeil = status !== "live" && status !== "held";

  return (
    <div className="relative h-full w-full overflow-hidden bg-black" aria-label="World">
      <HappyOysterVideo autoPlay playsInline muted={muted} className="h-full w-full object-cover" />
      {showVeil && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 text-center">
          <p className="font-serif text-[13px] uppercase tracking-[0.3em] text-white/40">
            {data.title} · {data.subtitle}
          </p>
          <p className="mt-3 font-serif text-lg text-white/70">{veilText(status, detail)}</p>
        </div>
      )}
      {status === "held" && (
        <div className="absolute left-4 top-4 rounded-full bg-black/60 px-3 py-1 text-xs uppercase tracking-widest text-amber-200/80">
          signal held
        </div>
      )}
    </div>
  );
}

function veilText(status: WorldStatus, detail?: string): string {
  switch (status) {
    case "idle":
    case "connecting":
      return "Reaching the world…";
    case "building":
      return detail ?? "Building…";
    case "starting":
      return "The light is coming up…";
    case "ended":
      return "The light goes.";
    case "failed":
      return `The world did not answer. ${detail ?? ""}`.trim();
    default:
      return "";
  }
}
