import { NextResponse } from "next/server";
import type { SceneId } from "@/src/chapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRECTING_MODEL = "reactor/happy-oyster-director";
const TOKEN_URL = "https://api.reactor.inc/tokens";

function worldIds(): Partial<Record<SceneId, string>> {
  const raw = process.env.REACTOR_WORLD_IDS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed;
  } catch {
    return {};
  }
}

/** Public configuration: whether the live World is available and which persistent worlds exist. */
export async function GET() {
  return NextResponse.json(
    { configured: Boolean(process.env.REACTOR_API_KEY), worlds: worldIds() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Mint a session-scoped Reactor JWT. The API key never leaves this handler. */
export async function POST() {
  const key = process.env.REACTOR_API_KEY;
  if (!key) return NextResponse.json({ error: "Live world not configured." }, { status: 503 });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    cache: "no-store",
    headers: { "Reactor-API-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      authorization_details: [
        {
          type: "session",
          resources: { models: { match: [DIRECTING_MODEL] } },
          constraints: { max_sessions: 1 },
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json({ error: `Token mint failed (${res.status}).`, detail: detail.slice(0, 300) }, { status: 502 });
  }
  const { jwt } = (await res.json()) as { jwt: string };
  return NextResponse.json({ jwt }, { headers: { "Cache-Control": "no-store" } });
}
