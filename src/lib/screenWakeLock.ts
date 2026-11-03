export interface ScreenWakeLock {
  /** Holds or lets go of the screen. Lack of support or a refusal is silent. */
  sync(wanted: boolean): void;
}

export function createScreenWakeLock(): ScreenWakeLock {
  let wanted = false;
  let held: WakeLockSentinel | null = null;
  let requesting = false;
  /** The user came back during a request made before they left, which that may refuse. */
  let askAgain = false;

  const letGo = (sentinel: WakeLockSentinel) => {
    sentinel.release().catch(() => {});
  };

  const take = async () => {
    requesting = true;
    try {
      // Throws where the browser has no `navigator.wakeLock`, as a refusal does.
      const sentinel = await navigator.wakeLock.request("screen");
      if (!wanted) {
        // The run ended while the request was pending.
        letGo(sentinel);
        return;
      }
      held = sentinel;
      // The browser drops the hold on its own when the page is hidden.
      sentinel.addEventListener("release", () => {
        if (held === sentinel) held = null;
      });
    } catch {
      // The tool works as usual without it.
    } finally {
      requesting = false;
      const again = askAgain && wanted && !held;
      askAgain = false;
      if (again) void take();
    }
  };

  return {
    sync(next) {
      if (next && !wanted && requesting) askAgain = true;
      wanted = next;
      if (wanted) {
        if (!held && !requesting) void take();
      } else if (held) {
        letGo(held);
        held = null;
      }
    },
  };
}
