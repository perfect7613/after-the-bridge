# ADR 0001 — World is a real seam (two adapters)

- Status: accepted
- Date: 2026-09-02

## Context

The Chapter must keep playing when Happy Oyster is unavailable (local work, stream drop, credits). Judges must see a live Directing Travel. Those are two behaviours, not one with a flag sprinkled through the Chapter.

## Decision

The World module is a real seam. Two adapters satisfy it:

1. **Placeholder** — gradient and scene text. Development and tests.
2. **Happy Oyster** — Directing Travel, `attachWorld` / `startTravel` / `instruct`. Production.

JWT minting, the Next.js route handler, the resolver cache, and `@reactor-models/happy-oyster` live inside the Happy Oyster adapter's implementation. They are not part of the World interface and not their own module.

## Consequences

- Chapter and Chrome never mention Reactor types.
- Deleting World would force Happy Oyster types into Chapter, Chrome, and tests.
- A third adapter (e.g. a recorded transport) is out of scope; do not add a clip adapter.
