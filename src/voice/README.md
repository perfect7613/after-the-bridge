# Voice

Deep module. What the Player hears.

Interface: `speak({ speaker, text, tone })`. Speakers are Chapter characters. Audio is best-effort: a failed speak never blocks the Chapter.

Two adapters (ADR 0002):

- `silent/` — no network, no sound
- `sarvam/` — Bulbul v3 TTS. The route `app/api/voice/speak/route.ts` is framework wiring for this adapter. The key never leaves the server.

Creator Studio dubbing is not an adapter here. It is an offline tool for the demo video only.
