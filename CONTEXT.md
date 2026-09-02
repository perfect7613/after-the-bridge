# After the Bridge — domain

A one-chapter survival story. The player travels with Wren. The page owns the Chapter, the World, and Wren's body. Codex plays Wren by calling tools. Vocabulary below is the only vocabulary for issues, modules, and code.

## Terms

**Player**
The human at the page. Clicks choice cards, answers elicitations, pastes the opening prompt into Codex.

**Codex**
The in-browser agent. Discovers and calls Wren's tools. Not a character name.

**Wren**
The companion. Codex wearing the body the page gives her. She has no existence apart from registered tools plus the Chapter's ledger.

**Chapter**
The authored situation and the running story state: scene, beat, inventory, wounded, armed, trust, exits, pending question. Callers send an input; they get a snapshot. They never mutate fields.

**Ledger**
Wren's inspectable memory: what happened, when, and how she recorded feeling. A part of the Chapter, not a separate store.

**Trust**
A Chapter value. Below threshold, `follow_my_lead` is not a capability and `decide` may refuse.

**Beat**
A unit of story time. `look` costs one. Silence can cost one. The World is steered on a beat.

**Scene**
One authored situation with two exits. Three exist: Underpass, Pharmacy, Bridge. Each Scene maps to one persistent Happy Oyster world and one Travel.

**Travel**
One live Directing stream, capped at 3:00 by the platform. The on-screen clock is the Travel's remaining time. When it ends, the light goes.

**Capability**
A WebMCP tool currently registered. The set of capabilities *is* Wren's body. Presence is the state; descriptions do not narrate.

**World**
What the Player sees: the live generated picture, mood, and clock. Wren cannot see it. `look` returns Chapter text, not pixels.

**Refusal**
A `decide` outcome from the Chapter (`refused` + a Ledger citation). Not a tool Wren calls.

**Elicitation**
A pending question the Chapter opens. Chrome shows the countdown. Wren's `ask_player` waits on it. Timeout is the answer `"silence"`.

## Modules

These are the only first-party modules. Next.js `app/` is composition and framework wiring, not a domain module.

| Module | Owns | Does not own |
|---|---|---|
| **Chapter** | Story state, Ledger, Trust, beats, scene exits, pending elicitation, desired capabilities | DOM, WebMCP, Reactor |
| **Wren** | Registering and tearing down capabilities to match the Chapter snapshot; execute handlers | Story rules, pixels |
| **World** | `enterScene`, `steer`, `setMood`, clock; placeholder adapter and Happy Oyster adapter | Story rules, tools |
| **Chrome** | Choice cards, dialogue, ledger panel, toast, copy-prompt, countdown UI | Story rules, tokens, SDK |

**Token minting is not a module.** It is implementation inside the Happy Oyster adapter. The World interface never mentions JWTs.

## Invariants

- Player clicks and Codex tool calls enter the Chapter through the same input seam.
- Desired capabilities are a function of the Chapter snapshot. Wren syncs; it does not decide.
- The World is steered from Chapter beats. The Chapter does not import Reactor.
- Site tool descriptions describe function. Wren's persona lives in the Player's opening prompt.
- No iframes. No clips. No `NEXT_PUBLIC_` secrets.
