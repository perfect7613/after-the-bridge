import { SCENES, type SceneId } from "@/src/chapter";

const STORAGE_KEY = "after-the-bridge.worlds";

type WorldMap = Partial<Record<SceneId, string>>;

function readLocal(): WorldMap {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as WorldMap;
  } catch {
    return {};
  }
}

function writeLocal(map: WorldMap) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function peekWorldId(scene: SceneId, serverWorlds: WorldMap): string | undefined {
  return serverWorlds[scene] ?? readLocal()[scene];
}

export function rememberWorld(scene: SceneId, id: string) {
  writeLocal({ ...readLocal(), [scene]: id });
  console.info(`[world] created ${scene}: ${id}\nPin it: REACTOR_WORLD_IDS=${JSON.stringify({ ...readLocal() })}`);
}

/**
 * Each Scene maps to one persistent Directing world. Ids come from the server
 * config first, then this browser's storage, and are created on demand as a
 * last resort. Created ids are logged so they can be pinned in REACTOR_WORLD_IDS.
 */
export async function resolveWorld(
  scene: SceneId,
  serverWorlds: WorldMap,
  create: (prompt: string) => Promise<string>,
): Promise<{ id: string; created: boolean }> {
  const existing = peekWorldId(scene, serverWorlds);
  if (existing) return { id: existing, created: false };

  const id = await create(SCENES[scene].worldPrompt);
  rememberWorld(scene, id);
  return { id, created: true };
}
