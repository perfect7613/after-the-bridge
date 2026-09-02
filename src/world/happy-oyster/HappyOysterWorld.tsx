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
import { peekWorldId, rememberWorld } from "./worlds";

export interface HappyOysterWorldProps extends WorldProps {
  /** Persistent world ids from the server config. Missing scenes are created on demand. */
  worlds: Partial<Record<SceneId, string>>;
}

/**
 * The live World, wired the same way the official Happy Oyster example and the
 * working archive app do it: mint a JWT, mount the provider, then walk
 * connect → create/attach → startTravel from the model's phase. A one-shot
 * script dies in React Strict Mode because the provider disconnects on the
 * phantom unmount; reacting to phase retries the aborted step.
 */
export function HappyOysterWorld(props: HappyOysterWorldProps) {
  return (
    <HappyOysterProvider
      mode="directing"
      jwt={getJwt}
      autoConnect={false}
      apiUrl="https://api.reactor.inc"
      connectOptions={{ maxAttempts: 12 }}
    >
      <div className="world-stage">
        {/*
          Same idea as the archive's LingbotWorld2MainVideoView: the <video>
          fills the stage for the life of the session, always muted so the
          browser will autoplay the WebRTC stream. Wren's voice is TTS, not
          this element — passing muted={false} here blocks playback.
        */}
        <HappyOysterVideo className="world-video" autoPlay muted playsInline />
        <Travel {...props} />
      </div>
    </HappyOysterProvider>
  );
}

function Travel({ scene, steer, active, worlds, onClock, onEnded, onStatus, onSteering }: HappyOysterWorldProps) {
  const ho = useHappyOyster();
  const [status, setStatus] = useState<WorldStatus>("idle");
  const [detail, setDetail] = useState<string | undefined>();
  const liveScene = useRef<SceneId | null>(null);
  const lastSteerSeq = useRef(-1);
  const clockStart = useRef<number | null>(null);
  const endedFor = useRef<SceneId | null>(null);
  const spentFor = useRef<SceneId | null>(null);
  const busy = useRef(false);
  const connectTries = useRef(0);
  const enteredKey = useRef<string | null>(null);
  const startedKey = useRef<string | null>(null);
  const steerInflight = useRef(0);
  const [tick, setTick] = useState(0);

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
      endedFor.current = which;
      clockStart.current = null;
      onClock(null);
      report("ended");
      onEnded(which);
      setTick((n) => n + 1);
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

  useEffect(() => {
    const offState = ho.model.onWorldState((s) => {
      console.info(`[world] ${s.phase} ${s.world_status ?? ""} backend=${s.backend} id=${s.encrypted_world_id ?? "-"}`);
      if (s.encrypted_world_id) rememberWorld(scene, s.encrypted_world_id);
    });
    const offError = ho.model.onActionError((e) => {
      console.warn(`[world] action_error ${e.action} ${e.code}: ${e.message}`);
    });
    const offPhase = ho.model.onPhaseChanged((p) => {
      console.info(`[world] client phase=${p}`);
    });
    return () => {
      offState();
      offError();
      offPhase();
    };
  }, [ho.model, scene]);

  // Phase-driven session walk. Same machine as reactor-team/js-sdk examples/happy-oyster.
  useEffect(() => {
    if (!active) {
      clockStart.current = null;
      onClock(null);
      if (ho.streaming) void ho.endTravelSession().catch(() => {});
      return;
    }
    if (busy.current) return;

    const step = (run: Promise<unknown>, onError?: (cause: unknown) => void) => {
      busy.current = true;
      void run
        .catch((cause) => {
          console.warn("[world] step failed", cause);
          onError?.(cause);
        })
        .finally(() => {
          busy.current = false;
          setTick((n) => n + 1);
        });
    };

    // This scene's travel already finished. Do not connect or startTravel again.
    if (spentFor.current === scene) {
      if (ho.streaming) step(ho.endTravelSession());
      return;
    }
    if (spentFor.current && spentFor.current !== scene) {
      spentFor.current = null;
      endedFor.current = null;
      startedKey.current = null;
      enteredKey.current = null;
      liveScene.current = null;
      connectTries.current = 0;
    }

    if (ho.phase === "idle" || ho.phase === "ended" || ho.phase === "failed") {
      if (connectTries.current >= 3) {
        report("failed", "Reactor did not answer. It may be at capacity.");
        return;
      }
      connectTries.current += 1;
      report("connecting");
      step(
        ho.connect(getJwt).then(() => {
          connectTries.current = 0;
        }),
        (cause) => report("failed", cause instanceof Error ? cause.message : String(cause)),
      );
      return;
    }

    if (ho.phase === "connecting" || ho.phase === "starting_stream") return;

    const worldPhase = ho.worldState?.phase;
    if (worldPhase === "creating" || worldPhase === "building") {
      report("building", ho.worldState?.world_status || "The world is being built. This can take a couple of minutes.");
      return;
    }

    if (ho.streaming && liveScene.current && liveScene.current !== scene) {
      startedKey.current = null;
      enteredKey.current = null;
      step(ho.endTravelSession());
      return;
    }

    if (ho.phase !== "connected" && ho.phase !== "streaming") return;

    const boundId = ho.worldState?.encrypted_world_id;
    const desiredId = peekWorldId(scene, worlds);
    const enterKey = `${scene}:${desiredId ?? "new"}`;

    if (worldPhase === "ready" || worldPhase === "traveling") {
      const wrongWorld = desiredId ? boundId !== desiredId : liveScene.current !== null && liveScene.current !== scene;
      if (wrongWorld && ho.phase === "connected") {
        if (enteredKey.current === enterKey) return;
        enteredKey.current = enterKey;
        report("building", "Attaching the world");
        step(
          ho.attachWorld(desiredId!),
          (cause) => {
            enteredKey.current = null;
            report("failed", cause instanceof Error ? cause.message : String(cause));
          },
        );
        return;
      }
    }

    if ((worldPhase === "no_world" || worldPhase === "failed" || !worldPhase) && ho.phase === "connected") {
      if (enteredKey.current === enterKey) return;
      enteredKey.current = enterKey;
      if (desiredId) {
        report("building", "Attaching the world");
        step(
          ho.attachWorld(desiredId),
          (cause) => {
            enteredKey.current = null;
            report("failed", cause instanceof Error ? cause.message : String(cause));
          },
        );
        return;
      }
      report("building", "Creating a new world. This takes a minute or two.");
      step(
        ho
          .createWorld({ prompt: SCENES[scene].worldPrompt, resolution: "720p", layout: "Stable", narrative: "Calm" })
          .then((state) => {
            if (state.encrypted_world_id) rememberWorld(scene, state.encrypted_world_id);
          }),
        (cause) => {
          enteredKey.current = null;
          report("failed", cause instanceof Error ? cause.message : String(cause));
        },
      );
      return;
    }

    if (worldPhase === "ready" && ho.phase === "connected" && !ho.streaming) {
      if (startedKey.current === enterKey) return;
      startedKey.current = enterKey;
      report("starting", "Opening the travel");
      step(
        ho.startTravel().then(() => {
          liveScene.current = scene;
          endedFor.current = null;
          lastSteerSeq.current = -1;
          steerInflight.current = 0;
          clockStart.current = Date.now();
          report("live");
        }),
        (cause) => {
          startedKey.current = null;
          report("failed", cause instanceof Error ? cause.message : String(cause));
        },
      );
    }
  }, [
    active,
    scene,
    worlds,
    ho.phase,
    ho.streaming,
    ho.worldState?.phase,
    ho.worldState?.encrypted_world_id,
    ho.worldState?.world_status,
    tick,
    ho.connect,
    ho.createWorld,
    ho.attachWorld,
    ho.startTravel,
    ho.endTravelSession,
    onClock,
    report,
  ]);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      steerInflight.current = 0;
      onSteering?.(false);
    };
  }, [onSteering]);

  useEffect(() => {
    if (status !== "live" || !ho.streaming) return;
    if (steer.seq === lastSteerSeq.current || !steer.instruction) return;
    lastSteerSeq.current = steer.seq;
    steerInflight.current += 1;
    onSteering?.(true);
    void ho
      .instruct(steer.instruction)
      .catch((err) => {
        report("held", err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        window.setTimeout(() => {
          if (!mounted.current || spentFor.current) {
            onSteering?.(false);
            return;
          }
          steerInflight.current = Math.max(0, steerInflight.current - 1);
          onSteering?.(steerInflight.current > 0);
        }, 800);
      });
  }, [steer.seq, steer.instruction, status, ho, report, onSteering]);

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

  const firstFrame = ho.worldState?.first_frame;
  const live = ho.streaming || status === "live";

  useEffect(() => {
    if (!live) return;
    const video = document.querySelector<HTMLVideoElement>(".world-stage > video.world-video");
    if (!video) return;
    video.muted = true;
    video.playsInline = true;
    void video.play().catch(() => {});
  }, [live]);

  const data = SCENES[scene];

  return (
    <div className="pointer-events-none absolute inset-0">
      {firstFrame && !live && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={firstFrame} alt="" className="world-poster" />
      )}
      {!live && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 text-center">
          <p className="font-serif text-[13px] uppercase tracking-[0.3em] text-white/40">
            {data.title} · {data.subtitle}
          </p>
          <p className="mt-3 font-serif text-lg text-white/70">{veilText(status, detail)}</p>
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
