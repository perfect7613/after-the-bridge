# Wren

Deep module. The body. This is where WebMCP leverage is earned.

Given a Chapter snapshot, Wren syncs capabilities: register what is desired, abort what is not, leave unchanged controllers alone. Chrome's default is static registration; we are dynamic because presence *is* the story.

Execute handlers call the Chapter (code reuse — explainer goal) and return `{ narration, state, refused?, reason? }`. After execute, Chrome has already updated from the snapshot — do not make Codex guess from stale UI.

Perception: `readOnlyHint: true`. Descriptions: what it does and when to use it; no "don't"s; no persona. One function per tool; no `refuse` tool.

`ask_player` waits on the Chapter's pending elicitation. Honour `signal`.

Feature-detect `document.modelContext.registerTool`. Without it, Wren is a no-op and Chrome still plays (human UI remains primary).

