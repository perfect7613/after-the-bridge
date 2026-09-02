# ADR 0002 — Voice is a real seam (silent + Sarvam)

- Status: accepted
- Date: 2026-09-02

## Context

Dialogue should be heard, and the Player may speak a line instead of clicking. Sarvam's model APIs cover that: **Bulbul v3 TTS** (`POST https://api.sarvam.ai/text-to-speech`, `sarvamai` `textToSpeech.convert`) and **Saaras v3 STT** (`POST https://api.sarvam.ai/speech-to-text`, `speechToText.transcribe`). Auth header `api-subscription-key`. Key stays on the server.

We are not localising video. No dubbing jobs, no Creator Studio, no muxing speech onto the Travel.

## Decision

**Voice** is its own module with a real seam (two adapters):

1. **Silent** — no audio in or out. Development and tests.
2. **Sarvam** — Bulbul for `speak`, Saaras for `hear` when we actually need spoken player input.

Interface:

- `speak({ speaker, text, tone })` — required. Characters `wren` and `stranger`. Chrome plays the bytes. Best-effort: failure never blocks the Chapter.
- `hear(audio)` — optional. Returns transcript text. Chrome may send that text as a Chapter input (same seam as a card click). Cards and Codex remain the default; STT is not required to finish the chapter.

Next.js routes `app/api/voice/speak/route.ts` and `app/api/voice/hear/route.ts` are framework wiring for the Sarvam adapter. `SARVAM_API_KEY` is never `NEXT_PUBLIC_`. TTS uses REST (HTTP stream only if first-byte is too slow). STT uses REST transcribe on a short clip (`en-IN`, `saaras:v3`). Not a realtime voice-agent WebSocket.

Ship TTS with Scene 1. Ship STT only if speaking a choice is clearly better than cards in playtests. Do not block #7 on `hear`.

## Consequences

- Deleting Voice would leak `sarvamai` into Chrome and Wren's `say` handler.
- Chapter never sees audio bytes — only text inputs and narration.
- No third adapter for video dubbing. Out of scope, not deferred.
