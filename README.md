# After the Bridge

A one-chapter survival story you play with an AI companion who has a body, a memory, and the right to say no.

Submission for [The WebMCP Challenge](https://webmcp.devpost.com/). The world is generated live by Reactor Happy Oyster. Wren is Codex in the ChatGPT desktop in-app browser. The tools this page registers *are* her body.

## Layout

```
app/                  Next.js composition (page, token route, voice route)
src/chapter/          story state — the Chapter module
src/wren/             capability registration — the Wren module
src/world/            live picture — placeholder + Happy Oyster adapters
src/voice/            dialogue — TTS required, STT optional; silent + Sarvam adapters
src/chrome/           player-facing UI
docs/adr/             accepted architecture decisions
CONTEXT.md            domain language
```

See [CONTEXT.md](CONTEXT.md) and [docs/RUBRIC.md](docs/RUBRIC.md). Product requirements: [issue #1](https://github.com/perfect7613/after-the-bridge/issues/1).

## License

MIT
