/**
 * What a run shows and asks of the browser, given what has happened in it
 * (CONTEXT "Leaving the screen", "Paused run"). Knows nothing of the DOM:
 * `useRunPresence` feeds it and acts on its answer.
 */

/** A run this long or longer asks the user to stay on the screen. */
export const NOTICE_AFTER_MS = 3_000;

export type RunLine = "stayOnScreen" | "wasPaused" | null;

/**
 * Runs `work` as a stretch of the run that truly stops while the user is away
 * (CONTEXT "Paused run"). Anything outside such a stretch is never called
 * paused. A run's stretches do not overlap.
 */
export type NeedsScreen = <T>(work: () => Promise<T>) => Promise<T>;

export interface RunPresence {
  /** The line under the progress. */
  line: RunLine;
  /** The tab's title says the run is paused. */
  titlePaused: boolean;
  /** Hold the screen on. False while hidden: the browser drops the hold then. */
  keepScreenOn: boolean;
}

export interface RunPresenceState {
  /** When the run in progress started; null when none is. */
  startedAt: number | null;
  onScreen: boolean;
  /** In a stretch of the run that truly stops while hidden. */
  inStretch: boolean;
  /** The user came back to a stretch that was waiting for them. */
  wasPaused: boolean;
}

export type RunPresenceEvent =
  | { type: "started"; at: number; onScreen: boolean }
  | { type: "left" }
  | { type: "returned" }
  | { type: "stretchStarted" }
  | { type: "stretchEnded" }
  /** Finished, failed or reset alike. */
  | { type: "ended" };

export const noRun: RunPresenceState = {
  startedAt: null,
  onScreen: true,
  inStretch: false,
  wasPaused: false,
};

export function nextRunPresence(
  state: RunPresenceState,
  event: RunPresenceEvent,
): RunPresenceState {
  if (event.type === "started") {
    return { ...noRun, startedAt: event.at, onScreen: event.onScreen };
  }
  if (state.startedAt === null) return state;
  switch (event.type) {
    case "left":
      return { ...state, onScreen: false };
    case "returned":
      // A stretch still open on return was waiting; one that ended while the
      // user was away never stopped the run, so it is not called paused.
      return {
        ...state,
        onScreen: true,
        wasPaused: state.wasPaused || (!state.onScreen && state.inStretch),
      };
    case "stretchStarted":
      return { ...state, inStretch: true };
    case "stretchEnded":
      return { ...state, inStretch: false };
    case "ended":
      return noRun;
  }
}

export function describeRunPresence(state: RunPresenceState, now: number): RunPresence {
  if (state.startedAt === null) {
    return { line: null, titlePaused: false, keepScreenOn: false };
  }
  return {
    line: state.wasPaused
      ? "wasPaused"
      : now - state.startedAt >= NOTICE_AFTER_MS
        ? "stayOnScreen"
        : null,
    titlePaused: !state.onScreen && state.inStretch,
    keepScreenOn: state.onScreen,
  };
}
