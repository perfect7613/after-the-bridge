/// <reference types="webmcp-types" />

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema?: object;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (input: Record<string, unknown>, options: { signal: AbortSignal }) => unknown | Promise<unknown>;
}

export type RegistryEvent =
  | { type: "register"; name: string }
  | { type: "unregister"; name: string }
  | { type: "error"; name: string; message: string };

/** The subset of ModelContext the registry needs; lets tests pass a fake. */
export interface ModelContextLike {
  registerTool(tool: WebMCP.ModelContextTool, options?: { signal?: AbortSignal }): Promise<void> | void;
}

interface Held {
  controller: AbortController;
  key: string;
}

/**
 * Keeps the set of registered WebMCP tools equal to a desired list.
 *
 * One AbortController per tool: aborting it unregisters. A tool whose name and
 * schema are unchanged keeps its controller, so an in-flight call is never cut
 * by an unrelated snapshot. A tool whose schema changed (a new enum of choices,
 * say) is torn down and registered again.
 */
export class ToolRegistry {
  private readonly held = new Map<string, Held>();

  constructor(
    private readonly ctx: ModelContextLike | undefined,
    private readonly onEvent: (e: RegistryEvent) => void = () => {},
  ) {}

  get available(): boolean {
    return this.ctx !== undefined;
  }

  get names(): string[] {
    return [...this.held.keys()];
  }

  async sync(desired: ToolSpec[]): Promise<{ added: string[]; removed: string[] }> {
    const added: string[] = [];
    const removed: string[] = [];
    if (!this.ctx) return { added, removed };

    const wanted = new Map(desired.map((t) => [t.name, t]));

    for (const [name, held] of this.held) {
      const next = wanted.get(name);
      if (!next || keyOf(next) !== held.key) {
        held.controller.abort();
        this.held.delete(name);
        removed.push(name);
        this.onEvent({ type: "unregister", name });
      }
    }

    for (const spec of desired) {
      if (this.held.has(spec.name)) continue;
      const controller = new AbortController();
      const schema = cloneSchema(spec.inputSchema ?? EMPTY_INPUT);
      try {
        await this.ctx.registerTool(
          {
            name: spec.name,
            title: spec.name,
            description: spec.description,
            inputSchema: schema,
            annotations: spec.annotations,
            // WebIDL: ToolExecuteCallback = Promise<any> (object input)
            execute: async (input, extra) => {
              const result = await spec.execute((input ?? {}) as Record<string, unknown>, {
                signal: extra?.signal ?? controller.signal,
              });
              return cloneResult(result);
            },
          },
          { signal: controller.signal },
        );
        this.held.set(spec.name, { controller, key: keyOf(spec) });
        added.push(spec.name);
        this.onEvent({ type: "register", name: spec.name });
      } catch (err) {
        this.onEvent({ type: "error", name: spec.name, message: err instanceof Error ? err.message : String(err) });
      }
    }

    return { added, removed };
  }

  dispose() {
    for (const [name, held] of this.held) {
      held.controller.abort();
      this.onEvent({ type: "unregister", name });
    }
    this.held.clear();
  }
}

function keyOf(spec: ToolSpec): string {
  return spec.name + "|" + JSON.stringify(spec.inputSchema ?? null) + "|" + spec.description;
}

/** ChatGPT's documented no-arg schema. Anything looser is registered but not callable. */
const EMPTY_INPUT = { type: "object", properties: {}, additionalProperties: false };

function cloneSchema(schema: object): object {
  return JSON.parse(JSON.stringify(schema)) as object;
}

function cloneResult(result: unknown): unknown {
  if (result === undefined || result === null) return { ok: true };
  try {
    return JSON.parse(JSON.stringify(result));
  } catch {
    return { ok: true, narration: String(result) };
  }
}
