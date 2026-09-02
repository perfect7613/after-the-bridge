# Chapter

Deep module. The running story.

Callers send an input (player choice or tool call). They receive a snapshot: narration, ledger, trust, desired capabilities, world steer, pending elicitation, refused.

No DOM. No WebMCP. No Reactor.

Tests talk only to this interface. If a test has to know about scenes' internal tables, it is testing past the interface.
