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

export interface UseRunPresenceReturn {
  runLine: RunLine;
  beginRun: () => void;
  endRun: () => void;
}

/** Feeds the run presence rule from time and visibility, and acts on its answer. */
export function useRunPresence(): UseRunPresenceReturn {
  const [runLine, setRunLine] = useState<RunLine>(null);
  const stateRef = useRef(noRun);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wakeLockRef = useRef<ScreenWakeLock | null>(null);

  const publish = useCallback(() => {
    const presence = describeRunPresence(stateRef.current, Date.now());
    setRunLine(presence.line);
    wakeLockRef.current ??= createScreenWakeLock();
    wakeLockRef.current.sync(presence.keepScreenOn);
  }, []);

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

  return { runLine, beginRun, endRun };
}
