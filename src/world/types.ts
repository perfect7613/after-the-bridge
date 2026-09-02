import type { Mood, SceneId, Steer } from "@/src/chapter";

export type WorldStatus =
  | "idle"
  | "connecting"
  | "building"
  | "starting"
  | "live"
  | "held"
  | "ended"
  | "failed"
  | "placeholder";

export type WorldMode = "placeholder" | "orbis" | "happy-oyster";

/** Every scene is one Travel of this many seconds. Directing worlds report no cap, so the clock is ours. */
export const TRAVEL_SECONDS = 180;

export interface WorldProps {
  scene: SceneId;
  mood: Mood;
  steer: Steer;
  /** False once the chapter has ended: stop streaming, go dark. */
  active: boolean;
  onClock: (remainingSec: number | null) => void;
  /** The Travel for this scene is over. The Chapter decides what that means. */
  onEnded: (scene: SceneId) => void;
  onStatus: (status: WorldStatus, detail?: string) => void;
  /** True while a steer is still being applied to the live world model. */
  onSteering?: (busy: boolean) => void;
}
