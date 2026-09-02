import type { CapabilityName, Chapter, ChapterResult, Snapshot, Tone } from "@/src/chapter";
import type { ToolSpec } from "./registry";

const TONES: Tone[] = ["calm", "urgent", "bitter", "warm"];
const MAX_ASK_SECONDS = 20;

/** Shared return shape for every tool. */
export interface ToolResult {
  ok: boolean;
  narration: string;
  refused?: boolean;
  reason?: string;
  citation?: { text: string; feeling?: string; scene: string };
  error?: string;
  state: {
    scene: string;
    phase: Snapshot["phase"];
    beatsLeft: number;
    trust: number;
    wounded: boolean;
    capabilities: CapabilityName[];
    waitingOnPlayer: string | null;
    ending: Snapshot["ending"];
  };
}

export function toResult(r: ChapterResult): ToolResult {
  const s = r.snapshot;
  return {
    ok: r.ok,
    narration: r.narration,
    refused: r.refused,
    reason: r.reason,
    citation: r.citation ? { text: r.citation.text, feeling: r.citation.feeling, scene: r.citation.scene } : undefined,
    error: r.error,
    state: {
      scene: s.sceneTitle,
      phase: s.phase,
      beatsLeft: s.beatsLeft,
      trust: s.trust,
      wounded: s.wren.wounded,
      capabilities: s.capabilities,
      waitingOnPlayer: s.pending?.question ?? null,
      ending: s.ending,
    },
  };
}

export interface ToolHooks {
  /** Called when a tool starts and finishes, for Wren's activity feed. */
  onCall?: (name: string, input: Record<string, unknown>, result: ToolResult) => void;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : v == null ? fallback : String(v);
}

/**
 * Build the tool specs for the capabilities in a snapshot. Every execute
 * handler is one Chapter input; no story rule lives here.
 */
export function toolsFor(chapter: Chapter, snap: Snapshot, hooks: ToolHooks = {}): ToolSpec[] {
  const run = (name: string, input: Record<string, unknown>, r: ChapterResult): ToolResult => {
    const result = toResult(r);
    hooks.onCall?.(name, input, result);
    return result;
  };

  const wrenChoices = snap.choices.filter((c) => !c.playerOnly);
  const all: Record<CapabilityName, ToolSpec> = {
    get_scene_state: {
      name: "get_scene_state",
      title: "Scene state",
      description:
        "Get where Wren and the player are, who is present, what just happened, Wren's condition and inventory, trust, the decisions Wren can make, and the exits. Call this first, and again after anything changes.",
      annotations: { readOnlyHint: true },
      execute: (input) => run("get_scene_state", input, chapter.input({ kind: "scene_state", actor: "wren" })),
    },
    recall: {
      name: "recall",
      title: "Recall",
      description:
        "Read Wren's ledger: everything the player and Wren did in this chapter, in order, with how Wren recorded feeling about each moment and the trust change it caused. Use it before a decision that depends on what the player has done.",
      annotations: { readOnlyHint: true },
      execute: (input) => run("recall", input, chapter.input({ kind: "recall", actor: "wren" })),
    },
    listen: {
      name: "listen",
      title: "Listen",
      description: "Hear the current sound in the scene. Costs no story time, so it is the cheap way to learn something.",
      annotations: { readOnlyHint: true },
      execute: (input) => run("listen", input, chapter.input({ kind: "listen", actor: "wren" })),
    },
    look: {
      name: "look",
      title: "Look",
      description:
        "Wren looks in a direction and returns what she sees as text. This is her only sight: the live picture on the page is not visible to her. Looking costs one beat of story time, and when beats run out the moment passes. In the Underpass, looking toward the voice means leaving the light.",
      inputSchema: {
        type: "object",
        properties: {
          direction: {
            type: "string",
            description: "Where to look, in plain words: 'toward the voice', 'up', 'behind us', 'the back room', 'across the span'.",
          },
        },
        required: ["direction"],
      },
      execute: (input) =>
        run("look", input, chapter.input({ kind: "look", actor: "wren", direction: str(input.direction, "around") })),
    },
    decide: {
      name: "decide",
      title: "Decide",
      description:
        "Commit Wren to one of the scene's decisions. Irreversible and written to the ledger. The result may come back refused with a reason and a ledger citation when the ledger does not support it.",
      inputSchema: {
        type: "object",
        properties: {
          choice: {
            type: "string",
            enum: wrenChoices.map((c) => c.id),
            description: wrenChoices.map((c) => `${c.id}: ${c.hint}`).join(" | "),
          },
        },
        required: ["choice"],
      },
      execute: (input) => run("decide", input, chapter.input({ kind: "decide", actor: "wren", choice: str(input.choice) })),
    },
    move_to: {
      name: "move_to",
      title: "Move to",
      description: "Leave this scene by one of its exits and begin the next scene together.",
      inputSchema: {
        type: "object",
        properties: {
          place: {
            type: "string",
            enum: snap.exits.map((e) => e.id),
            description: snap.exits.map((e) => `${e.id}: ${e.label}`).join(" | "),
          },
        },
        required: ["place"],
      },
      execute: (input) => run("move_to", input, chapter.input({ kind: "move_to", actor: "wren", place: str(input.place) })),
    },
    take: {
      name: "take",
      title: "Take",
      description: "Wren takes an item the player is carrying.",
      inputSchema: {
        type: "object",
        properties: { item: { type: "string", enum: snap.player.inventory } },
        required: ["item"],
      },
      execute: (input) => run("take", input, chapter.input({ kind: "take", actor: "wren", item: str(input.item) })),
    },
    give: {
      name: "give",
      title: "Give",
      description: "Wren hands an item she is carrying to the player. Handing over the crowbar means she can no longer open anything.",
      inputSchema: {
        type: "object",
        properties: { item: { type: "string", enum: snap.wren.inventory } },
        required: ["item"],
      },
      execute: (input) => run("give", input, chapter.input({ kind: "give", actor: "wren", item: str(input.item) })),
    },
    open: {
      name: "open",
      title: "Open",
      description: "Wren uses the crowbar to force a locked target in the scene. Loud. Whatever is nearby will hear.",
      inputSchema: {
        type: "object",
        properties: { target: { type: "string", description: "What to force open, e.g. 'the cabinet'." } },
        required: ["target"],
      },
      execute: (input) =>
        run("open", input, chapter.input({ kind: "open", actor: "wren", target: str(input.target, "cabinet") })),
    },
    run: {
      name: "run",
      title: "Run",
      description: "Wren runs from the current danger and takes the player with her. Ends the current moment without finding out what was there.",
      execute: (input) => run("run", input, chapter.input({ kind: "run", actor: "wren" })),
    },
    hide: {
      name: "hide",
      title: "Hide",
      description: "Wren pulls the player into cover and waits. Always possible. The last resort.",
      execute: (input) => run("hide", input, chapter.input({ kind: "hide", actor: "wren" })),
    },
    say: {
      name: "say",
      title: "Say",
      description: "Wren speaks aloud to the player. The line appears as dialogue on the page and is voiced. Keep it short; she is not a narrator.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "What Wren says, one or two sentences." },
          tone: { type: "string", enum: TONES, description: "How she says it." },
        },
        required: ["text"],
      },
      execute: (input) =>
        run(
          "say",
          input,
          chapter.input({
            kind: "say",
            actor: "wren",
            text: str(input.text),
            tone: TONES.includes(input.tone as Tone) ? (input.tone as Tone) : undefined,
          }),
        ),
    },
    ask_player: {
      name: "ask_player",
      title: "Ask the player",
      description: `Ask the player a question with up to four short options and wait for the answer. This call blocks until the player clicks an option or the seconds run out (5 to ${MAX_ASK_SECONDS}). A returned answer of "silence" means the player did not answer in time; Wren records that and it costs trust.`,
      inputSchema: {
        type: "object",
        properties: {
          question: { type: "string", description: "The question, in Wren's voice." },
          options: { type: "array", items: { type: "string" }, description: "Two to four short answers the player can click." },
          seconds: { type: "integer", minimum: 5, maximum: MAX_ASK_SECONDS, description: "How long the player has." },
        },
        required: ["question", "options"],
      },
      execute: async (input, { signal }) => {
        const options = Array.isArray(input.options) ? input.options.map((o) => str(o)).filter(Boolean) : [];
        const seconds = typeof input.seconds === "number" ? input.seconds : 15;
        const opened = chapter.input({ kind: "ask", actor: "wren", question: str(input.question), options, seconds });
        if (!opened.ok || !opened.snapshot.pending) return run("ask_player", input, opened);

        const pending = opened.snapshot.pending;
        const timer = setTimeout(() => {
          if (chapter.snapshot().pending?.id === pending.id) {
            chapter.input({ kind: "answer", actor: "player", answer: "silence" });
          }
        }, pending.expiresAt - pending.openedAt);

        try {
          const answer = await chapter.waitForAnswer(pending.id, signal);
          const result = toResult({ ok: true, narration: `The player answered: ${answer}`, snapshot: chapter.snapshot() });
          const withAnswer = { ...result, answer };
          hooks.onCall?.("ask_player", input, withAnswer);
          return withAnswer;
        } catch {
          const result = toResult({ ok: false, error: "The question was withdrawn.", narration: "", snapshot: chapter.snapshot() });
          hooks.onCall?.("ask_player", input, result);
          return result;
        } finally {
          clearTimeout(timer);
        }
      },
    },
    follow_my_lead: {
      name: "follow_my_lead",
      title: "Follow my lead",
      description: "Wren commits to follow whatever the player decides next, without being asked again. Available while trust holds.",
      execute: (input) => run("follow_my_lead", input, chapter.input({ kind: "follow_my_lead", actor: "wren" })),
    },
  };

  return snap.capabilities.map((name) => all[name]);
}
