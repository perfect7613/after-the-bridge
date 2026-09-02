# Wren

Deep module. The body.

Given a Chapter snapshot, Wren syncs capabilities: register what is desired, abort what is not, leave unchanged controllers alone.

Execute handlers call the Chapter and return `{ narration, state, refused?, reason? }`. Perception tools are read-only. Descriptions describe function only.

Feature-detect `document.modelContext.registerTool`. Without it, Wren is a no-op and Chrome still plays.

Tests use a mock modelContext adapter. The mock is an internal stand-in, not a second product adapter.
