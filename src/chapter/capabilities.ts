import { SCENES, TRUST_THRESHOLD } from "./scenes";
import type { CapabilityName, Choice, Item, SceneId } from "./types";

export interface BodyState {
  scene: SceneId;
  phase: "situation" | "resolved" | "ended";
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
 */
export function capabilitiesFor(s: BodyState): CapabilityName[] {
  if (s.phase === "ended") return ["get_scene_state", "recall", "say"];

  const caps: CapabilityName[] = ["get_scene_state", "recall", "listen", "look", "say", "ask_player"];

  if (s.phase === "situation" && s.wrenChoices.length > 0) caps.push("decide");
  if (s.phase === "resolved" && s.exitCount > 0) caps.push("move_to");

  caps.push("hide");
  if (!s.wounded) caps.push("run");
  if (s.wrenInventory.includes("crowbar") && SCENES[s.scene].openables.length > 0) caps.push("open");
  if (s.wrenInventory.length > 0) caps.push("give");
  if (s.playerInventory.length > 0) caps.push("take");
  if (s.trust >= TRUST_THRESHOLD) caps.push("follow_my_lead");

  return caps;
}
