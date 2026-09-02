import { capabilitiesFor } from "./capabilities";
import { PROLOGUE, SCENES, TRUST_START, TRUST_THRESHOLD, type LookResponse, type SceneData } from "./scenes";
import type {
  Actor,
  CapabilityName,
  ChapterInput,
  ChapterResult,
  Choice,
  Companion,
  DialogueLine,
  Elicitation,
  Ending,
  Exit,
  Item,
  LedgerEntry,
  LedgerKind,
  SceneId,
  Snapshot,
  Speaker,
  Steer,
  Tone,
} from "./types";

interface State {
  scene: SceneId;
  phase: "situation" | "resolved" | "ended";
  beat: number;
  beatsLeft: number;
  trust: number;
  wounded: boolean;
  wrenHidden: boolean;
  wrenInventory: Item[];
  playerInventory: Item[];
  present: string[];
  flags: Set<string>;
  pending: Elicitation | null;
  ledger: LedgerEntry[];
  dialogue: DialogueLine[];
  narration: string;
  steer: Steer;
  ending: Ending | null;
  begun: boolean;
  waitingOnWren: boolean;
  waitingSince: number;
  lastWrenActAt: number;
  lastWrites: number[];
}

export interface ChapterOptions {
  now?: () => number;
  startScene?: SceneId;
  /** Who voices Wren. Defaults to authored lines; switch to "agent" once a WebMCP agent is attached. */
  companion?: Companion;
}

type Listener = (snapshot: Snapshot) => void;

/** The parts of state a player needs explained when they change. */
interface Probe {
  scene: SceneId;
  phase: State["phase"];
  wounded: boolean;
  trust: number;
  beatsLeft: number;
  capabilities: CapabilityName[];
  playerInventory: Item[];
}

export const WREN_SETTLE_MS = 3_000;
export const WREN_TURN_MS = 8_000;
const WREN_CROSSED = "wren_across";
const PLAYER_CROSSED = "player_across";
const CABINET_OPEN = "cabinet_open";
const COMMITTED = "follow_committed";

export class Chapter {
  private s: State;
  private readonly now: () => number;
  private readonly listeners = new Set<Listener>();
  private readonly answerWaiters = new Map<number, Array<(answer: string) => void>>();
  private nextId = 1;
  private companion: Companion;

  constructor(opts: ChapterOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.companion = opts.companion ?? "scripted";
    const scene = SCENES[opts.startScene ?? "underpass"];
    this.s = {
      scene: scene.id,
      phase: "situation",
      beat: 0,
      beatsLeft: scene.beats,
      trust: TRUST_START,
      wounded: false,
      wrenHidden: false,
      wrenInventory: ["crowbar"],
      playerInventory: [],
      present: [...scene.present],
      flags: new Set(),
      pending: null,
      ledger: [],
      dialogue: [],
      narration: "",
      steer: { seq: 0, instruction: scene.openingSteer, mood: scene.mood },
      ending: null,
      begun: false,
      waitingOnWren: false,
      waitingSince: 0,
      lastWrenActAt: 0,
      lastWrites: [],
    };
    if (scene.id === "underpass") for (const line of PROLOGUE) this.narrate(line);
    this.narrate(scene.opening);
    this.wrenSays("enter");
    this.write("chapter", "scene", `We sheltered under the ${scene.title.replace("The ", "").toLowerCase()}.`);
    this.s.lastWrites = [];
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Hand Wren's voice to an agent (or take it back). With an agent attached the
   * Chapter stops speaking her authored lines so the two never talk over each other.
   */
  setCompanion(companion: Companion) {
    if (this.companion === companion) return;
    this.companion = companion;
    if (companion === "scripted") this.clearWrenTurn();
    this.emit();
  }

  snapshot(): Snapshot {
    const scene = SCENES[this.s.scene];
    const choices = this.choices();
    return {
      scene: this.s.scene,
      sceneTitle: scene.title,
      sceneSubtitle: scene.subtitle,
      goal: scene.goal,
      phase: this.s.phase,
      beat: this.s.beat,
      beatsLeft: this.s.beatsLeft,
      trust: this.s.trust,
      trustThreshold: TRUST_THRESHOLD,
      wren: { wounded: this.s.wounded, inventory: [...this.s.wrenInventory], hidden: this.s.wrenHidden },
      player: { inventory: [...this.s.playerInventory] },
      present: [...this.s.present],
      choices,
      exits: this.s.phase === "resolved" ? [...scene.exits] : [],
      capabilities: capabilitiesFor({
        scene: this.s.scene,
        phase: this.s.phase,
        begun: this.s.begun,
        waitingOnWren: this.s.waitingOnWren,
        wounded: this.s.wounded,
        trust: this.s.trust,
        wrenInventory: this.s.wrenInventory,
        playerInventory: this.s.playerInventory,
        wrenChoices: choices.filter((c) => c.wrenOnly),
        exitCount: scene.exits.length,
      }),
      pending: this.s.pending ? { ...this.s.pending } : null,
      ledger: [...this.s.ledger],
      dialogue: [...this.s.dialogue],
      narration: this.s.narration,
      steer: { ...this.s.steer },
      ending: this.s.ending,
      begun: this.s.begun,
      waitingOnWren: this.s.waitingOnWren,
      lastWrites: [...this.s.lastWrites],
    };
  }

  /** Resolves when the elicitation is answered. Rejects if the signal aborts first. */
  waitForAnswer(elicitationId: number, signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.s.pending || this.s.pending.id !== elicitationId) {
        reject(new Error("No such pending question."));
        return;
      }
      const waiters = this.answerWaiters.get(elicitationId) ?? [];
      waiters.push(resolve);
      this.answerWaiters.set(elicitationId, waiters);
      signal?.addEventListener(
        "abort",
        () => {
          this.answerWaiters.delete(elicitationId);
          if (this.s.pending?.id === elicitationId) this.input({ kind: "cancel_ask", actor: "wren" });
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    });
  }

  input(i: ChapterInput): ChapterResult {
    this.s.lastWrites = [];
    const before = this.probe();
    const result = this.dispatch(i);
    this.explain(before);
    if (this.companion === "agent" && i.actor === "player" && result.ok) {
      if (i.kind === "decide" || i.kind === "move_to" || i.kind === "answer") {
        this.startWrenTurn();
        this.s.dialogue.push({ id: this.nextId++, speaker: "chapter", text: "Wren saw that." });
      } else if (i.kind === "begin") {
        this.s.dialogue.push({ id: this.nextId++, speaker: "chapter", text: "Wren saw that." });
      }
    }
    if (
      this.s.waitingOnWren &&
      i.actor === "wren" &&
      isWrenFloorAction(i.kind) &&
      (result.ok || result.refused)
    ) {
      this.s.lastWrenActAt = this.now();
    }
    this.emit();
    return result;
  }

  // ---------------------------------------------------------------------------

  private dispatch(i: ChapterInput): ChapterResult {
    if (this.s.ending && i.kind !== "recall" && i.kind !== "scene_state" && i.kind !== "say") {
      return this.fail("The chapter is over.");
    }
    if (
      !this.s.begun &&
      i.kind !== "begin" &&
      i.kind !== "scene_state" &&
      i.kind !== "recall" &&
      i.kind !== "say"
    ) {
      return this.fail("The page is still on Begin. Call begin first — that is the button on the title card.");
    }
    if (
      this.s.waitingOnWren &&
      i.actor === "player" &&
      (i.kind === "decide" || i.kind === "move_to")
    ) {
      return this.fail("Wren is still answering. Wait until she is done.");
    }
    switch (i.kind) {
      case "begin":
        return this.beginChapter();
      case "ready":
        return this.ready();
      case "scene_state":
        return this.ok(this.describeScene());
      case "recall":
        return this.ok(this.describeLedger());
      case "listen":
        return this.ok(SCENES[this.s.scene].listen);
      case "look":
        return this.look(i.direction, i.actor);
      case "say":
        return this.say(i.actor === "wren" ? "wren" : "narrator", i.text, i.tone);
      case "ask":
        return this.ask(i.question, i.options, i.seconds);
      case "answer":
        return this.answer(i.answer);
      case "cancel_ask":
        this.s.pending = null;
        return this.ok("The question is withdrawn.");
      case "hide":
        return this.hide();
      case "run":
        return this.run();
      case "open":
        return this.open(i.target, i.actor);
      case "give":
        return this.transfer(i.item, "wren", "player", i.actor);
      case "take":
        return this.transfer(i.item, "player", "wren", i.actor);
      case "follow_my_lead":
        return this.followMyLead();
      case "move_to":
        return this.moveTo(i.place, i.actor);
      case "decide":
        return this.decide(i.choice, i.actor);
      case "travel_ended":
        return this.lightGoes();
    }
  }

  // --- title card -------------------------------------------------------------

  private beginChapter(): ChapterResult {
    if (this.s.begun) return this.fail("Already begun.");
    this.s.begun = true;
    return this.ok("The world is live. The player has the cards. Wait for their first move, then react.");
  }

  private ready(): ChapterResult {
    if (!this.s.waitingOnWren) return this.ok("The player already has the cards.");
    this.clearWrenTurn();
    return this.ok("The player may choose again.");
  }

  /** After a player move, Wren has the floor until she finishes acting. */
  private startWrenTurn() {
    this.s.waitingOnWren = true;
    this.s.waitingSince = this.now();
    this.s.lastWrenActAt = 0;
  }

  private clearWrenTurn() {
    this.s.waitingOnWren = false;
    this.s.waitingSince = 0;
    this.s.lastWrenActAt = 0;
  }

  /**
   * Unlock the player's cards once Wren has gone idle, or if she never acted.
   * Game polls this while waitingOnWren. Tests call it after advancing `now`.
   */
  releaseIfIdle(busy: boolean) {
    if (!this.s.waitingOnWren) return;
    const t = this.now();
    // Always release after the turn clock, even if a tool execute is stuck.
    if (t - this.s.waitingSince >= WREN_TURN_MS) {
      this.clearWrenTurn();
      this.emit();
      return;
    }
    if (busy) return;
    const acted = this.s.lastWrenActAt > 0;
    if (acted && t - this.s.lastWrenActAt >= WREN_SETTLE_MS) {
      this.clearWrenTurn();
      this.emit();
    }
  }

  // --- perception -------------------------------------------------------------

  private look(direction: string, actor: Actor): ChapterResult {
    const scene = SCENES[this.s.scene];
    const response = pickLook(scene, direction);

    if (response.wounds && actor === "wren" && !this.s.wounded) {
      this.spendBeat();
      const text = "I can see the shape of him past the light. I am not going out there unless you send me.";
      this.write("wren", "look", text);
      if (this.s.beatsLeft === 0 && this.s.phase === "situation") {
        this.narrate(text + " " + this.momentPasses());
        return this.ok(this.s.narration);
      }
      this.narrate(text);
      return this.ok(text);
    }

    this.spendBeat();
    this.steer(response.steer);

    let narration = response.text;
    if (response.wounds && !this.s.wounded) {
      this.s.wounded = true;
      this.write("player", "wound", "You sent me out past the light. I went. I came back on one leg.", {
        feeling: "I did not say anything about it. I am still not saying anything about it.",
        trustDelta: -1,
        irreversible: true,
      });
      this.s.flags.add("looked_voice");
      this.s.present = ["you", "wren"];
      if (this.s.phase === "situation") this.resolve();
      this.wrenSays("wounded");
    } else {
      this.write("wren", "look", `I looked ${direction.trim() || "around"}. ${shorten(response.text)}`);
    }

    if (this.s.beatsLeft === 0 && this.s.phase === "situation") {
      narration += " " + this.momentPasses();
    }
    this.narrate(narration);
    return this.ok(narration);
  }

  // --- speech and questions -------------------------------------------------

  private say(speaker: Speaker, text: string, tone?: Tone): ChapterResult {
    const clean = text.trim();
    if (!clean) return this.fail("Nothing to say.");
    this.s.dialogue.push({ id: this.nextId++, speaker, text: clean, tone });
    return this.ok(clean);
  }

  private ask(question: string, options: string[], seconds: number): ChapterResult {
    if (this.s.pending) return this.fail("A question is already waiting for an answer.");
    const q = question.trim();
    if (!q) return this.fail("The question is empty.");
    const secs = Math.max(5, Math.min(20, Math.round(seconds || 15)));
    const openedAt = this.now();
    this.s.pending = {
      id: this.nextId++,
      question: q,
      options: options.map((o) => o.trim()).filter(Boolean).slice(0, 4),
      openedAt,
      expiresAt: openedAt + secs * 1000,
    };
    this.s.dialogue.push({ id: this.nextId++, speaker: "wren", text: q, tone: "urgent" });
    return this.ok(`Wren asks: "${q}" The player has ${secs} seconds.`);
  }

  private answer(answer: string): ChapterResult {
    const pending = this.s.pending;
    if (!pending) return this.fail("Nobody asked anything.");
    this.s.pending = null;
    const a = answer.trim() || "silence";
    let narration: string;
    if (a === "silence") {
      this.spendBeat();
      this.write("player", "silence", `I asked: "${pending.question}" You did not answer.`, {
        feeling: "I noticed.",
        trustDelta: -1,
        irreversible: true,
      });
      narration = "You did not answer. Wren noticed.";
      if (this.s.beatsLeft === 0 && this.s.phase === "situation") narration += " " + this.momentPasses();
    } else {
      this.write("player", "answer", `I asked: "${pending.question}" You said: "${a}"`);
      narration = `You answer: "${a}"`;
    }
    this.narrate(narration);
    const waiters = this.answerWaiters.get(pending.id) ?? [];
    this.answerWaiters.delete(pending.id);
    for (const w of waiters) w(a);
    return this.ok(narration);
  }

  // --- body -------------------------------------------------------------------

  private hide(): ChapterResult {
    if (this.s.phase === "situation") {
      return this.fail("The player decides this moment. It is on the cards. Wait, then react.");
    }
    const scene = SCENES[this.s.scene];
    this.s.wrenHidden = true;
    this.steer(scene.hide.steer);
    this.narrate(scene.hide.text);
    return this.ok(scene.hide.text);
  }

  private run(): ChapterResult {
    if (this.s.wounded) return this.fail("Wren cannot run on that leg.");
    if (this.s.scene === "bridge" && this.s.flags.has(PLAYER_CROSSED)) return this.decide("follow", "wren");
    if (this.s.phase === "situation") {
      return this.fail("The player decides this moment. It is on the cards. Wait, then react.");
    }
    const scene = SCENES[this.s.scene];
    this.steer(scene.run.steer);
    this.narrate(scene.run.text);
    return this.ok(scene.run.text);
  }

  private open(target: string, actor: Actor): ChapterResult {
    const scene = SCENES[this.s.scene];
    if (scene.openables.length === 0) return this.fail("There is nothing here to open.");
    if (!this.s.wrenInventory.includes("crowbar")) return this.fail("Wren does not have the crowbar.");
    const t = target.trim().toLowerCase();
    if (!scene.openables.some((o) => t.includes(o) || o.includes(t))) {
      return this.fail(`Nothing called "${target}" here. Try the cabinet.`);
    }
    if (this.s.flags.has(CABINET_OPEN)) return this.fail("The cabinet is already open.");
    this.s.flags.add(CABINET_OPEN);
    this.s.playerInventory.push("antibiotics");
    this.steer(
      "One survivor levers the steel cabinet open with a crowbar. The padlock breaks. Amber bottles spill onto the counter.",
    );
    const text =
      "Wren sets the crowbar in the hasp and leans on it. The padlock gives with a crack that fills the room. She hands you the bottle without looking at the label twice. In the back room, the breathing stops. Then footsteps.";
    this.write(actor, "item", actor === "player" ? "You asked me to open it. I did." : "I opened the cabinet. You needed it.", {
      feeling: "Whatever was in the back heard. I would do it again.",
      trustDelta: 1,
      irreversible: true,
    });
    this.s.present = ["you", "wren", "footsteps in the back room"];
    this.resolve();
    this.narrate(text);
    this.wrenSays("opened");
    return this.ok(text);
  }

  private transfer(itemRaw: string, from: "wren" | "player", to: "wren" | "player", actor: Actor): ChapterResult {
    const item = normalizeItem(itemRaw);
    if (!item) return this.fail(`Nothing called "${itemRaw}" here.`);
    const fromInv = from === "wren" ? this.s.wrenInventory : this.s.playerInventory;
    const toInv = to === "wren" ? this.s.wrenInventory : this.s.playerInventory;
    if (!fromInv.includes(item)) return this.fail(`${from === "wren" ? "Wren does" : "You do"} not have the ${item}.`);
    fromInv.splice(fromInv.indexOf(item), 1);
    toInv.push(item);

    let text: string;
    if (to === "player") {
      if (actor === "player") {
        const delta = this.s.wounded ? -2 : -1;
        this.write("player", "trust", `You took the ${item} out of my hands.`, {
          feeling: this.s.wounded ? "I could barely stand. You did not ask." : "You did not ask.",
          trustDelta: delta,
          irreversible: true,
        });
        text = this.s.wounded
          ? `You take the ${item}. Wren lets you, because she cannot do much else on that leg. She does not look at you.`
          : `You take the ${item}. Wren lets go a half-second late.`;
        this.narrate(text);
        if (item === "crowbar") this.wrenSays(this.s.wounded ? "crowbar_taken_wounded" : "crowbar_taken");
        return this.ok(text);
      } else {
        this.write("wren", "item", `I handed you the ${item}.`);
        text = `Wren holds out the ${item}. You take it.`;
      }
    } else {
      if (actor === "wren") {
        this.write("wren", "item", `I took the ${item} back.`, {
          feeling: item === "antibiotics" ? "For you. Later. When you would not take it." : undefined,
        });
        text = `Wren takes the ${item} back.`;
      } else {
        this.write("player", "item", `You gave me the ${item} back.`, { feeling: "Noted." });
        text = `You hand Wren the ${item}. She weighs it once and says nothing.`;
      }
    }
    this.narrate(text);
    return this.ok(text);
  }

  private followMyLead(): ChapterResult {
    if (this.s.trust < TRUST_THRESHOLD) {
      const citation = this.worstMoment();
      return this.refuse("No. Not blind. Not after " + where(citation) + ".", citation);
    }
    this.s.flags.add(COMMITTED);
    const text = this.s.scene === "bridge" ? "Wren: \"Go. I'm right behind you.\"" : "Wren nods. \"Your call. I'm with you.\"";
    this.s.dialogue.push({ id: this.nextId++, speaker: "wren", text: text.replace(/^Wren: /, "").replace(/"/g, ""), tone: "warm" });
    this.write("wren", "trust", "I told you I would follow your lead.", { feeling: "I meant it." });
    return this.ok(text);
  }

  // --- story ------------------------------------------------------------------

  private moveTo(place: string, actor: Actor): ChapterResult {
    if (actor === "wren") return this.fail("The player picks the way on. It is on the cards.");
    if (this.s.phase !== "resolved") return this.fail("Not yet. The moment here is not finished.");
    const scene = SCENES[this.s.scene];
    const p = place.trim().toLowerCase();
    const exit = scene.exits.find((e) => e.id === p || e.label.toLowerCase().includes(p) || p.includes(e.id));
    if (!exit) return this.fail(`No way out called "${place}". Exits: ${scene.exits.map((e) => e.id).join(", ")}.`);
    return this.takeExit(exit);
  }

  private takeExit(exit: Exit): ChapterResult {
    if (exit.to === "together" || exit.to === "alone") return this.end(exit.to);
    this.write("chapter", "scene", `We left by ${exit.label.toLowerCase().replace(/^(take|follow|out|down) /, "")}.`);
    this.enterScene(exit.to);
    return this.ok(this.s.narration);
  }

  private decide(choiceId: string, actor: Actor): ChapterResult {
    if (this.s.phase !== "situation") return this.fail("There is nothing left to decide here.");
    const id = choiceId.trim().toLowerCase().replace(/[\s-]+/g, "_");
    const choice = this.choices().find((c) => c.id === id || c.label.toLowerCase() === choiceId.trim().toLowerCase());
    if (!choice) return this.fail(`No choice called "${choiceId}". Choices: ${this.choices().map((c) => c.id).join(", ")}.`);
    if (choice.wrenOnly && actor === "player") return this.fail(`Only Wren can choose "${choice.id}".`);
    if (!choice.wrenOnly && actor === "wren") {
      return this.fail("That choice is the player's. It is on the cards. Wait for them, then react.");
    }

    switch (this.s.scene) {
      case "underpass":
        return this.decideUnderpass(choice.id, actor);
      case "pharmacy":
        return this.decidePharmacy(choice.id, actor);
      case "bridge":
        return this.decideBridge(choice.id, actor);
    }
  }

  private decideUnderpass(id: string, actor: Actor): ChapterResult {
    switch (id) {
      case "answer": {
        this.s.flags.add("answered");
        this.steer("A man limps into the edge of the lamplight with his hands raised, soaked, one leg dragging.");
        this.write(actor, "choice", actor === "player" ? "You answered the voice." : "I answered the voice.", {
          feeling: actor === "player" ? "I would not have. He came anyway." : "Someone had to.",
          irreversible: true,
        });
        this.s.present = ["you", "wren", "a man with a broken leg"];
        this.resolve();
        const text =
          "You call out. The voice stops. Then footsteps in the water, uneven. A man comes to the edge of the light with his hands up and one leg wrong under him. He says thank you twice. Behind him, further out, something else stops moving to listen.";
        this.narrate(text);
        if (actor === "player") this.wrenSays("answer");
        return this.ok(text);
      }
      case "stay_silent": {
        this.s.flags.add("silent");
        this.steer("The two survivors stay motionless under the lamp. Rain falls harder. Nothing approaches.");
        this.write(actor, "choice", actor === "player" ? "You stayed silent. So did I." : "I kept us quiet.", {
          feeling: "I don't know if that was right. It was quiet, after.",
          irreversible: true,
        });
        this.s.present = ["you", "wren"];
        this.resolve();
        const text =
          "You say nothing. Wren says nothing. The voice calls three more times, each one further away or weaker, you cannot tell which. Then it does not.";
        this.narrate(text);
        if (actor === "player") this.wrenSays("stay_silent");
        return this.ok(text);
      }
      case "send_wren":
        return this.look("toward the voice", "player");
    }
    return this.fail("Unknown choice.");
  }

  private decidePharmacy(id: string, actor: Actor): ChapterResult {
    switch (id) {
      case "take_crowbar":
        return this.transfer("crowbar", "wren", "player", "player");
      case "give_back":
        return this.transfer("crowbar", "player", "wren", "player");
      case "let_wren_open":
        return this.open("cabinet", "player");
      case "force_cabinet": {
        if (!this.s.playerInventory.includes("crowbar")) return this.fail("You do not have the crowbar.");
        if (this.s.flags.has(CABINET_OPEN)) return this.fail("The cabinet is already open.");
        this.s.flags.add(CABINET_OPEN);
        this.s.playerInventory.push("antibiotics");
        this.steer("A survivor forces the steel cabinet open with a crowbar. The lock snaps. Bottles fall.");
        this.write("player", "choice", "You forced the cabinet yourself.", {
          feeling: this.s.wounded ? "With my crowbar. While I held the counter to stay up." : "Fine. It got done.",
          irreversible: true,
        });
        this.s.present = ["you", "wren", "footsteps in the back room"];
        this.resolve();
        const text =
          "You put the bar in the hasp and lean until the lock snaps. Bottles go everywhere. You find the one you need by the shape of the name. In the back room the breathing stops, and then there are footsteps.";
        this.narrate(text);
        return this.ok(text);
      }
      case "leave_it": {
        this.s.flags.add("no_meds");
        this.steer("The two survivors turn away from the cabinet and walk toward the smoke-filled street.");
        this.write(actor, "choice", actor === "player" ? "You left the medicine behind." : "I said we should leave it.", {
          feeling: "Your arm. I did not say it out loud.",
          irreversible: true,
        });
        this.resolve();
        const text = "You leave it. The cabinet stays shut behind you. Your arm has its own pulse now.";
        this.narrate(text);
        if (actor === "player") this.wrenSays("leave_it");
        return this.ok(text);
      }
    }
    return this.fail("Unknown choice.");
  }

  private decideBridge(id: string, actor: Actor): ChapterResult {
    switch (id) {
      case "wait": {
        this.spendBeat();
        this.steer("The wind rises. Cables sing. The two survivors do not move.");
        const text = "You wait. The wind does not drop. The engines behind you get closer instead.";
        if (this.s.beatsLeft === 0) return this.lightGoes();
        this.narrate(text);
        this.wrenSays("wait");
        return this.ok(text);
      }
      case "cross_first": {
        if (this.s.trust < TRUST_THRESHOLD) {
          const citation = this.worstMoment();
          return this.refuse("No. I am not turning my back to you on that span. Not after " + where(citation) + ".", citation);
        }
        this.s.flags.add(WREN_CROSSED);
        this.steer("One survivor walks out onto the sagging bridge deck, slowly, and reaches the far side.");
        this.wrenSays("cross_first");
        this.write(actor, "choice", actor === "player" ? "You asked me to go first. I went." : "I went first.", {
          feeling: "I could feel you watching the whole way.",
          irreversible: true,
        });
        const text = this.s.wounded
          ? "Wren goes. Slowly, on the bad leg, one hand on the cable the whole way. The deck moves under her like something breathing. She makes the far side and sits down where she stands and waves you on."
          : "Wren goes. The deck moves under her like something breathing. She does not stop. On the far side she turns and waves you on.";
        this.narrate(text);
        return this.ok(text);
      }
      case "cross_after":
        return this.end("together");
      case "player_first": {
        this.s.flags.add(PLAYER_CROSSED);
        this.steer("One survivor walks out onto the sagging bridge deck while the other stays behind, watching.");
        this.write("player", "choice", "You went first.", { irreversible: true });
        this.wrenSays(this.s.flags.has(COMMITTED) || this.s.trust >= TRUST_THRESHOLD ? "you_first" : "you_first_low");
        if (this.s.flags.has(COMMITTED)) {
          this.narrate("You cross. The deck moves. You do not look back until the far side, and when you do, Wren is already on the span.");
          return this.end("together");
        }
        const text =
          "You cross. The deck moves. Twice you stop and hold the cable and wait for it to be still. On the far side you turn. Wren is where you left her, at the foot of the span, and the light is going.";
        this.narrate(text);
        return this.ok(text);
      }
      case "follow": {
        if (this.s.trust < TRUST_THRESHOLD) {
          const citation = this.worstMoment();
          const result = this.refuse("No. Not after " + where(citation) + ". You go on.", citation);
          this.end("alone");
          return { ...result, snapshot: this.snapshot() };
        }
        this.write("wren", "choice", "I followed you across.", { feeling: "I did not have to think about it.", irreversible: true });
        this.wrenSays("follow");
        return this.end("together");
      }
      case "stay": {
        this.write("wren", "choice", "I stayed on this side.", {
          feeling: "You will be faster without me. That is not the reason.",
          irreversible: true,
        });
        return this.end("alone");
      }
    }
    return this.fail("Unknown choice.");
  }

  private end(ending: Ending): ChapterResult {
    this.s.ending = ending;
    this.s.phase = "ended";
    this.s.pending = null;
    this.clearWrenTurn();
    this.s.steer = { seq: this.s.steer.seq + 1, instruction: "", mood: "black" };
    const text =
      ending === "together"
        ? "The span holds. Twice. On the far side there are trees and a road and no smoke. Wren sits down hard on the asphalt and laughs, once, for the first time since the bridge before this one. You are still together."
        : "You are on the far side. Wren is not. She lifts one hand, not a wave exactly, and then the light goes and there is only the span, and the wind, and you. You are alone.";
    this.write("chapter", "ending", ending === "together" ? "We crossed together." : "You crossed. I did not.", {
      irreversible: true,
    });
    this.narrate(text);
    return this.ok(text);
  }

  private lightGoes(): ChapterResult {
    if (this.s.ending) return this.fail("The chapter is over.");
    const scene = SCENES[this.s.scene];
    this.s.pending = null;
    if (this.s.scene === "bridge") {
      this.narrate(scene.lightGoes);
      this.wrenSays("light_goes");
      this.write("chapter", "scene", "The light went before either of us moved.", { irreversible: true });
      return this.end("alone");
    }
    this.resolve();
    this.write("chapter", "scene", "The light went.", { irreversible: true });
    this.narrate(scene.lightGoes);
    this.wrenSays("light_goes");
    return this.ok(scene.lightGoes);
  }

  // --- helpers ----------------------------------------------------------------

  private choices(): Choice[] {
    const scene = SCENES[this.s.scene];
    if (this.s.phase !== "situation") return [];
    const f = this.s.flags;
    switch (this.s.scene) {
      case "underpass":
        return scene.choices;
      case "pharmacy": {
        const wrenHas = this.s.wrenInventory.includes("crowbar");
        const playerHas = this.s.playerInventory.includes("crowbar");
        const list: Choice[] = [];
        if (wrenHas) list.push(scene.choices.find((c) => c.id === "take_crowbar")!);
        if (wrenHas) list.push(scene.choices.find((c) => c.id === "let_wren_open")!);
        if (playerHas) list.push(scene.choices.find((c) => c.id === "force_cabinet")!);
        if (playerHas)
          list.push({
            id: "give_back",
            label: "Give the crowbar back to Wren",
            hint: "Hand it back to her. It does not undo taking it.",
            playerOnly: true,
          });
        list.push(scene.choices.find((c) => c.id === "leave_it")!);
        return list;
      }
      case "bridge": {
        if (f.has(WREN_CROSSED)) {
          return [{ id: "cross_after", label: "Cross after her", hint: "You follow Wren across the span.", playerOnly: true }];
        }
        if (f.has(PLAYER_CROSSED)) {
          return [
            { id: "follow", label: "Follow", hint: "Wren crosses after the player. She may refuse.", wrenOnly: true },
            { id: "stay", label: "Stay", hint: "Wren stays on this side.", wrenOnly: true },
          ];
        }
        return scene.choices;
      }
    }
  }

  private enterScene(id: SceneId) {
    const scene = SCENES[id];
    this.s.scene = id;
    this.s.phase = "situation";
    this.s.beatsLeft = scene.beats;
    this.s.present = [...scene.present];
    this.s.wrenHidden = false;
    this.s.pending = null;
    this.s.steer = { seq: this.s.steer.seq + 1, instruction: scene.openingSteer, mood: scene.mood };
    this.narrate(this.s.wounded && scene.openingWounded ? scene.openingWounded : scene.opening);
    this.wrenSays(this.s.wounded && scene.wren.enter_wounded ? "enter_wounded" : "enter");
  }

  /** Wren's authored line for a story event. Silent when an agent is voicing her. */
  private wrenSays(key: string) {
    if (this.companion !== "scripted") return;
    const line = SCENES[this.s.scene].wren[key];
    if (!line) return;
    this.s.dialogue.push({ id: this.nextId++, speaker: "wren", text: line });
  }

  private probe(): Probe {
    return {
      scene: this.s.scene,
      phase: this.s.phase,
      wounded: this.s.wounded,
      trust: this.s.trust,
      beatsLeft: this.s.beatsLeft,
      capabilities: this.snapshot().capabilities,
      playerInventory: [...this.s.playerInventory],
    };
  }

  /**
   * After every input, say in plain words what just changed for the player:
   * trust, the wound, what Wren can still do, and whether the moment is decided.
   * Scene changes are explained by the scene card instead.
   */
  private explain(before: Probe) {
    const after = this.probe();
    if (after.scene !== before.scene || this.s.ending) return;
    const lines: string[] = [];

    if (!before.wounded && after.wounded) {
      lines.push("Wren is hurt. She cannot run anymore, for the rest of the story.");
    }
    if (after.playerInventory.includes("antibiotics") && !before.playerInventory.includes("antibiotics")) {
      lines.push("You have the antibiotics. Your arm will hold.");
    }
    if (after.trust !== before.trust) {
      const dir = after.trust > before.trust ? "rose" : "fell";
      let line = `Trust ${dir} to ${after.trust} of 6.`;
      if (before.trust >= TRUST_THRESHOLD && after.trust < TRUST_THRESHOLD) {
        line += " Below 3, Wren stops doing things on your word alone.";
      } else if (before.trust < TRUST_THRESHOLD && after.trust >= TRUST_THRESHOLD) {
        line += " At 3 or more, Wren will follow your lead again.";
      }
      lines.push(line);
    }
    if (this.companion === "agent") {
      const lost = before.capabilities.filter((c) => !after.capabilities.includes(c));
      const gained = after.capabilities.filter((c) => !before.capabilities.includes(c));
      // Begin swapping the title-card tools for the body is not a story event.
      if (!lost.includes("begin")) {
        if (lost.length) lines.push(`Wren can no longer: ${lost.join(", ")}.`);
        if (gained.length) lines.push(`Wren can now: ${gained.join(", ")}.`);
      }
    }
    if (before.phase === "situation" && after.phase === "resolved") {
      const exits = SCENES[after.scene].exits;
      lines.push(exits.length ? "This moment is decided. Choose a way on." : "This moment is decided.");
    } else if (after.phase === "situation" && after.beatsLeft < before.beatsLeft && after.beatsLeft > 0) {
      lines.push(
        `${after.beatsLeft} ${after.beatsLeft === 1 ? "moment" : "moments"} left before this passes without you.`,
      );
    }

    for (const text of lines) this.s.dialogue.push({ id: this.nextId++, speaker: "chapter", text });
  }

  private resolve() {
    if (this.s.phase === "situation") this.s.phase = "resolved";
  }

  private momentPasses(): string {
    const scene = SCENES[this.s.scene];
    this.resolve();
    this.s.present = ["you", "wren"];
    this.write("chapter", "scene", "The moment passed while we were deciding.", { feeling: "That is also a choice." });
    return scene.lightGoes;
  }

  private spendBeat() {
    this.s.beat += 1;
    this.s.beatsLeft = Math.max(0, this.s.beatsLeft - 1);
  }

  private steer(instruction: string) {
    this.s.steer = { seq: this.s.steer.seq + 1, instruction, mood: SCENES[this.s.scene].mood };
  }

  private narrate(text: string) {
    this.s.narration = text;
    this.s.dialogue.push({ id: this.nextId++, speaker: "narrator", text });
  }

  private write(
    actor: Actor | "chapter",
    kind: LedgerKind,
    text: string,
    extra: { feeling?: string; trustDelta?: number; irreversible?: boolean } = {},
  ): LedgerEntry {
    const entry: LedgerEntry = {
      id: this.nextId++,
      scene: this.s.scene,
      beat: this.s.beat,
      actor,
      kind,
      text,
      feeling: extra.feeling,
      trustDelta: extra.trustDelta,
      irreversible: extra.irreversible,
    };
    if (extra.trustDelta) this.s.trust = Math.max(0, Math.min(6, this.s.trust + extra.trustDelta));
    this.s.ledger.push(entry);
    this.s.lastWrites.push(entry.id);
    return entry;
  }

  private worstMoment(): LedgerEntry {
    const negative = this.s.ledger.filter((e) => (e.trustDelta ?? 0) < 0);
    if (negative.length === 0) return this.s.ledger[this.s.ledger.length - 1];
    return negative.reduce((worst, e) => ((e.trustDelta ?? 0) < (worst.trustDelta ?? 0) ? e : worst), negative[0]);
  }

  private refuse(reason: string, citation: LedgerEntry): ChapterResult {
    this.write("wren", "refusal", reason, { feeling: `Because: "${citation.text}"`, irreversible: true });
    this.s.dialogue.push({ id: this.nextId++, speaker: "wren", text: reason, tone: "bitter" });
    return { ok: false, refused: true, reason, citation, narration: reason, snapshot: this.snapshot() };
  }

  private describeScene(): string {
    const snap = this.snapshot();
    const lines = [
      `Scene: ${snap.sceneTitle}. ${snap.sceneSubtitle}`,
      `Situation: ${snap.narration}`,
      `Present: ${snap.present.join(", ")}.`,
      `Wren: ${snap.wren.wounded ? "wounded, cannot run" : "unhurt"}; carrying ${snap.wren.inventory.join(", ") || "nothing"}.`,
      `Player carrying: ${snap.player.inventory.join(", ") || "nothing"}.`,
      `Trust: ${snap.trust} of 6 (threshold ${snap.trustThreshold}).`,
      `Beats left before the moment passes: ${snap.beatsLeft}.`,
    ];
    if (!snap.begun) {
      lines.push("The page is still on the title card. Call begin — that is the same as the Begin button. Then wait for the player's first card.");
    } else if (snap.waitingOnWren) {
      lines.push("The player's next cards are hidden. Finish looking and speaking, then call ready so they can choose again.");
    } else {
      lines.push("The player decides with the cards on the page. Do not take those choices. After they move, react.");
    }
    const wrenChoices = snap.choices.filter((c) => c.wrenOnly);
    if (wrenChoices.length) lines.push(`Decisions Wren can make: ${wrenChoices.map((c) => `${c.id} (${c.hint})`).join("; ")}.`);
    const playerChoices = snap.choices.filter((c) => !c.wrenOnly);
    if (playerChoices.length) {
      lines.push(`The player's cards right now: ${playerChoices.map((c) => `${c.id} (${c.hint})`).join("; ")}.`);
    }
    if (snap.exits.length) lines.push(`Exits: ${snap.exits.map((e) => `${e.id} (${e.label})`).join("; ")}.`);
    if (snap.pending) lines.push(`Waiting on the player: "${snap.pending.question}"`);
    if (snap.ending) lines.push(`Ending: ${snap.ending}.`);
    lines.push(`What Wren can do right now: ${snap.capabilities.join(", ")}.`);
    return lines.join("\n");
  }

  private describeLedger(): string {
    if (this.s.ledger.length === 0) return "Nothing yet.";
    return this.s.ledger
      .map((e) => {
        const t = e.trustDelta ? ` (trust ${e.trustDelta > 0 ? "+" : ""}${e.trustDelta})` : "";
        const f = e.feeling ? ` — ${e.feeling}` : "";
        return `[${SCENES[e.scene].title}, beat ${e.beat}] ${e.text}${t}${f}`;
      })
      .join("\n")
      .concat(`\nTrust now: ${this.s.trust} of 6.`);
  }

  private ok(narration: string): ChapterResult {
    return { ok: true, narration, snapshot: this.snapshot() };
  }

  private fail(error: string): ChapterResult {
    return { ok: false, error, narration: error, snapshot: this.snapshot() };
  }

  private emit() {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }
}

const WREN_FLOOR = new Set<ChapterInput["kind"]>([
  "look",
  "listen",
  "say",
  "ask",
  "hide",
  "run",
  "open",
  "give",
  "take",
  "follow_my_lead",
  "decide",
]);

function isWrenFloorAction(kind: ChapterInput["kind"]): boolean {
  return WREN_FLOOR.has(kind);
}

function pickLook(scene: SceneData, direction: string): LookResponse {
  const d = direction.toLowerCase();
  for (const r of scene.looks) {
    if (r.match.length && r.match.some((m) => d.includes(m))) return r;
  }
  return scene.looks[scene.looks.length - 1];
}

function normalizeItem(raw: string): Item | null {
  const r = raw.trim().toLowerCase();
  if (r.includes("crow") || r.includes("bar")) return "crowbar";
  if (r.includes("anti") || r.includes("med") || r.includes("pill") || r.includes("bottle")) return "antibiotics";
  return null;
}

function where(entry: LedgerEntry): string {
  return SCENES[entry.scene].title.toLowerCase();
}

function shorten(text: string): string {
  const first = text.split(". ")[0];
  return first.endsWith(".") ? first : first + ".";
}
