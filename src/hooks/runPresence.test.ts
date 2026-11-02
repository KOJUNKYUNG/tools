import { describe, it, expect } from "vitest";
import {
  describeRunPresence,
  noRun,
  nextRunPresence,
  type RunPresenceEvent,
} from "./runPresence";

const START = 1_000;

function after(...events: RunPresenceEvent[]) {
  return events.reduce(nextRunPresence, noRun);
}

const started: RunPresenceEvent = { type: "started", at: START, onScreen: true };

describe("a run on screen", () => {
  it("shows nothing before a run starts", () => {
    expect(describeRunPresence(noRun, START)).toEqual({
      line: null,
      titlePaused: false,
      keepScreenOn: false,
    });
  });

  it("keeps the screen on from the start, with no notice yet", () => {
    expect(describeRunPresence(after(started), START + 2_999)).toEqual({
      line: null,
      titlePaused: false,
      keepScreenOn: true,
    });
  });

  it("shows the stay-on-screen notice from 3 s into the run", () => {
    expect(describeRunPresence(after(started), START + 3_000).line).toBe("stayOnScreen");
  });
});

describe("a run that ended", () => {
  it("shows nothing and lets the screen go after a run that finished", () => {
    expect(describeRunPresence(after(started, { type: "ended" }), START + 9_000)).toEqual({
      line: null,
      titlePaused: false,
      keepScreenOn: false,
    });
  });

  it("starts over on the next run, so a quick one shows no notice", () => {
    const again: RunPresenceEvent = { type: "started", at: START + 9_000, onScreen: true };
    expect(
      describeRunPresence(after(started, { type: "ended" }), START + 9_000).line,
    ).toBeNull();
    expect(
      describeRunPresence(after(started, { type: "ended" }, again), START + 10_000).line,
    ).toBeNull();
  });
});

describe("a run that failed", () => {
  it("ends like any other: no line, and the screen let go", () => {
    expect(describeRunPresence(after(started, { type: "ended" }), START + 5_000)).toEqual({
      line: null,
      titlePaused: false,
      keepScreenOn: false,
    });
  });
});

describe("leaving the screen", () => {
  const left: RunPresenceEvent = { type: "left" };
  const returned: RunPresenceEvent = { type: "returned" };
  const stretchStarted: RunPresenceEvent = { type: "stretchStarted" };
  const stretchEnded: RunPresenceEvent = { type: "stretchEnded" };
  const LATER = START + 60_000;

  it("does not call a run paused when it left outside a stretch", () => {
    const state = after(started, left);
    expect(describeRunPresence(state, LATER).titlePaused).toBe(false);
    expect(describeRunPresence(after(started, left, returned), LATER).line).toBe("stayOnScreen");
  });

  it("says paused in the title while hidden inside a stretch, and restores it on return", () => {
    expect(describeRunPresence(after(started, stretchStarted, left), LATER).titlePaused).toBe(true);
    expect(describeRunPresence(after(started, stretchStarted, left, returned), LATER).titlePaused).toBe(
      false,
    );
  });

  it("counts a stretch entered while already hidden", () => {
    expect(describeRunPresence(after(started, left, stretchStarted), LATER).titlePaused).toBe(true);
    expect(describeRunPresence(after(started, left, stretchStarted, returned), LATER).line).toBe(
      "wasPaused",
    );
  });

  it("counts a run that started while hidden", () => {
    const startedHidden: RunPresenceEvent = { type: "started", at: START, onScreen: false };
    expect(describeRunPresence(after(startedHidden, stretchStarted), LATER).titlePaused).toBe(true);
  });

  it("replaces the notice with the was-paused line on return, until the run ends", () => {
    const back = after(started, stretchStarted, left, returned);
    expect(describeRunPresence(back, START + 1_000).line).toBe("wasPaused");
    expect(describeRunPresence(after(started, stretchStarted, left, returned, stretchEnded), LATER).line).toBe(
      "wasPaused",
    );
    expect(
      describeRunPresence(after(started, stretchStarted, left, returned, { type: "ended" }), LATER).line,
    ).toBeNull();
  });

  it("does not call it paused when the stretch ended before the return", () => {
    const state = after(started, stretchStarted, left, stretchEnded);
    expect(describeRunPresence(state, LATER).titlePaused).toBe(false);
    expect(describeRunPresence(after(started, stretchStarted, left, stretchEnded, returned), LATER).line).toBe(
      "stayOnScreen",
    );
  });

  it("never leaves the title changed after a run that ended while hidden", () => {
    expect(
      describeRunPresence(after(started, stretchStarted, left, { type: "ended" }), LATER),
    ).toEqual({ line: null, titlePaused: false, keepScreenOn: false });
  });

  it("does not carry a was-paused line into the next run", () => {
    const again: RunPresenceEvent = { type: "started", at: LATER, onScreen: true };
    const state = after(started, stretchStarted, left, returned, { type: "ended" }, again);
    expect(describeRunPresence(state, LATER + 3_000).line).toBe("stayOnScreen");
  });

  it("lets the screen go while hidden and wants it back on return", () => {
    expect(describeRunPresence(after(started, left), LATER).keepScreenOn).toBe(false);
    expect(describeRunPresence(after(started, left, returned), LATER).keepScreenOn).toBe(true);
  });
});
