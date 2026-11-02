"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  describeRunPresence,
  nextRunPresence,
  noRun,
  NOTICE_AFTER_MS,
  type RunLine,
  type RunPresenceEvent,
} from "@/lib/runPresence";
import { createScreenWakeLock, type ScreenWakeLock } from "@/lib/screenWakeLock";
import { useProcessingStatusCopy } from "@/components/common/ProcessingStatusCopyProvider";

export interface UseRunPresenceReturn {
  runLine: RunLine;
  beginRun: () => void;
  endRun: () => void;
  startStretch: () => void;
  endStretch: () => void;
}

/** Feeds the run presence rule from time and visibility, and acts on its answer. */
export function useRunPresence(): UseRunPresenceReturn {
  const { pausedTitle } = useProcessingStatusCopy();
  const [runLine, setRunLine] = useState<RunLine>(null);
  const stateRef = useRef(noRun);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wakeLockRef = useRef<ScreenWakeLock | null>(null);
  /** The tab's own title, while the paused one stands in for it. */
  const ownTitleRef = useRef<string | null>(null);

  const publish = useCallback(() => {
    const presence = describeRunPresence(stateRef.current, Date.now());
    setRunLine(presence.line);
    wakeLockRef.current ??= createScreenWakeLock();
    wakeLockRef.current.sync(presence.keepScreenOn);
    if (presence.titlePaused && ownTitleRef.current === null) {
      ownTitleRef.current = document.title;
      document.title = pausedTitle;
    } else if (!presence.titlePaused && ownTitleRef.current !== null) {
      document.title = ownTitleRef.current;
      ownTitleRef.current = null;
    }
  }, [pausedTitle]);

  const send = useCallback(
    (event: RunPresenceEvent) => {
      stateRef.current = nextRunPresence(stateRef.current, event);
      publish();
    },
    [publish],
  );

  const beginRun = useCallback(() => {
    clearTimeout(noticeTimerRef.current);
    send({ type: "started", at: Date.now(), onScreen: !document.hidden });
    // A margin so the check lands past the threshold on the wall clock too.
    noticeTimerRef.current = setTimeout(publish, NOTICE_AFTER_MS + 50);
  }, [publish, send]);

  const endRun = useCallback(() => {
    clearTimeout(noticeTimerRef.current);
    send({ type: "ended" });
  }, [send]);

  const startStretch = useCallback(() => send({ type: "stretchStarted" }), [send]);
  const endStretch = useCallback(() => send({ type: "stretchEnded" }), [send]);

  useEffect(() => {
    const onVisibilityChange = () => {
      send({ type: document.hidden ? "left" : "returned" });
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      endRun();
    };
  }, [endRun, send]);

  return { runLine, beginRun, endRun, startStretch, endStretch };
}
