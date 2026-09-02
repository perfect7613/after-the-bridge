# Judging contract

The [WebMCP Challenge](https://webmcp.devpost.com/rules) scores four criteria equally. This file is what we must **demonstrate**, not what we must claim. Spec language is from the [WebMCP explainer](https://github.com/webmachinelearning/webmcp). Tool strategy is from [Chrome's WebMCP best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices). Site tools behaviour is from [OpenAI](https://learn.chatgpt.com/docs/webmcp).

A slice that does not leave evidence on this list is not done.

## 1. WebMCP Leverage

> How thoroughly and skillfully does the project use WebMCP? Does the code reflect genuine effort and a working, non-trivial implementation?

The explainer's goal is **human-in-the-loop**: users and agents share one page, with **visibility, history, and control**. Non-goals: not headless, not fully autonomous, not a replacement for the human UI. Backend MCP is the thing WebMCP exists to avoid — it bypasses the page.

Chrome says static registration is the default. We register and tear down **on purpose**. That is the product: capability *is* narrative state. If the tool list is static for the whole chapter, leverage fails.

Judges must be able to see, in Codex's Site tools popover and on the page:

| Spec / docs | What we ship | Evidence |
|---|---|---|
| Visibility | Desired capabilities change with the Chapter. Site tools popover updates (`run` gone when wounded, `open` gone without the crowbar). | Scene 2, popover screenshot in the video |
| History | Ledger lists every tool call, `toolchange`, Refusal, and recorded feeling. | Ledger panel open in the video |
| Control | Cards and tools call the same Chapter input. Human UI stays primary (explainer non-goal). | Play Scene 1 with cards only, then with Codex |
| Code reuse | `execute` calls Chapter functions; no second story path for the agent | `src/wren` has no duplicated rules |
| Dynamic registration | `AbortController` per capability; abort unregisters; unchanged controllers kept | Tests in #4; popover in #2 |
| Blocking execute | `ask_player` waits; `signal` cancels; silence is an answer | Timer in the video |
| Page owns what the agent cannot see | Travel is a `<video>` Wren cannot read. `look` costs a beat and returns text. | Look in Scene 1 |
| `execute` as trust | `decide` may return `refused` + a Ledger citation. Not a `refuse` tool. | Bridge in Scene 3 |
| Chrome tool strategy | One function per tool, no overlap, verbs that say what happens, positive descriptions, limitations implicit, validate in code, `readOnlyHint` on perception | Tool list in README |
| Site tools constraints | Top-level `document.modelContext` only. No iframes. No declarative API. Site text is untrusted — persona is the Player's prompt. | #2 |

**Fails leverage:** a wallpaper Travel with 13 always-on tools; a backend MCP server; overlapping tools (`refuse` + `decide`); descriptions that try to jailbreak Codex.

## 2. Execution

> Does the project deliver a working or runnable project that has a complete, coherent product experience — not just a technical proof of concept?

Judges may not build from source. They open a live URL.

Must ship:

- One chapter that **ends** (Together or Alone), not a sandbox
- Game chrome: World, cards, countdown, dialogue, ledger, Voice on Wren's lines
- Playable without Codex (cards)
- Playable with Codex (Site tools)
- Live Vercel URL, README testing steps, public repo, MIT, video < 3:00 with audio
- If Happy Oyster drops, Chapter and Wren still run (last frame held)

**Fails execution:** a harness that registers tools on an empty page; a chapter with no ending screen; a demo that only works on localhost.

## 3. Potential Impact

> Does the project make a credible, specific case for solving a real problem for a real audience — and does the solution actually address that problem based on what's demonstrated?

**Audience:** writers and designers of choice-driven games (Telltale-shaped work), not "people who like AI."

**Problem:** every authored branch multiplies writing, art, VO, and QA. Improvising the companion in a prompt gives no body and no inspectable memory.

**Solution, demonstrated not described:** the writer authors a *situation* (scene, exits, capabilities). The branch is computed by the Chapter (wounded → `run` unregistered; low trust → Refusal). The video must show the popover change and the Refusal citing the Ledger. If we only *talk* about authoring cost, impact fails.

**Fails impact:** "AI companions are the future." "Agents can play games." No named audience, no before/after.

## 4. Creativity & Ambition

> How creative and novel is the concept and does the project differ from existing concepts?

Showcase comps are editors and storefronts (Margin, Modeling Studio, pizza maker, travel booking). Those expose *tasks*. We expose a *companion with standing*.

Novel if and only if:

- The agent can be refused by the **page**, with evidence
- The tool list *is* the body, visible in Site tools
- The World is live and the agent is blind to it

Reactor and Sarvam are ambition in production values. They are not the WebMCP idea. If the Travel or TTS dies, the four leverage proofs must still be visible on the placeholder World.

**Fails creativity:** a storefront; a chatbot next to generated video; a tool list that never changes.
