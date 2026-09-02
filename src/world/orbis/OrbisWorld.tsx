"use client";

import {
  ViskoOrbisStableMainVideoView,
  ViskoOrbisStableProvider,
  useViskoOrbisStable,
  useViskoOrbisStableChunkComplete,
  useViskoOrbisStableCommandError,
  useViskoOrbisStableGenerationComplete,
  useViskoOrbisStableState,
  useViskoOrbisStableTrack,
  type ViskoOrbisStableStateMessage,
} from "@reactor-models/visko-orbis-stable";
import { useCallback, useEffect, useRef, useState } from "react";
import { SCENES, type SceneId } from "@/src/chapter";
import { TRAVEL_SECONDS, type WorldProps, type WorldStatus } from "../types";
import { getJwt } from "../token";
import { orbisFollowPrompt, orbisInitialPrompt } from "./prompts";

const CONNECT = { autoConnect: false, maxAttempts: 12 } as const;

const VIEW_STYLE = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%" } as const;

export function OrbisWorld(props: WorldProps) {
  return (
    <ViskoOrbisStableProvider jwtToken={getJwt} apiUrl="https://api.reactor.inc" connectOptions={CONNECT}>
      <div className="world-stage">
        <ViskoOrbisStableMainVideoView
          className="world-video"
          style={VIEW_STYLE}
          videoObjectFit="cover"
          muted
          audioTrack="main_audio"
        />
        <Session {...props} />
      </div>
    </ViskoOrbisStableProvider>
  );
}

function Session({ scene, steer, active, onClock, onEnded, onStatus, onSteering }: WorldProps) {
  const orbis = useViskoOrbisStable();
  const videoTrack = useViskoOrbisStableTrack("main_video");
  const [status, setStatus] = useState<WorldStatus>("idle");
  const [detail, setDetail] = useState<string | undefined>();
  const [tick, setTick] = useState(0);
  const [priming, setPriming] = useState(true);
  const [snap, setSnap] = useState<ViskoOrbisStableStateMessage | null>(null);
  const [needUnmute, setNeedUnmute] = useState(false);
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
      if (snap?.started && !snap.paused) void orbis.pause().catch(() => {});
      setTick((n) => n + 1);
    },
    [orbis, onClock, onEnded, report, snap],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      onSteering?.(false);
    };
  }, [onSteering]);

  useEffect(() => {
    if (orbis.status !== "ready") setSnap(null);
  }, [orbis.status]);

  useViskoOrbisStableState((msg) => {
    setSnap(msg);
  });

  useViskoOrbisStableCommandError((msg) => {
    console.warn(`[orbis] command_error ${msg.command}: ${msg.reason}`);
    report("held", msg.reason);
  });

  const flushFollow = useCallback(
    (prompt: string) => {
      const id = ++followGen.current;
      onSteering?.(true);
      waitChunk.current = (snap?.current_chunk ?? 0) + 1;
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
    [orbis, onSteering, report, snap],
  );

  useViskoOrbisStableChunkComplete((msg) => {
    if (msg.frames_emitted > 0) setPriming(false);
    if (waitChunk.current != null && msg.chunk_index >= waitChunk.current && msg.frames_emitted > 0) {
      waitChunk.current = null;
      onSteering?.(false);
      const next = pendingFollow.current;
      if (next && snap?.running) {
        pendingFollow.current = null;
        void flushFollow(next);
      }
    }
  });

  useViskoOrbisStableGenerationComplete(() => {
    setSnap((prev) => (prev ? { ...prev, started: false, running: false } : prev));
    launching.current = false;
    if (!active || spentFor.current || clockStart.current == null) return;
    setTick((n) => n + 1);
  });

  useEffect(() => {
    if (videoTrack) setPriming(false);
  }, [videoTrack]);

  useEffect(() => {
    const video = document.querySelector<HTMLVideoElement>(".world-stage video");
    if (!video) return;
    video.muted = true;
    video.playsInline = true;
    void video.play().then(() => setNeedUnmute(true)).catch(() => setNeedUnmute(true));
  }, [videoTrack, status]);

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
      if (snap?.started && !snap.paused) void orbis.pause().catch(() => {});
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

    if (liveScene.current && liveScene.current !== scene && snap?.started) {
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

    if (snap?.started) launching.current = false;

    if (!snap) {
      report("starting", "The world is listening…");
      return;
    }

    if (!snap.started && !launching.current) {
      launching.current = true;
      const prompt = orbisInitialPrompt(scene);
      lastSteerSeq.current = steerRef.current.seq;
      report("starting", "The light is coming up…");
      setPriming(true);
      step(
        (async () => {
          const resolutions = Array.isArray(snap.available_resolutions)
            ? snap.available_resolutions.filter((r): r is string => typeof r === "string")
            : [];
          if (resolutions.includes("1080p") && snap.resolution !== "1080p") {
            await orbis.setResolution({ resolution: "1080p" });
          }
          // SDK never rejects; a missing reply is not a failed send.
          await orbis.setPrompt({ prompt });
          await orbis.start();
          liveScene.current = scene;
          if (clockStart.current == null) clockStart.current = Date.now();
          waitChunk.current = (snap.current_chunk ?? 0) + 1;
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
    snap,
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
    if (status !== "live" || !snap?.started || spentFor.current) return;
    if (steer.seq === lastSteerSeq.current || !steer.instruction) return;
    lastSteerSeq.current = steer.seq;
    const prompt = orbisFollowPrompt(scene, steer.instruction);
    if (waitChunk.current != null) {
      pendingFollow.current = prompt;
      return;
    }
    void flushFollow(prompt);
  }, [steer.seq, steer.instruction, scene, status, snap?.started, flushFollow]);

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
  const hasPicture = Boolean(videoTrack) && !priming;
  const showVeil = status !== "live" || !hasPicture;

  return (
    <div className="absolute inset-0">
      {showVeil && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 text-center">
          <p className="font-serif text-[13px] uppercase tracking-[0.3em] text-white/40">
            {data.title} · {data.subtitle}
          </p>
          <p className="mt-3 font-serif text-lg text-white/70">
            {status === "live" ? "The first frame is still coming up…" : veilText(status, detail)}
          </p>
        </div>
      )}
      {status === "held" && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-full bg-black/60 px-3 py-1 text-xs uppercase tracking-widest text-amber-200/80">
          signal held
        </div>
      )}
      {needUnmute && status === "live" && hasPicture && (
        <button
          type="button"
          className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-md bg-paper px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink"
          onClick={() => {
            const video = document.querySelector<HTMLVideoElement>(".world-stage video");
            if (!video) return;
            video.muted = false;
            void video.play().catch(() => {});
            setNeedUnmute(false);
          }}
        >
          Sound on
        </button>
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
