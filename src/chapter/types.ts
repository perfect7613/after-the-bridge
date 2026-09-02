export type SceneId = "underpass" | "pharmacy" | "bridge";

export type Actor = "player" | "wren";

export type Tone = "calm" | "urgent" | "bitter" | "warm";

export type Mood = "night_rain" | "dawn_smoke" | "dusk_wind" | "black";

export type Item = "crowbar" | "antibiotics";

export type Ending = "together" | "alone";

/** `chapter` lines are plain-language status ("Wren is wounded. She can no longer run."), never voiced. */
export type Speaker = "wren" | "stranger" | "narrator" | "chapter";

/** Who plays Wren's voice in the dialogue: authored lines, or an agent through the tools. */
export type Companion = "scripted" | "agent";

/** Every WebMCP tool Wren can wear. Presence in a snapshot is the state. */
export type CapabilityName =
  | "begin"
  | "look"
  | "listen"
  | "recall"
  | "get_scene_state"
  | "move_to"
  | "take"
  | "give"
  | "open"
  | "run"
  | "hide"
  | "say"
  | "ask_player"
  | "follow_my_lead"
  | "decide"
  | "ready";

export type LedgerKind =
  | "choice"
  | "look"
  | "silence"
  | "answer"
  | "wound"
  | "item"
  | "trust"
  | "refusal"
  | "speech"
  | "scene"
  | "ending"
  | "capabilities";

export interface LedgerEntry {
  id: number;
  scene: SceneId;
  beat: number;
  actor: Actor | "chapter";
  kind: LedgerKind;
  /** What happened, in Wren's words. */
  text: string;
  /** How Wren recorded feeling about it, if she did. */
  feeling?: string;
  trustDelta?: number;
  irreversible?: boolean;
}

export interface Choice {
  id: string;
  label: string;
  /** Shown to Codex in the decide enum description. */
  hint: string;
  /** Only the player can click this card; Wren cannot decide it. */
  playerOnly?: boolean;
  /** Only Wren can decide this; no card is shown. */
  wrenOnly?: boolean;
}

export interface Exit {
  id: string;
  label: string;
  to: SceneId | Ending;
}

export interface DialogueLine {
  id: number;
  speaker: Speaker;
  text: string;
  tone?: Tone;
}

export interface Elicitation {
  id: number;
  question: string;
  options: string[];
  openedAt: number;
  expiresAt: number;
}

export interface Steer {
  seq: number;
  instruction: string;
  mood: Mood;
}

export interface Snapshot {
  scene: SceneId;
  sceneTitle: string;
  sceneSubtitle: string;
  /** What the player needs here, in one plain sentence. */
  goal: string;
  phase: "situation" | "resolved" | "ended";
  beat: number;
  beatsLeft: number;
  trust: number;
  trustThreshold: number;
  wren: { wounded: boolean; inventory: Item[]; hidden: boolean };
  player: { inventory: Item[] };
  present: string[];
  choices: Choice[];
  exits: Exit[];
  capabilities: CapabilityName[];
  pending: Elicitation | null;
  ledger: LedgerEntry[];
  dialogue: DialogueLine[];
  narration: string;
  steer: Steer;
  ending: Ending | null;
  /** False while the title card is up. Begin (button or tool) flips it. */
  begun: boolean;
  /** True while Wren still has the floor after a player move. Cards stay hidden. */
  waitingOnWren: boolean;
  /** Ids of ledger entries written by the most recent input, for toasts. */
  lastWrites: number[];
}

export type ChapterInput =
  | { kind: "begin"; actor: Actor }
  | { kind: "look"; actor: Actor; direction: string }
  | { kind: "listen"; actor: Actor }
  | { kind: "recall"; actor: Actor }
  | { kind: "scene_state"; actor: Actor }
  | { kind: "decide"; actor: Actor; choice: string }
  | { kind: "move_to"; actor: Actor; place: string }
  | { kind: "take"; actor: Actor; item: string }
  | { kind: "give"; actor: Actor; item: string }
  | { kind: "open"; actor: Actor; target: string }
  | { kind: "run"; actor: Actor }
  | { kind: "hide"; actor: Actor }
  | { kind: "say"; actor: Actor; text: string; tone?: Tone }
  | { kind: "ask"; actor: Actor; question: string; options: string[]; seconds: number }
  | { kind: "answer"; actor: Actor; answer: string }
  | { kind: "cancel_ask"; actor: Actor }
  | { kind: "follow_my_lead"; actor: Actor }
  | { kind: "ready"; actor: Actor }
  | { kind: "travel_ended"; actor: "chapter" };

export interface ChapterResult {
  ok: boolean;
  narration: string;
  refused?: boolean;
  reason?: string;
  citation?: LedgerEntry;
  error?: string;
  snapshot: Snapshot;
}
