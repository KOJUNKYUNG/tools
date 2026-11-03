import { afterEach, describe, expect, it, vi } from "vitest";
import { createScreenWakeLock } from "./screenWakeLock";

/** A wake lock API whose requests the test settles one by one. */
function fakeWakeLock() {
  const requests: { grant: () => void; refuse: () => void }[] = [];
  const request = vi.fn(
    () =>
      new Promise((resolve, reject) => {
        requests.push({
          grant: () =>
            resolve({
              release: () => Promise.resolve(),
              addEventListener: () => {},
            }),
          refuse: () => reject(new Error("NotAllowedError")),
        });
      }),
  );
  vi.stubGlobal("navigator", { wakeLock: { request } });
  return { request, requests };
}

const settled = () => new Promise((resolve) => setTimeout(resolve));

afterEach(() => vi.unstubAllGlobals());

describe("createScreenWakeLock", () => {
  it("asks once while a request is pending", () => {
    const { request } = fakeWakeLock();
    const lock = createScreenWakeLock();
    lock.sync(true);
    lock.sync(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("asks again when the user came back while a request refused for leaving was pending", async () => {
    const { request, requests } = fakeWakeLock();
    const lock = createScreenWakeLock();
    lock.sync(true);
    lock.sync(false);
    lock.sync(true);
    requests[0].refuse();
    await settled();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not ask again after a refusal with nothing in between", async () => {
    const { request, requests } = fakeWakeLock();
    const lock = createScreenWakeLock();
    lock.sync(true);
    requests[0].refuse();
    await settled();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not ask again once the run has ended", async () => {
    const { request, requests } = fakeWakeLock();
    const lock = createScreenWakeLock();
    lock.sync(true);
    lock.sync(false);
    lock.sync(true);
    lock.sync(false);
    requests[0].refuse();
    await settled();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps a lock granted after the user came back, without asking again", async () => {
    const { request, requests } = fakeWakeLock();
    const lock = createScreenWakeLock();
    lock.sync(true);
    lock.sync(false);
    lock.sync(true);
    requests[0].grant();
    await settled();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
