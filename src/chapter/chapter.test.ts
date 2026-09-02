import { describe, expect, it } from "vitest";
import { Chapter } from "./chapter";
import { TRUST_START, TRUST_THRESHOLD } from "./scenes";

function fresh() {
  let t = 1_000_000;
  const chapter = new Chapter({ now: () => t });
  chapter.input({ kind: "begin", actor: "player" });
  return { chapter, tick: (ms: number) => (t += ms) };
}

describe("Chapter: title card", () => {
  it("begin is the same from the player button and from Wren's tool", () => {
    const a = new Chapter();
    const b = new Chapter();
    expect(a.snapshot().begun).toBe(false);
    expect(a.snapshot().capabilities).toEqual(["begin", "ready", "get_scene_state", "recall", "say"]);
    expect(a.input({ kind: "look", actor: "wren", direction: "up" }).ok).toBe(false);

    a.input({ kind: "begin", actor: "player" });
    b.input({ kind: "begin", actor: "wren" });
    expect(a.snapshot().begun).toBe(true);
    expect(b.snapshot().begun).toBe(true);
    expect(a.snapshot().capabilities).not.toContain("begin");
    expect(a.snapshot().capabilities).toContain("look");
    expect(a.input({ kind: "begin", actor: "wren" }).ok).toBe(false);
  });
});

describe("Chapter: Wren's turn", () => {
  it("hides the player's next cards until Wren finishes, then ready hands them back", () => {
    const chapter = new Chapter({ companion: "agent" });
    chapter.input({ kind: "begin", actor: "player" });
    expect(chapter.snapshot().waitingOnWren).toBe(false);

    chapter.input({ kind: "decide", actor: "player", choice: "stay_silent" });
    expect(chapter.snapshot().waitingOnWren).toBe(true);
    expect(chapter.snapshot().capabilities).toContain("ready");
    expect(chapter.input({ kind: "move_to", actor: "player", place: "road" }).ok).toBe(false);

    chapter.input({ kind: "scene_state", actor: "wren" });
    expect(chapter.snapshot().waitingOnWren).toBe(true);

    chapter.input({ kind: "say", actor: "wren", text: "We wait." });
    expect(chapter.snapshot().waitingOnWren).toBe(true);

    const r = chapter.input({ kind: "ready", actor: "wren" });
    expect(r.ok).toBe(true);
    expect(chapter.snapshot().waitingOnWren).toBe(false);
    expect(chapter.snapshot().capabilities).toContain("ready");
    expect(chapter.input({ kind: "move_to", actor: "player", place: "road" }).ok).toBe(true);
  });

  it("releases the cards after Wren goes idle, not while she is still acting", () => {
    let t = 1_000_000;
    const chapter = new Chapter({ companion: "agent", now: () => t });
    chapter.input({ kind: "begin", actor: "player" });
    chapter.input({ kind: "decide", actor: "player", choice: "stay_silent" });
    chapter.input({ kind: "look", actor: "wren", direction: "up" });
    t += 1_000;
    chapter.releaseIfIdle(false);
    expect(chapter.snapshot().waitingOnWren).toBe(true);

    chapter.input({ kind: "say", actor: "wren", text: "Stay down." });
    t += 3_000;
    chapter.releaseIfIdle(true);
    expect(chapter.snapshot().waitingOnWren).toBe(true);
    chapter.releaseIfIdle(false);
    expect(chapter.snapshot().waitingOnWren).toBe(false);
  });

  it("does not hold cards in a cards-only game", () => {
    const { chapter } = fresh();
    chapter.input({ kind: "decide", actor: "player", choice: "stay_silent" });
    expect(chapter.snapshot().waitingOnWren).toBe(false);
    expect(chapter.input({ kind: "move_to", actor: "player", place: "road" }).ok).toBe(true);
  });
});

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

  it("look after a player choice steers the World again", () => {
    const chapter = new Chapter({ companion: "agent" });
    chapter.input({ kind: "begin", actor: "player" });
    chapter.input({ kind: "decide", actor: "player", choice: "stay_silent" });
    const seq = chapter.snapshot().steer.seq;
    chapter.input({ kind: "look", actor: "wren", direction: "up" });
    expect(chapter.snapshot().steer.seq).toBe(seq + 1);
    expect(chapter.snapshot().waitingOnWren).toBe(true);
  });

  it("recall and get_scene_state never spend a beat", () => {
    const { chapter } = fresh();
    chapter.input({ kind: "recall", actor: "wren" });
    chapter.input({ kind: "scene_state", actor: "wren" });
    expect(chapter.snapshot().beat).toBe(0);
  });
});

describe("Chapter: Scene 1, the Underpass", () => {
  it("looking toward the voice as Wren does not take the player's card", () => {
    const { chapter } = fresh();
    const r = chapter.input({ kind: "look", actor: "wren", direction: "toward the voice" });
    expect(r.ok).toBe(true);
    expect(r.narration).toMatch(/unless you send me/);
    const s = chapter.snapshot();
    expect(s.wren.wounded).toBe(false);
    expect(s.phase).toBe("situation");
    expect(s.capabilities).toContain("run");
    expect(s.capabilities).toContain("decide");
    expect(s.capabilities).not.toContain("move_to");
  });

  it("the send_wren card is how Wren goes out; it wounds her and costs trust", () => {
    const { chapter } = fresh();
    chapter.input({ kind: "decide", actor: "player", choice: "send_wren" });
    const s = chapter.snapshot();
    expect(s.wren.wounded).toBe(true);
    expect(s.phase).toBe("resolved");
    expect(s.capabilities).not.toContain("run");
    expect(s.capabilities).not.toContain("move_to");
    expect(s.exits.length).toBeGreaterThan(0);
    expect(s.trust).toBe(TRUST_START - 1);
    expect(s.capabilities).not.toContain("follow_my_lead");
  });

  it("Wren cannot take a player's card; decide is hers only at the bridge", () => {
    const { chapter } = fresh();
    expect(chapter.snapshot().capabilities).toContain("decide");
    const silent = chapter.input({ kind: "decide", actor: "wren", choice: "stay_silent" });
    expect(silent.ok).toBe(false);
    expect(silent.error).toMatch(/player/);
    const send = chapter.input({ kind: "decide", actor: "wren", choice: "send_wren" });
    expect(send.ok).toBe(false);
    expect(chapter.snapshot().wren.wounded).toBe(false);
    expect(chapter.snapshot().phase).toBe("situation");
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
    const r = chapter.input({ kind: "move_to", actor: "player", place: "road" });
    expect(r.ok).toBe(true);
    const s = chapter.snapshot();
    expect(s.scene).toBe("pharmacy");
    expect(s.phase).toBe("situation");
    expect(s.ledger.filter((e) => e.kind === "scene").length).toBeGreaterThanOrEqual(2);
  });

  it("move_to is the player's exit card; Wren cannot take it", () => {
    const { chapter } = fresh();
    chapter.input({ kind: "decide", actor: "player", choice: "answer" });
    const stolen = chapter.input({ kind: "move_to", actor: "wren", place: "road" });
    expect(stolen.ok).toBe(false);
    expect(stolen.error).toMatch(/player picks the way/);
    const early = fresh().chapter.input({ kind: "move_to", actor: "player", place: "road" });
    expect(early.ok).toBe(false);
    expect(early.error).toMatch(/Not yet/);
    expect(chapter.snapshot().scene).toBe("underpass");
  });

  it("run and hide do not take the player's cards", () => {
    const { chapter } = fresh();
    expect(chapter.input({ kind: "run", actor: "wren" }).ok).toBe(false);
    expect(chapter.input({ kind: "hide", actor: "wren" }).ok).toBe(false);
    expect(chapter.snapshot().phase).toBe("situation");
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
    chapter.input({ kind: "move_to", actor: "player", place: "road" });
    return chapter;
  }

  it("the light going stops the pharmacy without leaving", () => {
    const chapter = atPharmacy(false);
    chapter.input({ kind: "travel_ended", actor: "chapter" });
    expect(chapter.snapshot().scene).toBe("pharmacy");
    expect(chapter.snapshot().phase).toBe("resolved");
    expect(chapter.snapshot().ending).toBeNull();
  });

  it("open stays registered; without the crowbar it fails", () => {
    const chapter = atPharmacy(false);
    expect(chapter.snapshot().capabilities).toContain("open");
    chapter.input({ kind: "decide", actor: "player", choice: "take_crowbar" });
    const s = chapter.snapshot();
    expect(s.capabilities).toContain("open");
    expect(s.capabilities).toContain("take");
    expect(s.player.inventory).toContain("crowbar");
    expect(chapter.input({ kind: "open", actor: "wren", target: "cabinet" }).ok).toBe(false);
    chapter.input({ kind: "take", actor: "wren", item: "crowbar" });
    expect(chapter.input({ kind: "open", actor: "wren", target: "cabinet" }).ok).toBe(true);
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
    expect(chapter.input({ kind: "open", actor: "wren", target: "cabinet" }).ok).toBe(false);
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
      chapter.input({ kind: "move_to", actor: "player", place: "road" });
      chapter.input({ kind: "decide", actor: "player", choice: "take_crowbar" });
      chapter.input({ kind: "decide", actor: "player", choice: "force_cabinet" });
    } else {
      chapter.input({ kind: "decide", actor: "player", choice: "stay_silent" });
      chapter.input({ kind: "move_to", actor: "player", place: "road" });
      chapter.input({ kind: "open", actor: "wren", target: "cabinet" });
    }
    chapter.input({ kind: "move_to", actor: "player", place: "alley" });
    expect(chapter.snapshot().scene).toBe("bridge");
    return chapter;
  }

  it("Together: trusting path, player first, Wren follows", () => {
    const chapter = atBridge("trusting");
    expect(chapter.snapshot().trust).toBeGreaterThanOrEqual(TRUST_THRESHOLD);
    chapter.input({ kind: "decide", actor: "player", choice: "player_first" });
    expect(chapter.snapshot().choices.every((c) => c.wrenOnly)).toBe(true);
    expect(chapter.snapshot().capabilities).toContain("decide");
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
    expect(low.input({ kind: "decide", actor: "player", choice: "cross_first" }).refused).toBe(true);
    expect(low.snapshot().ending).toBeNull();

    const high = atBridge("trusting");
    expect(high.input({ kind: "decide", actor: "player", choice: "cross_first" }).ok).toBe(true);
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

  it("the light going in Scene 1 stops the moment without leaving", () => {
    const { chapter } = fresh();
    chapter.input({ kind: "travel_ended", actor: "chapter" });
    const s = chapter.snapshot();
    expect(s.scene).toBe("underpass");
    expect(s.phase).toBe("resolved");
    expect(s.ending).toBeNull();
    expect(s.exits.length).toBeGreaterThan(0);
    expect(chapter.input({ kind: "move_to", actor: "player", place: "road" }).ok).toBe(true);
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

describe("Chapter: legibility", () => {
  it("opens with a prologue that says who you are and what you need, then the scene, then Wren", () => {
    const { chapter } = fresh();
    const d = chapter.snapshot().dialogue;
    expect(d[0].speaker).toBe("narrator");
    expect(d[0].text).toMatch(/Wren pulled you out/);
    expect(d.some((l) => /antibiotics/.test(l.text))).toBe(true);
    expect(d[d.length - 1].speaker).toBe("wren");
    expect(chapter.snapshot().goal).toMatch(/voice/);
  });

  it("speaks Wren's authored lines only while no agent is playing her", () => {
    const scripted = new Chapter();
    scripted.input({ kind: "begin", actor: "player" });
    scripted.input({ kind: "decide", actor: "player", choice: "answer" });
    expect(scripted.snapshot().dialogue.filter((l) => l.speaker === "wren").length).toBeGreaterThanOrEqual(2);

    const agent = new Chapter({ companion: "agent" });
    agent.input({ kind: "begin", actor: "player" });
    agent.input({ kind: "decide", actor: "player", choice: "answer" });
    expect(agent.snapshot().dialogue.filter((l) => l.speaker === "wren")).toHaveLength(0);
    expect(agent.snapshot().dialogue.some((l) => l.text === "Wren saw that.")).toBe(true);

    const scriptedStay = new Chapter();
    scriptedStay.input({ kind: "begin", actor: "player" });
    scriptedStay.input({ kind: "decide", actor: "player", choice: "stay_silent" });
    expect(scriptedStay.snapshot().dialogue.some((l) => l.text === "Wren saw that.")).toBe(false);
  });

  it("explains a wound, a trust change, and a decided moment in plain words", () => {
    const { chapter } = fresh();
    chapter.input({ kind: "decide", actor: "player", choice: "send_wren" });
    const status = chapter.snapshot().dialogue.filter((l) => l.speaker === "chapter").map((l) => l.text);
    expect(status.some((t) => /Wren is hurt/.test(t))).toBe(true);
    expect(status.some((t) => /Trust fell to 2 of 6/.test(t) && /Below 3/.test(t))).toBe(true);
    expect(status.some((t) => /decided/.test(t))).toBe(true);
  });

  it("counts moments left aloud while the situation is still open", () => {
    const { chapter } = fresh();
    chapter.input({ kind: "look", actor: "wren", direction: "up" });
    const last = chapter.snapshot().dialogue.at(-1)!;
    expect(last.speaker).toBe("chapter");
    expect(last.text).toMatch(/2 moments left/);
  });

  it("tells an agent which tools it lost, but not a cards-only player", () => {
    const agent = new Chapter({ companion: "agent" });
    agent.input({ kind: "begin", actor: "player" });
    agent.input({ kind: "decide", actor: "player", choice: "send_wren" });
    expect(agent.snapshot().dialogue.some((l) => l.speaker === "chapter" && /no longer: .*run/.test(l.text))).toBe(true);

    const scripted = new Chapter();
    scripted.input({ kind: "begin", actor: "player" });
    scripted.input({ kind: "decide", actor: "player", choice: "send_wren" });
    expect(scripted.snapshot().dialogue.some((l) => /no longer:/.test(l.text))).toBe(false);
  });
});
