import type { Chapter, Snapshot } from "@/src/chapter";
import { type ModelContextLike, ToolRegistry } from "./registry";
import { type ToolResult, toolsFor } from "./tools";

export type ActivityKind = "register" | "unregister" | "call" | "refused" | "error" | "info";

export interface Activity {
  id: number;
  at: number;
  kind: ActivityKind;
  name: string;
  detail?: string;
}

export interface WrenState {
  /** Whether the page has a model context to wear tools on. */
  webmcp: boolean;
  registered: string[];
  activity: Activity[];
  /** True while a site tool execute is in flight. */
  busy: boolean;
}

type Listener = (state: WrenState) => void;

/**
 * Wren is Codex wearing the body the page gives her. Mounting subscribes to
 * the Chapter and keeps the WebMCP tool set equal to the snapshot's
 * capabilities. Nothing here decides story; it only syncs and forwards.
 */
export class Wren {
  private readonly registry: ToolRegistry;
  private readonly listeners = new Set<Listener>();
  private activity: Activity[] = [];
  private nextId = 1;
  private busy = 0;
  private unsubscribe: (() => void) | null = null;
  private syncing: Promise<void> = Promise.resolve();

  constructor(
    private readonly chapter: Chapter,
    ctx: ModelContextLike | undefined,
  ) {
    this.registry = new ToolRegistry(ctx, (e) => {
      if (e.type === "error") this.log("error", e.name, e.message);
      else this.log(e.type, e.name);
    });
  }

  static detect(): ModelContextLike | undefined {
    if (typeof document === "undefined") return undefined;
    const doc = document as Document & { modelContext?: WebMCP.ModelContext };
    const nav = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { modelContext?: WebMCP.ModelContext });
    const ctx = doc.modelContext ?? nav?.modelContext;
    return ctx && typeof ctx.registerTool === "function" ? ctx : undefined;
  }

  /**
   * Resolves with modelContext as soon as it exists. Does not fire a dummy
   * `undefined` first: attaching then tearing down aborts every tool, and the
   * spec says aborted tools are gone. ChatGPT keeps the old bindings.
   */
  static watch(onReady: (ctx: ModelContextLike | undefined) => void, waitMs = 20_000): () => void {
    const first = Wren.detect();
    if (first) {
      onReady(first);
      return () => {};
    }
    if (typeof window === "undefined") {
      onReady(undefined);
      return () => {};
    }
    const started = Date.now();
    const id = window.setInterval(() => {
      const ctx = Wren.detect();
      if (ctx) {
        window.clearInterval(id);
        onReady(ctx);
      } else if (Date.now() - started >= waitMs) {
        window.clearInterval(id);
        onReady(undefined);
      }
    }, 50);
    return () => window.clearInterval(id);
  }

  get state(): WrenState {
    return { webmcp: this.registry.available, registered: this.registry.names, activity: [...this.activity], busy: this.busy > 0 };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  mount(): () => void {
    if (!this.registry.available) {
      this.log("info", "webmcp", "No model context on this page. Cards remain the way to play.");
    }
    this.unsubscribe = this.chapter.subscribe((snap) => this.queueSync(snap));
    this.queueSync(this.chapter.snapshot());
    return () => this.unmount();
  }

  unmount() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.registry.dispose();
    this.emit();
  }

  /** Resolves after the most recently queued sync has finished. Tests use it. */
  settled(): Promise<void> {
    return this.syncing;
  }

  private queueSync(snap: Snapshot) {
    this.syncing = this.syncing.then(() => this.sync(snap)).catch(() => {});
  }

  private async sync(snap: Snapshot) {
    const specs = toolsFor(this.chapter, snap, { onCall: (name, input, result) => this.record(name, input, result) }).map(
      (spec) => ({
        ...spec,
        execute: async (input: Record<string, unknown>, opts: { signal: AbortSignal }) => {
          this.busy += 1;
          this.emit();
          try {
            return await spec.execute(input, opts);
          } finally {
            this.busy -= 1;
            this.emit();
          }
        },
      }),
    );
    await this.registry.sync(specs);
    this.emit();
  }

  private record(name: string, input: Record<string, unknown>, result: ToolResult) {
    const args = Object.entries(input)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(", ");
    if (result.refused) this.log("refused", name, result.reason);
    else if (result.error) this.log("error", name, result.error);
    else this.log("call", name, args || undefined);
  }

  private log(kind: ActivityKind, name: string, detail?: string) {
    this.activity.push({ id: this.nextId++, at: Date.now(), kind, name, detail });
    if (this.activity.length > 200) this.activity = this.activity.slice(-200);
    this.emit();
  }

  private emit() {
    const s = this.state;
    for (const l of this.listeners) l(s);
  }
}
