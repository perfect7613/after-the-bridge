import { Chapter, type Snapshot } from "@/src/chapter";
import { Wren, type WrenState } from "./wren";
import type { ModelContextLike } from "./registry";

/**
 * One Chapter and one Wren for the life of the document.
 *
 * The WebMCP spec keeps a tool registered until its AbortSignal aborts or the
 * document unloads. React effect cleanup is neither, so Game must not dispose
 * this session — Codex snapshots the bindings from registerTool, and aborting
 * them leaves the agent with names that are no longer callable.
 */
export class WrenSession {
  readonly chapter = new Chapter();
  private wren: Wren | null = null;
  private stopWatch: (() => void) | null = null;
  private unmountWren: (() => void) | null = null;
  private readonly wrenListeners = new Set<(state: WrenState) => void>();
  private unsubWren: (() => void) | null = null;

  start() {
    if (this.stopWatch) return;
    this.stopWatch = Wren.watch((ctx) => this.attach(ctx), 20_000);
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", () => this.dispose(), { once: true });
    }
  }

  snapshot(): Snapshot {
    return this.chapter.snapshot();
  }

  wrenState(): WrenState {
    return this.wren?.state ?? { webmcp: false, registered: [], activity: [], busy: false };
  }

  settled(): Promise<void> {
    return this.wren?.settled() ?? Promise.resolve();
  }

  subscribeChapter(fn: (snapshot: Snapshot) => void): () => void {
    return this.chapter.subscribe(fn);
  }

  subscribeWren(fn: (state: WrenState) => void): () => void {
    this.wrenListeners.add(fn);
    fn(this.wrenState());
    return () => this.wrenListeners.delete(fn);
  }

  dispose() {
    this.stopWatch?.();
    this.stopWatch = null;
    this.unsubWren?.();
    this.unsubWren = null;
    this.unmountWren?.();
    this.unmountWren = null;
    this.wren = null;
  }

  private attach(ctx: ModelContextLike | undefined) {
    if (this.wren?.state.webmcp && ctx) return;
    this.unsubWren?.();
    this.unmountWren?.();
    this.wren = new Wren(this.chapter, ctx);
    this.unsubWren = this.wren.subscribe((state) => {
      for (const fn of this.wrenListeners) fn(state);
    });
    this.unmountWren = this.wren.mount();
    for (const fn of this.wrenListeners) fn(this.wren.state);
  }
}

let clientSession: WrenSession | null = null;

/** Client singleton. SSR gets a throwaway Chapter so the first paint matches. */
export function getSession(): WrenSession {
  if (typeof window === "undefined") return new WrenSession();
  if (!clientSession) {
    clientSession = new WrenSession();
    clientSession.start();
  }
  return clientSession;
}
