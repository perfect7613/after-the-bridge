export { silentVoice } from "./silent";
export { sarvamVoice } from "./sarvam";
export type { Voice, VoiceStatus } from "./types";

/** Whether the Sarvam route is configured on this deployment. */
export async function voiceConfigured(): Promise<boolean> {
  try {
    const res = await fetch("/api/voice/speak", { method: "GET", cache: "no-store" });
    if (!res.ok) return false;
    const { configured } = (await res.json()) as { configured: boolean };
    return configured;
  } catch {
    return false;
  }
}
