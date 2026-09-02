# World

Deep module. What the Player sees and Wren cannot.

Interface: enter a scene, steer on a beat, set mood, observe the clock, hold last frame on drop.

Two adapters (see ADR 0001):

- `placeholder/` — no network
- `happy-oyster/` — Directing Travel. Token route and JWT resolver live here, not as a sibling module.

The Next.js file `app/api/reactor/token/route.ts` is framework wiring for the Happy Oyster adapter. Treat it as part of this module.
