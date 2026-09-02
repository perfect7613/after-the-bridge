import { NextResponse } from "next/server";
import { SarvamAIClient } from "sarvamai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Speaker = "wren" | "stranger" | "narrator";
type Tone = "calm" | "urgent" | "bitter" | "warm";

/** One Bulbul voice per Speaker. Wren is the one the player hears most. */
const VOICES: Record<Speaker, { speaker: "ritu" | "rahul" | "kabir"; pace: number }> = {
  wren: { speaker: "ritu", pace: 1.0 },
  stranger: { speaker: "rahul", pace: 0.9 },
  narrator: { speaker: "kabir", pace: 0.95 },
};

const TONE_PACE: Record<Tone, number> = { calm: 0.95, urgent: 1.12, bitter: 0.9, warm: 0.98 };
const MAX_CHARS = 600;

export async function GET() {
  return NextResponse.json({ configured: Boolean(process.env.SARVAM_API_KEY) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const key = process.env.SARVAM_API_KEY;
  if (!key) return NextResponse.json({ error: "Voice not configured." }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { text?: unknown; speaker?: unknown; tone?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_CHARS) : "";
  if (!text) return NextResponse.json({ error: "Nothing to say." }, { status: 400 });

  const speaker: Speaker = body?.speaker === "stranger" || body?.speaker === "narrator" ? body.speaker : "wren";
  const tone = body?.tone as Tone | undefined;
  const voice = VOICES[speaker];
  const pace = Math.min(2, Math.max(0.5, voice.pace * (tone && TONE_PACE[tone] ? TONE_PACE[tone] : 1)));

  try {
    const client = new SarvamAIClient({ apiSubscriptionKey: key });
    const result = await client.textToSpeech.convert({
      text,
      language_code: "en-IN",
      model: "bulbul:v3",
      speaker: voice.speaker,
      pace,
      temperature: tone === "urgent" || tone === "bitter" ? 0.8 : 0.6,
      speech_sample_rate: 24000,
      output_audio_codec: "mp3",
    });
    const b64 = result.audios?.[0];
    if (!b64) throw new Error("No audio returned.");
    return new NextResponse(Buffer.from(b64, "base64"), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Speech failed.", detail: message.slice(0, 300) }, { status: 502 });
  }
}
