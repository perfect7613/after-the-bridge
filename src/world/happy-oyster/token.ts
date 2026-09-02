import type { SceneId } from "@/src/chapter";

const TOKEN_ROUTE = "/api/reactor/token";
/** Reactor JWTs live 6 hours; refresh well before that. */
const REFRESH_AFTER_MS = 5 * 60 * 60 * 1000;

let cached: { jwt: string; mintedAt: number } | null = null;

/** JwtSource resolver for the SDK: mints through the route and caches until near expiry. */
export async function getJwt(): Promise<string> {
  if (cached && Date.now() - cached.mintedAt < REFRESH_AFTER_MS) return cached.jwt;
  const res = await fetch(TOKEN_ROUTE, { method: "POST", cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Token route failed (${res.status}).`);
  }
  const { jwt } = (await res.json()) as { jwt: string };
  cached = { jwt, mintedAt: Date.now() };
  return jwt;
}

export interface WorldConfig {
  configured: boolean;
  worlds: Partial<Record<SceneId, string>>;
}

export async function getWorldConfig(): Promise<WorldConfig> {
  try {
    const res = await fetch(TOKEN_ROUTE, { method: "GET", cache: "no-store" });
    if (!res.ok) return { configured: false, worlds: {} };
    return (await res.json()) as WorldConfig;
  } catch {
    return { configured: false, worlds: {} };
  }
}
