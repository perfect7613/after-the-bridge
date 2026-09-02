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
  const fromServer = serverWorlds[scene];
  if (fromServer) return { id: fromServer, created: false };

  const local = readLocal();
  if (local[scene]) return { id: local[scene]!, created: false };

  const id = await create(SCENES[scene].worldPrompt);
  writeLocal({ ...readLocal(), [scene]: id });
  console.info(`[world] created ${scene}: ${id}\nPin it: REACTOR_WORLD_IDS=${JSON.stringify({ ...readLocal(), [scene]: id })}`);
  return { id, created: true };
}
