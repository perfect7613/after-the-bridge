import { describe, expect, it, vi } from "vitest";
import { Chapter } from "@/src/chapter";
import { FakeModelContext } from "./fake-context";
import { ToolRegistry, type ToolSpec } from "./registry";
import type { ToolResult } from "./tools";
import { Wren } from "./wren";

const spec = (name: string, schema?: object): ToolSpec => ({
  name,
  description: `${name} tool`,
  inputSchema: schema,
  execute: () => ({ name }),
});

describe("ToolRegistry", () => {
  it("adds, removes, and keeps unchanged controllers", async () => {
    const ctx = new FakeModelContext();
    const reg = new ToolRegistry(ctx);

    let r = await reg.sync([spec("a"), spec("b")]);
    expect(r.added).toEqual(["a", "b"]);
    expect(ctx.names()).toEqual(["a", "b"]);
    const signalA = ctx.tools.get("a")!.signal;

    r = await reg.sync([spec("a"), spec("c")]);
    expect(r.removed).toEqual(["b"]);
    expect(r.added).toEqual(["c"]);
    expect(ctx.names()).toEqual(["a", "c"]);
    expect(ctx.tools.get("a")!.signal).toBe(signalA);
    expect(ctx.registrations).toBe(3);
  });

  it("re-registers a tool whose schema changed", async () => {
    const ctx = new FakeModelContext();
    const reg = new ToolRegistry(ctx);
    await reg.sync([spec("decide", { enum: ["x"] })]);
    const first = ctx.tools.get("decide")!.signal;
    await reg.sync([spec("decide", { enum: ["y"] })]);
    expect(ctx.tools.get("decide")!.signal).not.toBe(first);
    expect(first!.aborted).toBe(true);
  });

  it("is a no-op without a model context", async () => {
    const reg = new ToolRegistry(undefined);
    const r = await reg.sync([spec("a")]);
    expect(r).toEqual({ added: [], removed: [] });
    expect(reg.available).toBe(false);
  });

  it("dispose aborts everything", async () => {
    const ctx = new FakeModelContext();
    const reg = new ToolRegistry(ctx);
    await reg.sync([spec("a"), spec("b")]);
    reg.dispose();
    expect(ctx.names()).toEqual([]);
  });
});

describe("Wren wears the Chapter", () => {
  async function mounted() {
    const chapter = new Chapter();
    chapter.input({ kind: "begin", actor: "player" });
    const ctx = new FakeModelContext();
    const wren = new Wren(chapter, ctx);
    wren.mount();
    await wren.settled();
    return { chapter, ctx, wren };
  }

  it("registers exactly the snapshot's capabilities", async () => {
    const { chapter, ctx } = await mounted();
    expect(ctx.names()).toEqual([...chapter.snapshot().capabilities].sort());
    expect(ctx.tools.get("recall")!.tool.annotations?.readOnlyHint).toBe(true);
    expect(ctx.tools.get("look")!.tool.annotations?.readOnlyHint).toBeUndefined();
  });

  it("registers get_scene_state with ChatGPT's no-arg schema so it is callable", async () => {
    const { ctx } = await mounted();
    const tool = ctx.tools.get("get_scene_state")!.tool;
    expect(tool.name).toBe("get_scene_state");
    expect(tool.title).toBe("get_scene_state");
    expect(tool.inputSchema).toEqual({ type: "object", properties: {}, additionalProperties: false });
    const result = (await ctx.call("get_scene_state", {})) as ToolResult;
    expect(result.ok).toBe(true);
    expect(result.narration).toMatch(/Scene:/);
  });

  it("gives every registered tool a closed object schema", async () => {
    const { ctx } = await mounted();
    for (const name of ctx.names()) {
      const schema = ctx.tools.get(name)!.tool.inputSchema as { type?: string; additionalProperties?: boolean };
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
    }
  });

  it("begin is on the title card; calling it starts the world and unregisters", async () => {
    const chapter = new Chapter();
    const ctx = new FakeModelContext();
    const wren = new Wren(chapter, ctx);
    wren.mount();
    await wren.settled();
    expect(ctx.names()).toEqual(["begin", "get_scene_state", "ready", "recall", "say"].sort());
    const result = (await ctx.call("begin", {})) as ToolResult;
    expect(result.ok).toBe(true);
    await wren.settled();
    expect(chapter.snapshot().begun).toBe(true);
    expect(ctx.names()).not.toContain("begin");
    expect(ctx.names()).toContain("look");
  });

  it("ready is registered from the title card and hands the cards back", async () => {
    const chapter = new Chapter({ companion: "agent" });
    const ctx = new FakeModelContext();
    const wren = new Wren(chapter, ctx);
    wren.mount();
    await wren.settled();
    expect(ctx.names()).toContain("ready");
    chapter.input({ kind: "begin", actor: "player" });
    await wren.settled();
    expect(ctx.names()).toContain("ready");
    chapter.input({ kind: "decide", actor: "player", choice: "stay_silent" });
    await wren.settled();
    expect(ctx.names()).toContain("ready");
    const result = (await ctx.call("ready", {})) as ToolResult;
    expect(result.ok).toBe(true);
    await wren.settled();
    expect(chapter.snapshot().waitingOnWren).toBe(false);
    expect(ctx.names()).toContain("ready");
  });

  it("wounded unregisters run; the popover changes", async () => {
    const { chapter, ctx, wren } = await mounted();
    expect(ctx.names()).toContain("run");
    expect(ctx.names()).toContain("decide");
    expect(ctx.names()).not.toContain("move_to");
    chapter.input({ kind: "decide", actor: "player", choice: "send_wren" });
    await wren.settled();
    expect(ctx.names()).not.toContain("run");
    expect(ctx.names()).not.toContain("move_to");
    expect(ctx.names()).toContain("decide");
  });

  it("open stays registered without the crowbar; execute fails until she has it", async () => {
    const { chapter, ctx, wren } = await mounted();
    chapter.input({ kind: "decide", actor: "player", choice: "stay_silent" });
    chapter.input({ kind: "move_to", actor: "player", place: "road" });
    await wren.settled();
    expect(ctx.names()).toContain("open");

    const given = (await ctx.call("give", { item: "crowbar" })) as ToolResult;
    expect(given.ok).toBe(true);
    await wren.settled();
    expect(ctx.names()).toContain("open");
    const blocked = (await ctx.call("open", { target: "cabinet" })) as ToolResult;
    expect(blocked.ok).toBe(false);

    chapter.input({ kind: "decide", actor: "player", choice: "give_back" });
    await wren.settled();
    const opened = (await ctx.call("open", { target: "cabinet" })) as ToolResult;
    expect(opened.ok).toBe(true);
  });

  it("low trust unregisters follow_my_lead", async () => {
    const { chapter, ctx, wren } = await mounted();
    expect(ctx.names()).toContain("follow_my_lead");
    chapter.input({ kind: "decide", actor: "player", choice: "send_wren" });
    await wren.settled();
    expect(ctx.names()).not.toContain("follow_my_lead");
  });

  it("decide can come back refused with a citation; there is no refuse tool", async () => {
    const { chapter, ctx, wren } = await mounted();
    chapter.input({ kind: "decide", actor: "player", choice: "send_wren" });
    chapter.input({ kind: "move_to", actor: "player", place: "road" });
    chapter.input({ kind: "decide", actor: "player", choice: "take_crowbar" });
    chapter.input({ kind: "decide", actor: "player", choice: "force_cabinet" });
    chapter.input({ kind: "move_to", actor: "player", place: "alley" });
    chapter.input({ kind: "decide", actor: "player", choice: "player_first" });
    await wren.settled();
    expect(ctx.names()).not.toContain("refuse");
    const r = (await ctx.call("decide", { choice: "follow" })) as ToolResult;
    expect(r.refused).toBe(true);
    expect(r.citation?.text).toMatch(/crowbar/);
    expect(r.state.ending).toBe("alone");
    expect(wren.state.activity.some((a) => a.kind === "refused")).toBe(true);
  });

  it("ask_player blocks until the player answers", async () => {
    const { chapter, ctx } = await mounted();
    const p = ctx.call("ask_player", { question: "Answer him?", options: ["yes", "no"], seconds: 10 }) as Promise<
      ToolResult & { answer: string }
    >;
    await Promise.resolve();
    expect(chapter.snapshot().pending?.question).toBe("Answer him?");
    chapter.input({ kind: "answer", actor: "player", answer: "no" });
    const r = await p;
    expect(r.answer).toBe("no");
    expect(r.state.waitingOnPlayer).toBeNull();
  });

  it("ask_player resolves to silence on timeout and costs trust", async () => {
    vi.useFakeTimers();
    try {
      const { chapter, ctx } = await mounted();
      const trust = chapter.snapshot().trust;
      const p = ctx.call("ask_player", { question: "Well?", options: ["a"], seconds: 5 }) as Promise<ToolResult & { answer: string }>;
      await vi.advanceTimersByTimeAsync(5_100);
      const r = await p;
      expect(r.answer).toBe("silence");
      expect(chapter.snapshot().trust).toBe(trust - 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborting ask_player withdraws the question", async () => {
    const { chapter, ctx } = await mounted();
    const ac = new AbortController();
    const p = ctx.call("ask_player", { question: "Still there?", options: ["yes"], seconds: 10 }, ac.signal) as Promise<ToolResult>;
    await Promise.resolve();
    ac.abort();
    const r = await p;
    expect(r.ok).toBe(false);
    expect(chapter.snapshot().pending).toBeNull();
  });

  it("does not throw when document.modelContext is missing", async () => {
    const chapter = new Chapter();
    const wren = new Wren(chapter, undefined);
    expect(() => wren.mount()).not.toThrow();
    await wren.settled();
    expect(wren.state.webmcp).toBe(false);
    expect(wren.state.registered).toEqual([]);
    expect(chapter.input({ kind: "begin", actor: "player" }).ok).toBe(true);
    expect(chapter.input({ kind: "decide", actor: "player", choice: "answer" }).ok).toBe(true);
  });

  it("watch fires once when modelContext appears, without a dummy miss first", async () => {
    vi.useFakeTimers();
    const fakeDoc: { modelContext?: { registerTool: () => void } } = {};
    vi.stubGlobal("document", fakeDoc);
    vi.stubGlobal("window", globalThis);

    const seen: boolean[] = [];
    const stop = Wren.watch((ctx) => seen.push(Boolean(ctx)), 1000);
    expect(seen).toEqual([]);

    fakeDoc.modelContext = { registerTool: () => {} };
    await vi.advanceTimersByTimeAsync(80);
    expect(seen).toEqual([true]);
    stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("execute handlers contain no story rules", async () => {
    const src = await import("node:fs/promises").then((fs) => fs.readFile(new URL("./tools.ts", import.meta.url), "utf8"));
    expect(src).not.toMatch(/trust\s*[<>]=?\s*\d/);
    expect(src).not.toMatch(/wounded\s*=/);
  });
});

describe("WrenSession", () => {
  it("keeps tools registered across a second start(); dispose is the only abort", async () => {
    const { WrenSession } = await import("./session");
    const session = new WrenSession();
    const ctx = new FakeModelContext();
    const original = Wren.detect;
    Wren.detect = () => ctx;
    try {
      session.start();
      await session.settled();
      expect(ctx.names()).toContain("get_scene_state");
      const firstSignal = ctx.tools.get("get_scene_state")!.signal;
      session.start();
      await session.settled();
      expect(ctx.tools.get("get_scene_state")!.signal).toBe(firstSignal);
      session.dispose();
      expect(ctx.names()).toEqual([]);
    } finally {
      Wren.detect = original;
    }
  });
});
