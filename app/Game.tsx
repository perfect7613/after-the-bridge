"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chapter, SCENES, type SceneId, type Snapshot } from "@/src/chapter";
import { EndingCard, GameShell, StartCard, type ToastMessage } from "@/src/chrome";
import { sarvamVoice, silentVoice, voiceConfigured, type Voice } from "@/src/voice";
import { getWorldConfig, HappyOysterWorld, PlaceholderWorld, type WorldConfig, type WorldMode, type WorldStatus } from "@/src/world";
import { Wren, type WrenState } from "@/src/wren";

type Phase = "start" | "playing" | "ended";

const SCENE_CARD_MS = 2600;
const ENDING_DELAY_MS = 4000;

export function Game() {
  const chapter = useMemo(() => new Chapter(), []);
  const [snapshot, setSnapshot] = useState<Snapshot>(() => chapter.snapshot());
  const [wrenState, setWrenState] = useState<WrenState>({ webmcp: false, registered: [], activity: [] });
  const [phase, setPhase] = useState<Phase>("start");
  const [config, setConfig] = useState<WorldConfig>({ configured: false, worlds: {} });
  const [worldMode, setWorldMode] = useState<WorldMode>("placeholder");
  const [worldStatus, setWorldStatus] = useState<WorldStatus>("idle");
  const [worldDetail, setWorldDetail] = useState<string | undefined>();
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [showSceneCard, setShowSceneCard] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const voiceRef = useRef<Voice>(silentVoice());
  const spokenUpTo = useRef(0);

  // Wren wears the Chapter from page load, before Begin, so Codex can see her.
  useEffect(() => {
    const unsubChapter = chapter.subscribe(setSnapshot);
    const wren = new Wren(chapter, Wren.detect());
    const unsubWren = wren.subscribe(setWrenState);
    const unmount = wren.mount();
    return () => {
      unmount();
      unsubWren();
      unsubChapter();
    };
  }, [chapter]);

  // Which World and Voice this deployment can offer.
  useEffect(() => {
    let alive = true;
    void getWorldConfig().then((c) => {
      if (!alive) return;
      setConfig(c);
      const params = new URLSearchParams(window.location.search);
      const forced = params.get("world");
      setWorldMode(forced === "placeholder" ? "placeholder" : c.configured ? "happy-oyster" : "placeholder");
      if (params.get("begin") === "1") setPhase((p) => (p === "start" ? "playing" : p));
    });
    void voiceConfigured().then((ok) => {
      if (!alive) return;
      setVoiceAvailable(ok);
      voiceRef.current = ok ? sarvamVoice() : silentVoice();
    });
    return () => {
      alive = false;
    };
  }, []);

  // Wren's spoken lines go through Voice. Narration stays on the page.
  useEffect(() => {
    if (phase !== "playing" || !voiceOn) return;
    const fresh = snapshot.dialogue.filter((l) => l.id > spokenUpTo.current && l.speaker !== "narrator");
    if (!fresh.length) return;
    spokenUpTo.current = snapshot.dialogue[snapshot.dialogue.length - 1].id;
    for (const line of fresh) void voiceRef.current.speak(line.speaker, line.text, line.tone);
  }, [snapshot.dialogue, phase, voiceOn]);

  // Irreversible Ledger writes get a toast; the Toasts component shows only new ones.
  const toasts = useMemo<ToastMessage[]>(
    () =>
      snapshot.ledger
        .filter((e) => e.irreversible)
        .map((e) => ({ id: e.id, text: e.kind === "refusal" ? "Wren refused. It is in the ledger." : "Wren will remember that." })),
    [snapshot.ledger],
  );

  // Cut to black between scenes.
  const lastScene = useRef<SceneId>(snapshot.scene);
  useEffect(() => {
    if (phase !== "playing" || snapshot.scene === lastScene.current) return;
    lastScene.current = snapshot.scene;
    setShowSceneCard(true);
    const id = setTimeout(() => setShowSceneCard(false), SCENE_CARD_MS);
    return () => clearTimeout(id);
  }, [snapshot.scene, phase]);

  // The ending screen arrives after the last line has had a moment.
  useEffect(() => {
    if (!snapshot.ending || phase !== "playing") return;
    const id = setTimeout(() => setPhase("ended"), ENDING_DELAY_MS);
    return () => clearTimeout(id);
  }, [snapshot.ending, phase]);

  const onClock = useCallback((sec: number | null) => setRemainingSec(sec), []);
  const onEnded = useCallback(
    (scene: SceneId) => {
      if (chapter.snapshot().scene === scene && !chapter.snapshot().ending) chapter.input({ kind: "travel_ended", actor: "chapter" });
    },
    [chapter],
  );
  const onStatus = useCallback((s: WorldStatus, d?: string) => {
    setWorldStatus(s);
    setWorldDetail(d);
  }, []);

  const onChoice = useCallback((id: string) => chapter.input({ kind: "decide", actor: "player", choice: id }), [chapter]);
  const onExit = useCallback((id: string) => chapter.input({ kind: "move_to", actor: "player", place: id }), [chapter]);
  const onAnswer = useCallback((a: string) => chapter.input({ kind: "answer", actor: "player", answer: a }), [chapter]);

  if (phase === "start") {
    return (
      <StartCard
        webmcp={wrenState.webmcp}
        liveWorld={worldMode === "happy-oyster"}
        onBegin={() => {
          setShowSceneCard(true);
          setTimeout(() => setShowSceneCard(false), SCENE_CARD_MS);
          setPhase("playing");
        }}
      />
    );
  }

  if (phase === "ended") {
    return <EndingCard snapshot={snapshot} onAgain={() => window.location.reload()} />;
  }

  const active = !snapshot.ending;
  const world =
    worldMode === "happy-oyster" ? (
      <HappyOysterWorld
        key="live"
        scene={snapshot.scene}
        mood={SCENES[snapshot.scene].mood}
        steer={snapshot.steer}
        active={active}
        worlds={config.worlds}
        muted={!voiceOn}
        onClock={onClock}
        onEnded={onEnded}
        onStatus={onStatus}
      />
    ) : (
      <PlaceholderWorld
        key="placeholder"
        scene={snapshot.scene}
        mood={SCENES[snapshot.scene].mood}
        steer={snapshot.steer}
        active={active}
        onClock={onClock}
        onEnded={onEnded}
        onStatus={onStatus}
      />
    );

  const { label: worldLabel, tone: worldTone } = describeWorld(worldMode, worldStatus, worldDetail);

  return (
    <GameShell
      snapshot={snapshot}
      wren={wrenState}
      world={world}
      worldLabel={worldLabel}
      worldTone={worldTone}
      remainingSec={remainingSec}
      showSceneCard={showSceneCard}
      ledgerOpen={ledgerOpen}
      toasts={toasts}
      voiceLabel={voiceAvailable ? (voiceOn ? "Voice on" : "Voice off") : "No voice"}
      onToggleLedger={() => setLedgerOpen((o) => !o)}
      onToggleVoice={() => {
        if (!voiceAvailable) return;
        setVoiceOn((v) => {
          if (v) voiceRef.current.stop();
          return !v;
        });
      }}
      onToggleWorld={config.configured ? () => setWorldMode((m) => (m === "happy-oyster" ? "placeholder" : "happy-oyster")) : undefined}
      onChoice={onChoice}
      onExit={onExit}
      onAnswer={onAnswer}
    />
  );
}

function describeWorld(mode: WorldMode, status: WorldStatus, detail?: string): { label: string; tone: "live" | "warn" | "muted" } {
  if (mode === "placeholder") return { label: "Placeholder world", tone: "muted" };
  switch (status) {
    case "live":
      return { label: "Live · Happy Oyster", tone: "live" };
    case "held":
      return { label: "Signal held", tone: "warn" };
    case "failed":
      return { label: detail ? `World failed` : "World failed", tone: "warn" };
    case "ended":
      return { label: "The light went", tone: "muted" };
    default:
      return { label: "Reaching the world…", tone: "warn" };
  }
}
