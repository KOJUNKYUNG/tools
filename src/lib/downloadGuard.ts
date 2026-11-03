export interface DownloadGuard {
  /** Runs `save`, unless the one before it is still being built. */
  click: (save: () => void | Promise<void>) => void;
}

/** One save per click. A save that returns no promise is done at once, so it never shows busy. */
export function createDownloadGuard({
  onBusyChange,
  onFailure,
}: {
  onBusyChange: (busy: boolean) => void;
  onFailure: (err: unknown) => void;
}): DownloadGuard {
  let building = false;
  return {
    click(save) {
      if (building) return;
      let saved: void | Promise<void>;
      try {
        saved = save();
      } catch (err) {
        onFailure(err);
        return;
      }
      if (!saved) return;
      building = true;
      onBusyChange(true);
      void saved.catch(onFailure).finally(() => {
        building = false;
        onBusyChange(false);
      });
    },
  };
}
