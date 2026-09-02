# Voice

Deep module. Spoken dialogue.

- `speak({ speaker, text, tone })` — Player hears Wren or the stranger. Required. Best-effort.
- `hear(audio)` — optional transcript of the Player. Same Chapter input seam as a card. Not required to finish the chapter.

Two adapters (ADR 0002):

- `silent/` — no network
- `sarvam/` — Bulbul v3 TTS, Saaras v3 STT. Routes under `app/api/voice/`. Key never leaves the server.

No dubbing.
