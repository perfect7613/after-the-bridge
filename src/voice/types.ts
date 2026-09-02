import type { Speaker, Tone } from "@/src/chapter";

export type VoiceStatus = "silent" | "ready" | "speaking" | "failed";

export interface Voice {
  /** Speak a line as a character. Resolves when playback ends or fails; never throws. */
  speak(speaker: Speaker, text: string, tone?: Tone): Promise<void>;
  /** Stop whatever is playing and drop the queue. */
  stop(): void;
  onStatus(fn: (status: VoiceStatus) => void): () => void;
  readonly enabled: boolean;
}
