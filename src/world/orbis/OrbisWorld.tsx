"use client";

import {
  ViskoOrbisStableMainVideoView,
  ViskoOrbisStableProvider,
  useViskoOrbisStable,
  useViskoOrbisStableChunkComplete,
  useViskoOrbisStableCommandError,
  useViskoOrbisStableGenerationComplete,
  useViskoOrbisStableState,
  type ViskoOrbisStableStateMessage,
} from "@reactor-models/visko-orbis-stable";
import { useCallback, useEffect, useRef, useState } from "react";
import { SCENES, type SceneId } from "@/src/chapter";
import { TRAVEL_SECONDS, type WorldProps, type WorldStatus } from "../types";
import { getJwt } from "../token";
import { orbisFollowPrompt, orbisInitialPrompt } from "./prompts";

const CONNECT = { autoConnect: false, maxAttempts: 12 } as const;

export function OrbisWorld(props: WorldProps) {
  return (
    <ViskoOrbisStableProvider jwtToken={getJwt} apiUrl="https://api.reactor.inc" connectOptions={CONNECT}>
      <div className="world-stage">
        <ViskoOrbisStableMainVideoView className="world-video" audioTrack="main_audio" />
        <Session {...props} />
      </div>
    </ViskoOrbisStableProvider>
  );
}

function Session({ scene, steer, active, onClock, onEnded, onStatus, onSteering }: WorldProps) {
  const orbis = useViskoOrbisStable();
  const [status, setStatus] = useState<WorldStatus>("idle");
  const [detail, setDetail] = useState<string | undefined>();
  const [tick, setTick] = useState(0);
  const [priming, setPriming] = useState(true);
  const snap = useRef<ViskoOrbisStableStateMessage | null>(null);
  const liveScene = useRef<SceneId | null>(null);
  const lastSteerSeq = useRef(-1);
  const clockStart = useRef<number | null>(null);
  const spentFor = useRef<SceneId | null>(null);
  const busy = useRef(false);
  const waitChunk = useRef<number | null>(null);
  const pendingFollow = useRef<string | null>(null);
  const launching = useRef(false);
  const followGen = useRef(0);
  const mounted = useRef(true);
  const steerRef = useRef(steer);
  const retryAt = useRef(0);
  steerRef.current = steer;

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
      if (spentFor.current === which) return;
      spentFor.current = which;
      clockStart.current = null;
      onClock(null);
      report("ended");
      onEnded(which);
      if (snap.current?.started && !snap.current.paused) void orbis.pause().catch(() => {});
      setTick((n) => n + 1);
    },
    [orbis, onClock, onEnded, report],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      onSteering?.(false);
    };
  }, [onSteering]);

  useEffect(() => {
    if (orbis.status !== "ready") snap.current = null;
  }, [orbis.status]);

  useViskoOrbisStableState((msg) => {
    snap.current = msg;
  });

  useViskoOrbisStableCommandError((msg) => {
    console.warn(`[orbis] command_error ${msg.command}: ${msg.reason}`);
    report("held", msg.reason);
  });

  const flushFollow = useCallback(
    (prompt: string) => {
      const id = ++followGen.current;
      onSteering?.(true);
      waitChunk.current = (snap.current?.current_chunk ?? 0) + 1;
      return orbis
        .setPrompt({ prompt })
        .then(() => {
          window.setTimeout(() => {
            if (!mounted.current || followGen.current !== id) return;
            if (waitChunk.current != null) {
              waitChunk.current = null;
              onSteering?.(false);
            }
          }, 5000);
        })
        .catch((err) => {
          report("held", err instanceof Error ? err.message : String(err));
          onSteering?.(false);
        });
    },
    [orbis, onSteering, report],
  );

  useViskoOrbisStableChunkComplete((msg) => {
    if (msg.frames_emitted > 0) setPriming(false);
    if (waitChunk.current != null && msg.chunk_index >= waitChunk.current && msg.frames_emitted > 0) {
      waitChunk.current = null;
      onSteering?.(false);
      const next = pendingFollow.current;
      if (next && snap.current?.running) {
        pendingFollow.current = null;
        void flushFollow(next);
      }
    }
  });

  useViskoOrbisStableGenerationComplete(() => {
    // Prompt + image + seed do not survive the run. A new start is a hard cut.
    if (snap.current) snap.current = { ...snap.current, started: false, running: false };
    launching.current = false;
    if (!active || spentFor.current || clockStart.current == null) return;
    setTick((n) => n + 1);
  });

  const step = (run: Promise<unknown>, onError?: (cause: unknown) => void) => {
    busy.current = true;
    void run
      .catch((cause) => {
        console.warn("[orbis] step failed", cause);
        onError?.(cause);
      })
      .finally(() => {
        busy.current = false;
        setTick((n) => n + 1);
      });
  };

  useEffect(() => {
    if (!active) {
      clockStart.current = null;
      onClock(null);
      if (snap.current?.started && !snap.current.paused) void orbis.pause().catch(() => {});
      return;
    }
    if (busy.current) return;

    if (spentFor.current === scene) return;
    if (spentFor.current && spentFor.current !== scene) {
      spentFor.current = null;
      liveScene.current = null;
      lastSteerSeq.current = -1;
      waitChunk.current = null;
      pendingFollow.current = null;
      followGen.current += 1;
      launching.current = false;
      clockStart.current = null;
      setPriming(true);
    }

    if (orbis.status === "disconnected") {
      if (Date.now() < retryAt.current) return;
      const capacity = isCapacity(orbis.lastError);
      report(capacity ? "building" : "connecting", capacity ? "At capacity — retrying…" : undefined);
      step(orbis.connect(getJwt), (cause) => {
        if (isCapacity(cause) || isCapacity(orbis.lastError)) {
          retryAt.current = Date.now() + 8000;
          report("building", "At capacity — retrying…");
          window.setTimeout(() => {
            if (mounted.current) setTick((n) => n + 1);
          }, 8000);
          return;
        }
        report("failed", cause instanceof Error ? cause.message : String(cause));
      });
      return;
    }

    if (orbis.status === "connecting" || orbis.status === "waiting") {
      report("building", orbis.status === "waiting" ? "The world is waking. This can take a minute." : undefined);
      return;
    }

    if (orbis.status !== "ready") return;

    if (liveScene.current && liveScene.current !== scene && snap.current?.started) {
      report("starting", "Cutting to the next scene");
      step(
        orbis.reset().then(() => {
          liveScene.current = null;
          lastSteerSeq.current = -1;
          launching.current = false;
          setPriming(true);
        }),
      );
      return;
    }

    if (snap.current?.started) launching.current = false;

    if (!snap.current?.started && !launching.current) {
      launching.current = true;
      const prompt = orbisInitialPrompt(scene);
      lastSteerSeq.current = steerRef.current.seq;
      report("starting", "The light is coming up…");
      setPriming(true);
      step(
        (async () => {
          const resolutions = Array.isArray(snap.current?.available_resolutions)
            ? snap.current.available_resolutions.filter((r): r is string => typeof r === "string")
            : [];
          if (resolutions.includes("1080p") && snap.current?.resolution !== "1080p") {
            await orbis.setResolution({ resolution: "1080p" });
          }
          const accepted = await orbis.setPrompt({ prompt });
          if (!accepted) throw new Error("Orbis did not take the opening prompt.");
          await orbis.start();
          liveScene.current = scene;
          if (clockStart.current == null) clockStart.current = Date.now();
          waitChunk.current = (snap.current?.current_chunk ?? 0) + 1;
          onSteering?.(true);
          report("live");
        })(),
        (cause) => {
          launching.current = false;
          report("failed", cause instanceof Error ? cause.message : String(cause));
        },
      );
    }
  }, [
    active,
    scene,
    orbis.status,
    orbis.lastError,
    orbis.connect,
    orbis.setPrompt,
    orbis.setResolution,
    orbis.start,
    orbis.reset,
    orbis.pause,
    tick,
    onClock,
    onSteering,
    report,
  ]);

  useEffect(() => {
    if (status !== "live" || !snap.current?.started || spentFor.current) return;
    if (steer.seq === lastSteerSeq.current || !steer.instruction) return;
    lastSteerSeq.current = steer.seq;
    const prompt = orbisFollowPrompt(scene, steer.instruction);
    if (waitChunk.current != null) {
      pendingFollow.current = prompt;
      return;
    }
    void flushFollow(prompt);
  }, [steer.seq, steer.instruction, scene, status, flushFollow]);

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

  const data = SCENES[scene];
  const showVeil = status !== "live" || priming;

  return (
    <div className="pointer-events-none absolute inset-0">
      {showVeil && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 text-center">
          <p className="font-serif text-[13px] uppercase tracking-[0.3em] text-white/40">
            {data.title} · {data.subtitle}
          </p>
          <p className="mt-3 font-serif text-lg text-white/70">
            {status === "live" && priming ? "The first frame is still coming up…" : veilText(status, detail)}
          </p>
        </div>
      )}
      {status === "held" && (
        <div className="absolute left-4 top-4 z-10 rounded-full bg-black/60 px-3 py-1 text-xs uppercase tracking-widest text-amber-200/80">
          signal held
        </div>
      )}
    </div>
  );
}

function isCapacity(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err ?? "");
  return /capacity|429/i.test(text);
}

function veilText(status: WorldStatus, detail?: string): string {
  switch (status) {
    case "idle":
    case "connecting":
      return "Reaching the world…";
    case "building":
      return detail ?? "The world is waking…";
    case "starting":
      return detail ?? "The light is coming up…";
    case "ended":
      return "The light goes.";
    case "failed":
      return `The world did not answer. ${detail ?? ""}`.trim();
    default:
      return "";
  }
}
