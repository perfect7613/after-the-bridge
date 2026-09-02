import type { ModelContextLike } from "./registry";

export interface FakeTool {
  tool: WebMCP.ModelContextTool;
  signal?: AbortSignal;
}

/**
 * An in-memory model context for tests: registers tools, forgets them when
 * their signal aborts, and lets a test call execute like an agent would.
 */
export class FakeModelContext implements ModelContextLike {
  readonly tools = new Map<string, FakeTool>();
  registrations = 0;

  async registerTool(tool: WebMCP.ModelContextTool, options?: { signal?: AbortSignal }) {
    this.registrations += 1;
    this.tools.set(tool.name, { tool, signal: options?.signal });
    options?.signal?.addEventListener("abort", () => {
      if (this.tools.get(tool.name)?.signal === options.signal) this.tools.delete(tool.name);
    });
  }

  names(): string[] {
    return [...this.tools.keys()].sort();
  }

  call(name: string, input: Record<string, unknown> = {}, signal = new AbortController().signal): Promise<unknown> {
    const held = this.tools.get(name);
    if (!held) return Promise.reject(new Error(`No tool named ${name}`));
    return Promise.resolve(held.tool.execute(input, { signal }));
  }
}
