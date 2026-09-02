import type { Choice, Exit, Mood, SceneId } from "./types";

export interface LookResponse {
  /** Lower-case words; any match selects this response. Empty = default. */
  match: string[];
  text: string;
  /** World instruction when Wren looks this way. */
  steer: string;
  /** Scene 1 only: leaving the light wounds her. */
  wounds?: boolean;
}

export interface SceneData {
  id: SceneId;
  title: string;
  subtitle: string;
  /** What the player needs here, in one plain sentence. Shown in the HUD. */
  goal: string;
  /**
   * Wren's authored lines, used when no agent is playing her. Keys are story
   * events; the Chapter speaks the matching line at that moment.
   */
  wren: Record<string, string>;
  mood: Mood;
  /** Prompt used once to create the persistent Directing world. */
  worldPrompt: string;
  /** First instruction sent when the travel starts. */
  openingSteer: string;
  opening: string;
  openingWounded?: string;
  present: string[];
  beats: number;
  choices: Choice[];
  exits: Exit[];
  looks: LookResponse[];
  listen: string;
  hide: { text: string; steer: string };
  run: { text: string; steer: string };
  /** Targets `open` accepts. */
  openables: string[];
  /** What happens when the beats or the travel run out. */
  lightGoes: string;
}

export const TRUST_START = 3;
export const TRUST_THRESHOLD = 3;

/** Spoken once, before Scene 1, so the player knows who they are and what they need. */
export const PROLOGUE: string[] = [
  "Three days ago the bridge out of the city came down with most of the people you knew on it. You were not on it. Wren pulled you out of the water.",
  "You have a cut on your arm that has stopped being a cut and started being a fever. You need antibiotics, and then you need the one bridge that is still standing, on the far side of town.",
  "Wren goes where you go. Whether she keeps doing that is up to you.",
];

export const SCENES: Record<SceneId, SceneData> = {
  underpass: {
    id: "underpass",
    title: "The Underpass",
    subtitle: "Night. Rain.",
    goal: "Get through the night without being found. Decide what to do about the voice.",
    wren: {
      enter: "Don't answer it. I mean it. Whoever that is, they're not alone out there, and they know exactly what a light means.",
      answer: "Fine. You've told them where we are. If they come in wrong, we run, and I'm not carrying anyone.",
      stay_silent: "Good. Hate it as much as you like. Hating it is free.",
      looked: "There's a man out there with a broken leg. Behind him, something moving. I came back. That's my report.",
      wounded: "I'm fine. Rebar under the water. Don't make a thing of it.",
      light_goes: "Lamp's gone. Come on. We're leaving while we still can.",
    },
    mood: "night_rain",
    worldPrompt:
      "A dark concrete highway underpass at night in heavy rain, seen from inside looking out. Two survivors shelter against a graffiti-covered pillar, backs to the camera, faces unseen. A single failing sodium lamp casts orange light that ends sharply at the edge of the shelter; beyond it only rain and blackness. Wet asphalt reflects the light. Stylized, painterly, high contrast, cinematic, slow camera. No text, no logos.",
    openingSteer:
      "Hold the shot on the two survivors under the lamp. Rain falls harder. Beyond the edge of the light, nothing is visible.",
    opening:
      "Concrete overhead. Rain in sheets past the edge of the light. You and Wren against the pillar, not talking. Then, from somewhere past where the light ends, a voice: \"Please. Is someone there? I'm hurt.\"",
    present: ["you", "wren", "a voice in the dark"],
    beats: 3,
    choices: [
      {
        id: "answer",
        label: "Answer the voice",
        hint: "Call back into the dark. Whoever it is will come to the light. Wren won't like it.",
        playerOnly: true,
      },
      {
        id: "stay_silent",
        label: "Stay silent",
        hint: "Say nothing and wait for the voice to stop. Safer. Costs you something anyway.",
        playerOnly: true,
      },
      {
        id: "send_wren",
        label: "Send Wren to look",
        hint: "Wren leaves the light to see who is out there. Something could happen to her.",
        playerOnly: true,
      },
    ],
    exits: [
      { id: "road", label: "Take the flooded road", to: "pharmacy" },
      { id: "rail", label: "Follow the rail line", to: "pharmacy" },
    ],
    looks: [
      {
        match: ["voice", "dark", "out", "edge", "stranger", "rain", "ahead", "forward", "toward"],
        text:
          "Wren steps past the lamp. Rain takes her outline. A shape on the ground, twenty paces out: a man, one leg wrong under him, hands up, saying please. Behind him the dark moves. Wren turns to come back and her foot finds rebar under the water. She goes down hard. When she reaches the light again she is holding her shin and not saying anything about it.",
        steer:
          "The camera follows one survivor as she walks out of the lamplight into the rain. A figure lies on the wet ground ahead with hands raised. She stumbles and falls. She limps back toward the light.",
        wounds: true,
      },
      {
        match: ["up", "ceiling", "overhead", "above"],
        text: "Concrete, sweating. A drainage grate with water pouring through it like a tap left on.",
        steer: "The camera tilts up to the underpass ceiling where water pours through a rusted grate.",
      },
      {
        match: ["behind", "back", "tunnel", "way we came"],
        text: "The way you came: the underpass runs on into black. Nothing moving. Your footprints already filling with water.",
        steer: "The camera turns to look back down the empty underpass tunnel into darkness.",
      },
      {
        match: [],
        text: "Rain. The edge of the light. Wet asphalt reflecting orange. Nothing else, yet.",
        steer: "Slow pan across the rain at the edge of the lamplight.",
      },
    ],
    listen:
      "Rain on concrete. Under it, the voice again, weaker: \"Please.\" And under that, further out, something heavy moving through water. More than one something.",
    hide: {
      text: "Wren pulls you both back behind the pillar, out of the lamp. The voice keeps calling. You watch the light with nobody in it.",
      steer: "The two survivors crouch behind the pillar in shadow. The pool of lamplight is empty.",
    },
    run: {
      text: "Wren pulls you out the far side of the underpass, into the rain, away from the voice. You do not look back.",
      steer: "The two survivors run out the far end of the underpass into the rain.",
    },
    openables: [],
    lightGoes:
      "The lamp buzzes, dims, and goes. The voice has stopped at some point; you did not notice when. You are still here, in the dark.",
  },

  pharmacy: {
    id: "pharmacy",
    title: "The Pharmacy",
    subtitle: "Dawn. Smoke.",
    goal: "Get the antibiotics out of the locked cabinet. Someone is in the back room.",
    wren: {
      enter: "That's the one. Second shelf. Give me a second with the lock and keep your eyes on that doorway.",
      enter_wounded: "That's the one. Second shelf. Leg's fine. Watch the doorway, not me.",
      crowbar_taken: "Okay. You've got it. Go on then.",
      crowbar_taken_wounded: "Right. Take the crowbar off the one who can't run. Go on then.",
      opened: "There. Take the whole bottle, not a handful. We're not coming back here.",
      leave_it: "You're leaving it. With your arm like that. Fine. It's your arm.",
      light_goes: "Can't see the lock anymore. We're done here.",
    },
    mood: "dawn_smoke",
    worldPrompt:
      "Interior of a looted pharmacy at dawn, thin grey smoke drifting through broken front windows. Overturned shelves, pill bottles on the floor, a long counter, and behind it a tall locked metal medicine cabinet. A dark doorway leads to a back room. Cold blue morning light from the front, deep shadow at the back. Stylized, painterly, cinematic, slow camera. Two survivors stand near the counter, seen from behind. No text, no logos.",
    openingSteer:
      "Hold on the two survivors facing the locked cabinet behind the counter. Smoke drifts. The back doorway stays dark.",
    opening:
      "Dawn through smoke. The pharmacy's front is gone. Your arm is hot to the touch now; you need what is behind the counter, and the cabinet is locked. Wren has the crowbar. Something shifts in the back room.",
    openingWounded:
      "Dawn through smoke. The pharmacy's front is gone. Your arm is hot to the touch now; you need what is behind the counter, and the cabinet is locked. Wren has the crowbar. She is limping badly and has not said a word about the underpass. Something shifts in the back room.",
    present: ["you", "wren", "something in the back room"],
    beats: 3,
    choices: [
      {
        id: "take_crowbar",
        label: "Take the crowbar from Wren",
        hint: "Take it out of her hands and do it yourself. If she is hurt, she will remember this.",
        playerOnly: true,
      },
      {
        id: "force_cabinet",
        label: "Force the cabinet yourself",
        hint: "Only works if the crowbar is in your hands.",
        playerOnly: true,
      },
      {
        id: "let_wren_open",
        label: "Ask Wren to open the cabinet",
        hint: "She has the crowbar. Let her do it. She is good at this.",
        playerOnly: true,
      },
      {
        id: "leave_it",
        label: "Leave without the medicine",
        hint: "Walk away from the cabinet. Your arm will get worse.",
        playerOnly: true,
      },
    ],
    exits: [
      { id: "alley", label: "Out through the alley", to: "bridge" },
      { id: "boulevard", label: "Down the boulevard", to: "bridge" },
    ],
    looks: [
      {
        match: ["back", "room", "doorway", "dark", "noise", "sound"],
        text:
          "Wren leans into the back doorway. A man on the floor between the stock shelves, the same wrong leg, the same hands. He got here first. He is breathing like someone counting. He does not ask for help this time.",
        steer:
          "The camera moves slowly into the dark back room of the pharmacy. A man lies on the floor between stock shelves, barely moving.",
      },
      {
        match: ["cabinet", "counter", "lock", "medicine"],
        text:
          "Steel cabinet, a padlock through the hasp, a rack of amber bottles behind wired glass. The one you need is on the second shelf. Wren reads the label aloud without being asked.",
        steer: "Close on the locked steel medicine cabinet behind the counter, amber bottles behind wired glass.",
      },
      {
        match: ["out", "street", "front", "window", "smoke"],
        text: "Through the broken front: smoke lying flat over the street, and past it, the grey line of the river and the bridge.",
        steer: "The camera looks out through the shattered pharmacy front at a smoke-covered street and a distant bridge.",
      },
      {
        match: [],
        text: "Shelves on their sides. Pills underfoot like gravel. Grey light coming in low through the smoke.",
        steer: "Slow pan across the looted pharmacy interior in smoky dawn light.",
      },
    ],
    listen:
      "From the back room: breathing, slow and shallow. Someone counting to stay awake. Outside, far off, engines.",
    hide: {
      text: "Wren pulls you down behind the counter. The breathing in the back stops, then starts again. You wait until your legs shake.",
      steer: "The two survivors crouch behind the pharmacy counter in shadow, listening.",
    },
    run: {
      text: "Wren grabs your good arm and takes you out through the front, through the smoke, not stopping until the pharmacy is a shape behind you.",
      steer: "The two survivors run out of the pharmacy through the broken front into the smoke.",
    },
    openables: ["cabinet", "medicine cabinet", "the cabinet", "padlock", "lock"],
    lightGoes:
      "The smoke thickens until the cabinet is a shape and then not even that. You are still here, with what you have.",
  },

  bridge: {
    id: "bridge",
    title: "The Bridge",
    subtitle: "Dusk. Wind.",
    goal: "Cross the river. The bridge holds one at a time. Someone goes first.",
    wren: {
      enter: "One at a time. That's not me being careful, that's the bridge telling you.",
      enter_wounded: "One at a time. And before you ask: yes, I can make it across on this leg. I'd rather not do it second.",
      cross_first: "Alright. Watch the left cables. If it goes, don't follow me. I mean that.",
      you_first: "Go. I'll be right behind you.",
      you_first_low: "Go on, then. I'll see.",
      wait: "The wind isn't dropping. It's dusk on a river. It never drops.",
      follow: "I'm coming. Don't stop on the deck.",
      light_goes: "That's it. That's the light. We should have gone.",
    },
    mood: "dusk_wind",
    worldPrompt:
      "A long damaged steel truss bridge over a wide grey river at dusk, strong wind, the deck sagging in the middle with sections of railing missing. Two survivors stand at the near end, small against the span, seen from behind. Deep orange and violet sky, smoke on the far horizon behind them. Stylized, painterly, cinematic, slow camera. No text, no logos.",
    openingSteer:
      "Hold on the two survivors at the foot of the sagging bridge. Wind pulls at their clothes. The span creaks.",
    opening:
      "The span sags in the middle like a rope. It will hold one at a time, or not at all. Wind pulls at you. Behind you, the smoke has followed. One of you goes first. Wren is looking at you.",
    openingWounded:
      "The span sags in the middle like a rope. It will hold one at a time, or not at all. Wind pulls at you. Behind you, the smoke has followed. One of you goes first. Wren shifts her weight off the bad leg and looks at you.",
    present: ["you", "wren"],
    beats: 3,
    choices: [
      {
        id: "cross_first",
        label: "Cross first",
        hint: "Wren crosses first while you watch from this side. Then it is your turn.",
        playerOnly: true,
      },
      {
        id: "player_first",
        label: "You go first",
        hint: "You cross first. Whether Wren follows depends on everything so far.",
        playerOnly: true,
      },
      {
        id: "wait",
        label: "Wait for the wind to drop",
        hint: "Neither of you crosses yet. The light is going.",
        playerOnly: true,
      },
    ],
    exits: [],
    looks: [
      {
        match: ["span", "bridge", "middle", "across", "far", "other side", "ahead"],
        text:
          "The deck sways. Two cables gone on the left; the rest singing in the wind. Far side: a road, trees, no smoke. It is a long way to walk alone.",
        steer: "The camera looks down the length of the sagging bridge deck toward the far shore.",
      },
      {
        match: ["behind", "back", "smoke", "city"],
        text: "The city you came out of, under a lid of smoke lit from below. Whatever was in the water at the underpass is somewhere in that.",
        steer: "The camera turns back toward the burning city under a lid of smoke.",
      },
      {
        match: ["down", "river", "water", "below"],
        text: "Grey water, fast, a long way down. Things in it that used to be cars.",
        steer: "The camera looks down from the bridge at the fast grey river below.",
      },
      {
        match: [],
        text: "Wind. Steel. The last light going orange to violet.",
        steer: "Slow pan across the bridge at dusk, wind moving through the cables.",
      },
    ],
    listen:
      "The cables hum. Under the wind, from the city side: engines again, closer than the pharmacy.",
    hide: {
      text: "There is nowhere to hide on a bridge. Wren crouches by the abutment anyway and pulls you down with her.",
      steer: "The two survivors crouch against the bridge abutment as wind whips across the deck.",
    },
    run: {
      text: "Wren runs. Onto the span, no hesitation, the deck bucking under her. She makes the far side and turns and waits for you.",
      steer: "One survivor sprints across the swaying bridge deck to the far shore and turns to wait.",
    },
    openables: [],
    lightGoes:
      "The light goes violet and then goes. Neither of you has moved. The engines are on the boulevard now.",
  },
};

export const SCENE_ORDER: SceneId[] = ["underpass", "pharmacy", "bridge"];
