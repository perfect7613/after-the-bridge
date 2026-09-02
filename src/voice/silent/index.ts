import type { Voice } from "../types";

/** No network, no sound. The Chapter and Wren never notice the difference. */
export function silentVoice(): Voice {
  return {
    enabled: false,
    speak: () => Promise.resolve(),
    stop: () => {},
    onStatus: (fn) => {
      fn("silent");
      return () => {};
    },
  };
}
