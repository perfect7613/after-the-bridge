# ADR 0002 — Voice is a real seam (silent + Sarvam)

- Status: accepted
- Date: 2026-09-02

## Context

Dialogue should be heard, not only read. [Indus Creator Studio dubbing](https://indus.sarvam.ai/creator-studio/dubbing) is Sarvam's batch pipeline: upload a finished video, transcribe, synthesise, mux. A live Happy Oyster Travel is a WebRTC stream, not a file, so that pipeline cannot speak a line as Wren says it.

The same voice stack Creator Studio uses — **Bulbul v3** — is available as a TTS API: REST (`POST https://api.sarvam.ai/text-to-speech`, max 2500 characters), HTTP stream, or WebSocket. Official JS client: `sarvamai` (`SarvamAIClient.textToSpeech.convert`). Auth header `api-subscription-key`. Key stays on the server.

## Decision

**Voice** is its own module with a real seam (two adapters):

1. **Silent** — no audio. Development and tests.
2. **Sarvam** — Bulbul v3 TTS. Production live dialogue.

Interface: `speak({ speaker, text, tone })`. Speakers are Chapter characters (`wren`, `stranger`), each bound to one Bulbul voice. Chrome plays the returned audio. Chapter and Wren never import `sarvamai`.

The Next.js route `app/api/voice/speak/route.ts` is framework wiring for the Sarvam adapter, same pattern as the Happy Oyster token route. `SARVAM_API_KEY` is never `NEXT_PUBLIC_`. Live play uses REST (or HTTP stream if first-byte latency is too high). Not WebSocket — we are not building a barge-in voice agent.

**Creator Studio / dubbing jobs are not the live path.** They may be used once, offline, to localise the recorded demo video for YouTube. That is shipping work, not game runtime. Do not record Travels in order to dub them.

## Consequences

- Deleting Voice would leak Sarvam types into Chrome and into Wren's `say` handler.
- A dropped TTS call must not block the Chapter: text still appears; audio is best-effort.
- Do not add a third "clip dubbing" adapter into World. That would resurrect footage.
