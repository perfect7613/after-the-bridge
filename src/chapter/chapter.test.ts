import { describe, expect, it } from "vitest";
import { Chapter } from "./chapter";
import { TRUST_START, TRUST_THRESHOLD } from "./scenes";

function fresh() {
  let t = 1_000_000;
  const chapter = new Chapter({ now: () => t });
  return { chapter, tick: (ms: number) => (t += ms) };
}

describe("Chapter: perception", () => {
  it("look costs a beat, listen does not", () => {
    const { chapter } = fresh();
    const before = chapter.snapshot();
    chapter.input({ kind: "listen", actor: "wren" });
    expect(chapter.snapshot().beat).toBe(before.beat);
    chapter.input({ kind: "look", actor: "wren", direction: "up" });
    expect(chapter.snapshot().beat).toBe(before.beat + 1);
    expect(chapter.snapshot().beatsLeft).toBe(before.beatsLeft - 1);
  });

  it("look returns Chapter text and steers the World", () => {
    const { chapter } = fresh();
    const seq = chapter.snapshot().steer.seq;
    const r = chapter.input({ kind: "look", actor: "wren", direction: "up" });
    expect(r.ok).toBe(true);
    expect(r.narration).toMatch(/grate/);
    expect(chapter.snapshot().steer.seq).toBe(seq + 1);
  });

  it("recall and get_scene_state never spend a beat", () => {
    const { chapter } = fresh();
    chapter.input({ kind: "recall", actor: "wren" });
    chapter.input({ kind: "scene_state", actor: "wren" });
    expect(chapter.snapshot().beat).toBe(0);
  });
});

describe("Chapter: Scene 1, the Underpass", () => {
  it("looking toward the voice wounds Wren, resolves the scene, and unregisters run", () => {
    const { chapter } = fresh();
    expect(chapter.snapshot().capabilities).toContain("run");
    const r = chapter.input({ kind: "look", actor: "wren", direction: "toward the voice" });
    expect(r.ok).toBe(true);
    const s = chapter.snapshot();
    expect(s.wren.wounded).toBe(true);
    expect(s.phase).toBe("resolved");
    expect(s.capabilities).not.toContain("run");
    expect(s.capabilities).toContain("move_to");
    expect(s.ledger.some((e) => e.kind === "wound")).toBe(true);
  });

  it("the send_wren card and Wren's look are the same input seam", () => {
    const a = fresh().chapter;
    const b = fresh().chapter;
    a.input({ kind: "decide", actor: "player", choice: "send_wren" });
    b.input({ kind: "look", actor: "wren", direction: "toward the voice" });
    const sa = a.snapshot();
    const sb = b.snapshot();
    expect(sa.wren.wounded).toBe(sb.wren.wounded);
    expect(sa.phase).toBe(sb.phase);
    // Player sending her costs trust; her own choice does not. That is the only divergence.
    const body = (caps: string[]) => caps.filter((c) => c !== "follow_my_lead");
    expect(body(sa.capabilities)).toEqual(body(sb.capabilities));
    expect(sa.trust).toBe(TRUST_START - 1);
    expect(sb.trust).toBe(TRUST_START);
    expect(sa.capabilities).not.toContain("follow_my_lead");
    expect(sb.capabilities).toContain("follow_my_lead");
  });

  it("decide is only a capability while the situation is open", () => {
    const { chapter } = fresh();
    expect(chapter.snapshot().capabilities).toContain("decide");
    chapter.input({ kind: "decide", actor: "wren", choice: "stay_silent" });
    expect(chapter.snapshot().capabilities).not.toContain("decide");
    expect(chapter.snapshot().capabilities).toContain("move_to");
  });

  it("Wren cannot take a player-only card", () => {
    const { chapter } = fresh();
    const r = chapter.input({ kind: "decide", actor: "wren", choice: "send_wren" });
    expect(r.ok).toBe(false);
    expect(chapter.snapshot().wren.wounded).toBe(false);
  });

  it("running out of beats makes the moment pass", () => {
    const { chapter } = fresh();
    chapter.input({ kind: "look", actor: "wren", direction: "up" });
    chapter.input({ kind: "look", actor: "wren", direction: "behind" });
    chapter.input({ kind: "look", actor: "wren", direction: "up" });
    const s = chapter.snapshot();
    expect(s.beatsLeft).toBe(0);
    expect(s.phase).toBe("resolved");
    expect(s.ledger.some((e) => /moment passed/.test(e.text))).toBe(true);
  });

  it("move_to advances to the Pharmacy and writes the ledger", () => {
    const { chapter } = fresh();
    chapter.input({ kind: "decide", actor: "player", choice: "answer" });
    const r = chapter.input({ kind: "move_to", actor: "wren", place: "road" });
    expect(r.ok).toBe(true);
    const s = chapter.snapshot();
    expect(s.scene).toBe("pharmacy");
    expect(s.phase).toBe("situation");
    expect(s.ledger.filter((e) => e.kind === "scene").length).toBeGreaterThanOrEqual(2);
  });

  it("move_to is refused before the situation resolves", () => {
    const { chapter } = fresh();
    const r = chapter.input({ kind: "move_to", actor: "wren", place: "road" });
    expect(r.ok).toBe(false);
    expect(chapter.snapshot().scene).toBe("underpass");
  });
});

describe("Chapter: elicitation", () => {
  it("silence resolves the question, costs trust, and writes the ledger", async () => {
    const { chapter } = fresh();
    const r = chapter.input({ kind: "ask", actor: "wren", question: "Do we answer him?", options: ["yes", "no"], seconds: 10 });
    expect(r.ok).toBe(true);
    const pending = chapter.snapshot().pending!;
    expect(pending.expiresAt - pending.openedAt).toBe(10_000);
    const answer = chapter.waitForAnswer(pending.id);
    chapter.input({ kind: "answer", actor: "player", answer: "silence" });
    await expect(answer).resolves.toBe("silence");
    const s = chapter.snapshot();
    expect(s.pending).toBeNull();
    expect(s.trust).toBe(TRUST_START - 1);
    expect(s.ledger.some((e) => e.kind === "silence")).toBe(true);
  });

  it("an answer resolves without a trust penalty", async () => {
    const { chapter } = fresh();
    chapter.input({ kind: "ask", actor: "wren", question: "Left or right?", options: ["left", "right"], seconds: 10 });
    const p = chapter.waitForAnswer(chapter.snapshot().pending!.id);
    chapter.input({ kind: "answer", actor: "player", answer: "left" });
    await expect(p).resolves.toBe("left");
    expect(chapter.snapshot().trust).toBe(TRUST_START);
  });

  it("aborting the wait withdraws the question", async () => {
    const { chapter } = fresh();
    chapter.input({ kind: "ask", actor: "wren", question: "Ready?", options: [], seconds: 10 });
    const ac = new AbortController();
    const p = chapter.waitForAnswer(chapter.snapshot().pending!.id, ac.signal);
    ac.abort();
    await expect(p).rejects.toThrow();
    expect(chapter.snapshot().pending).toBeNull();
  });

  it("a second question while one is pending is rejected", () => {
    const { chapter } = fresh();
    chapter.input({ kind: "ask", actor: "wren", question: "One?", options: [], seconds: 10 });
    const r = chapter.input({ kind: "ask", actor: "wren", question: "Two?", options: [], seconds: 10 });
    expect(r.ok).toBe(false);
  });
});

describe("Chapter: Scene 2, the Pharmacy", () => {
  function atPharmacy(wounded: boolean) {
    const { chapter } = fresh();
    if (wounded) chapter.input({ kind: "decide", actor: "player", choice: "send_wren" });
    else chapter.input({ kind: "decide", actor: "player", choice: "stay_silent" });
    chapter.input({ kind: "move_to", actor: "wren", place: "road" });
    return chapter;
  }

  it("open is a capability only while Wren holds the crowbar", () => {
    const chapter = atPharmacy(false);
    expect(chapter.snapshot().capabilities).toContain("open");
    chapter.input({ kind: "decide", actor: "player", choice: "take_crowbar" });
    const s = chapter.snapshot();
    expect(s.capabilities).not.toContain("open");
    expect(s.capabilities).toContain("take");
    expect(s.player.inventory).toContain("crowbar");
    chapter.input({ kind: "take", actor: "wren", item: "crowbar" });
    expect(chapter.snapshot().capabilities).toContain("open");
  });

  it("taking the crowbar from a wounded Wren drops trust by two", () => {
    const chapter = atPharmacy(true);
    const before = chapter.snapshot().trust;
    chapter.input({ kind: "decide", actor: "player", choice: "take_crowbar" });
    expect(chapter.snapshot().trust).toBe(before - 2);
    expect(chapter.snapshot().capabilities).not.toContain("follow_my_lead");
  });

  it("Wren giving the crowbar freely costs nothing", () => {
    const chapter = atPharmacy(false);
    const before = chapter.snapshot().trust;
    chapter.input({ kind: "give", actor: "wren", item: "crowbar" });
    expect(chapter.snapshot().trust).toBe(before);
    expect(chapter.snapshot().capabilities).not.toContain("open");
  });

  it("Wren opening the cabinet gets the antibiotics and resolves the scene", () => {
    const chapter = atPharmacy(false);
    const r = chapter.input({ kind: "open", actor: "wren", target: "the cabinet" });
    expect(r.ok).toBe(true);
    const s = chapter.snapshot();
    expect(s.player.inventory).toContain("antibiotics");
    expect(s.phase).toBe("resolved");
  });

  it("the card and the tool call to open are the same seam", () => {
    const a = atPharmacy(false);
    const b = atPharmacy(false);
    a.input({ kind: "decide", actor: "player", choice: "let_wren_open" });
    b.input({ kind: "open", actor: "wren", target: "cabinet" });
    expect(a.snapshot().player.inventory).toEqual(b.snapshot().player.inventory);
    expect(a.snapshot().phase).toBe(b.snapshot().phase);
    expect(a.snapshot().capabilities).toEqual(b.snapshot().capabilities);
  });

  it("open without the crowbar fails without changing state", () => {
    const chapter = atPharmacy(false);
    chapter.input({ kind: "give", actor: "wren", item: "crowbar" });
    const r = chapter.input({ kind: "open", actor: "wren", target: "cabinet" });
    expect(r.ok).toBe(false);
    expect(chapter.snapshot().player.inventory).not.toContain("antibiotics");
  });
});

describe("Chapter: Scene 3, the Bridge", () => {
  function atBridge(path: "trusting" | "betrayed") {
    const { chapter } = fresh();
    if (path === "betrayed") {
      chapter.input({ kind: "decide", actor: "player", choice: "send_wren" });
      chapter.input({ kind: "move_to", actor: "wren", place: "road" });
      chapter.input({ kind: "decide", actor: "player", choice: "take_crowbar" });
      chapter.input({ kind: "decide", actor: "player", choice: "force_cabinet" });
    } else {
      chapter.input({ kind: "decide", actor: "player", choice: "stay_silent" });
      chapter.input({ kind: "move_to", actor: "wren", place: "road" });
      chapter.input({ kind: "open", actor: "wren", target: "cabinet" });
    }
    chapter.input({ kind: "move_to", actor: "wren", place: "alley" });
    expect(chapter.snapshot().scene).toBe("bridge");
    return chapter;
  }

  it("Together: trusting path, player first, Wren follows", () => {
    const chapter = atBridge("trusting");
    expect(chapter.snapshot().trust).toBeGreaterThanOrEqual(TRUST_THRESHOLD);
    chapter.input({ kind: "decide", actor: "player", choice: "player_first" });
    const r = chapter.input({ kind: "decide", actor: "wren", choice: "follow" });
    expect(r.ok).toBe(true);
    expect(chapter.snapshot().ending).toBe("together");
    expect(chapter.snapshot().capabilities).toEqual(["get_scene_state", "recall", "say"]);
  });

  it("Alone: betrayed path, decide is refused with a ledger citation", () => {
    const chapter = atBridge("betrayed");
    expect(chapter.snapshot().trust).toBeLessThan(TRUST_THRESHOLD);
    chapter.input({ kind: "decide", actor: "player", choice: "player_first" });
    const r = chapter.input({ kind: "decide", actor: "wren", choice: "follow" });
    expect(r.refused).toBe(true);
    expect(r.reason).toMatch(/Not after the pharmacy/);
    expect(r.citation?.text).toMatch(/took the crowbar/);
    expect(chapter.snapshot().ending).toBe("alone");
    expect(chapter.snapshot().ledger.some((e) => e.kind === "refusal")).toBe(true);
  });

  it("cross_first is refused below the threshold and allowed above it", () => {
    const low = atBridge("betrayed");
    expect(low.input({ kind: "decide", actor: "wren", choice: "cross_first" }).refused).toBe(true);
    expect(low.snapshot().ending).toBeNull();

    const high = atBridge("trusting");
    expect(high.input({ kind: "decide", actor: "wren", choice: "cross_first" }).ok).toBe(true);
    expect(high.input({ kind: "decide", actor: "player", choice: "cross_after" }).ok).toBe(true);
    expect(high.snapshot().ending).toBe("together");
  });

  it("follow_my_lead commits Wren so player_first ends Together at once", () => {
    const chapter = atBridge("trusting");
    expect(chapter.snapshot().capabilities).toContain("follow_my_lead");
    expect(chapter.input({ kind: "follow_my_lead", actor: "wren" }).ok).toBe(true);
    chapter.input({ kind: "decide", actor: "player", choice: "player_first" });
    expect(chapter.snapshot().ending).toBe("together");
  });

  it("the light going on the bridge ends Alone", () => {
    const chapter = atBridge("trusting");
    chapter.input({ kind: "travel_ended", actor: "chapter" });
    expect(chapter.snapshot().ending).toBe("alone");
  });

  it("the light going in Scene 1 advances the scene", () => {
    const { chapter } = fresh();
    chapter.input({ kind: "travel_ended", actor: "chapter" });
    expect(chapter.snapshot().scene).toBe("pharmacy");
  });
});

describe("Chapter: invariants", () => {
  it("snapshot lists capabilities but the module never touches WebMCP or Reactor", async () => {
    const src = await import("node:fs/promises").then((fs) => fs.readFile(new URL("./chapter.ts", import.meta.url), "utf8"));
    expect(src).not.toMatch(/modelContext|happy-oyster|reactor/i);
  });

  it("subscribers receive every snapshot", () => {
    const { chapter } = fresh();
    const seen: number[] = [];
    chapter.subscribe((s) => seen.push(s.beat));
    chapter.input({ kind: "look", actor: "wren", direction: "up" });
    chapter.input({ kind: "listen", actor: "wren" });
    expect(seen).toEqual([1, 1]);
  });
});
