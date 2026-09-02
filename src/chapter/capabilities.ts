import { TRUST_THRESHOLD } from "./scenes";
import type { CapabilityName, Choice, Item, SceneId } from "./types";

export interface BodyState {
  scene: SceneId;
  phase: "situation" | "resolved" | "ended";
  begun: boolean;
  waitingOnWren: boolean;
  wounded: boolean;
  trust: number;
  wrenInventory: Item[];
  playerInventory: Item[];
  wrenChoices: Choice[];
  exitCount: number;
}

/**
 * Desired capabilities are a pure function of Chapter state. Wren syncs the
 * registry to this list; nothing else decides what she can do.
 *
 * ChatGPT snapshots the first registerTool list. Adding a tool later leaves
 * Codex with a name it cannot call. After Begin, the body is registered once;
 * only run and follow_my_lead come off as the story happens to Wren.
 */
export function capabilitiesFor(s: BodyState): CapabilityName[] {
  if (!s.begun) return ["begin", "ready", "get_scene_state", "recall", "say"];
  if (s.phase === "ended") return ["get_scene_state", "recall", "say"];

  const caps: CapabilityName[] = [
    "get_scene_state",
    "recall",
    "listen",
    "look",
    "say",
    "ask_player",
    "hide",
    "ready",
    "open",
    "give",
    "take",
    "decide",
  ];

  if (!s.wounded) caps.push("run");
  if (s.trust >= TRUST_THRESHOLD) caps.push("follow_my_lead");

  return caps;
}
