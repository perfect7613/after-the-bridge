import { SCENES, type SceneId } from "@/src/chapter";

/**
 * Setting restated on every Orbis prompt so a morph reads as the same take.
 * Following prompts add only the visible change (Reactor prompt-guide + skill).
 */
const SETTING: Record<SceneId, string> = {
  underpass:
    "Two survivors stand with their backs to the camera under a failing orange sodium lamp inside a dark concrete highway underpass at night. Heavy rain falls past the sharp edge of the light onto wet asphalt. Painterly style. Medium shot, eye-level, slow handheld camera, a single unbroken take.",
  pharmacy:
    "Two survivors stand at a looted pharmacy counter at dawn, seen from behind. Thin grey smoke drifts through broken front windows. A locked steel medicine cabinet stands behind the counter. Cold blue morning light. Painterly style. Medium shot, eye-level, slow handheld camera, a single unbroken take.",
  bridge:
    "Two survivors stand at the near end of a sagging steel truss bridge over a wide grey river at dusk, seen from behind. Wind pulls at their clothes. Deep orange and violet sky, smoke on the far horizon. Painterly style. Medium wide shot, eye-level, slow handheld camera, a single unbroken take.",
};

/** First prompt of a scene: the whole world, then the opening hold. */
export function orbisInitialPrompt(scene: SceneId): string {
  return `${SETTING[scene]} ${SCENES[scene].openingSteer}`;
}

/** Mid-run morph: same setting, one visible action from the Chapter steer. */
export function orbisFollowPrompt(scene: SceneId, instruction: string): string {
  const change = (instruction || SCENES[scene].openingSteer).trim();
  return `${SETTING[scene]} ${change}`;
}
