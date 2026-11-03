import { describe, it, expect, vi } from "vitest";
import { createDownloadGuard } from "./downloadGuard";

/** A build the test finishes by hand, as a zip that is still being built. */
function pendingBuild() {
  let finish!: () => void;
  let fail!: (err: unknown) => void;
  const done = new Promise<void>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  return { done, finish, fail };
}

function setup() {
  const onBusyChange = vi.fn<(busy: boolean) => void>();
  const onFailure = vi.fn<(err: unknown) => void>();
  return { guard: createDownloadGuard({ onBusyChange, onFailure }), onBusyChange, onFailure };
}

describe("a click while a build is going", () => {
  it("starts no second save", () => {
    const { guard } = setup();
    const build = pendingBuild();
    const save = vi.fn(() => build.done);

    guard.click(save);
    guard.click(save);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("shows busy until the build ends, and a later click saves again", async () => {
    const { guard, onBusyChange } = setup();
    const build = pendingBuild();
    const save = vi.fn(() => build.done);

    guard.click(save);
    expect(onBusyChange.mock.calls).toEqual([[true]]);

    build.finish();
    await vi.waitFor(() => expect(onBusyChange.mock.calls).toEqual([[true], [false]]));

    guard.click(save);
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe("a build that fails", () => {
  it("reports the failure, stops showing busy, and a later click saves again", async () => {
    const { guard, onBusyChange, onFailure } = setup();
    const build = pendingBuild();
    const save = vi.fn(() => build.done);
    const cause = new Error("out of memory");

    guard.click(save);
    build.fail(cause);
    await vi.waitFor(() => expect(onBusyChange.mock.calls).toEqual([[true], [false]]));
    expect(onFailure.mock.calls).toEqual([[cause]]);

    guard.click(save);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("does the same when the save throws before any build starts", () => {
    const { guard, onBusyChange, onFailure } = setup();
    const cause = new Error("no result");
    const save = vi.fn(() => {
      throw cause;
    });

    guard.click(save);
    guard.click(save);

    expect(save).toHaveBeenCalledTimes(2);
    expect(onFailure.mock.calls).toEqual([[cause], [cause]]);
    expect(onBusyChange).not.toHaveBeenCalled();
  });
});

describe("a save with nothing to build", () => {
  it("never shows busy, and each click saves", () => {
    const { guard, onBusyChange } = setup();
    const save = vi.fn();

    guard.click(save);
    guard.click(save);

    expect(save).toHaveBeenCalledTimes(2);
    expect(onBusyChange).not.toHaveBeenCalled();
  });
});
