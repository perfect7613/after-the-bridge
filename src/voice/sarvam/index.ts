import type { Speaker, Tone } from "@/src/chapter";
import type { Voice, VoiceStatus } from "../types";

const SPEAK_ROUTE = "/api/voice/speak";

interface Line {
  speaker: Speaker;
  text: string;
  tone?: Tone;
  resolve: () => void;
}

/**
 * Wren's voice through Sarvam Bulbul, one line at a time. The browser only
 * talks to our route; the key stays on the server. Any failure resolves the
 * line silently so speech never blocks the Chapter.
 */
export function sarvamVoice(): Voice {
  const queue: Line[] = [];
  const listeners = new Set<(s: VoiceStatus) => void>();
  let current: HTMLAudioElement | null = null;
  let playing = false;
  let status: VoiceStatus = "ready";

  const setStatus = (s: VoiceStatus) => {
    status = s;
    for (const l of listeners) l(s);
  };

  async function pump() {
    if (playing) return;
    const line = queue.shift();
    if (!line) {
      if (status === "speaking") setStatus("ready");
      return;
    }
    playing = true;
    setStatus("speaking");
    try {
      const res = await fetch(SPEAK_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: line.text, speaker: line.speaker, tone: line.tone }),
      });
      if (!res.ok) throw new Error(`speak ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      await new Promise<void>((done) => {
        const audio = new Audio(url);
        current = audio;
        const finish = () => {
          URL.revokeObjectURL(url);
          if (current === audio) current = null;
          done();
        };
        audio.onended = finish;
        audio.onerror = finish;
        audio.play().catch(finish);
      });
    } catch {
      setStatus("failed");
    } finally {
      playing = false;
      line.resolve();
      void pump();
    }
  }

  return {
    enabled: true,
    speak(speaker, text, tone) {
      const clean = text.trim();
      if (!clean) return Promise.resolve();
      return new Promise<void>((resolve) => {
        queue.push({ speaker, text: clean, tone, resolve });
        void pump();
      });
    },
    stop() {
      for (const l of queue.splice(0)) l.resolve();
      if (current) {
        current.pause();
        current.src = "";
        current = null;
      }
      setStatus("ready");
    },
    onStatus(fn) {
      listeners.add(fn);
      fn(status);
      return () => listeners.delete(fn);
    },
  };
}
