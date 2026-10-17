"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { initialState, reduce, type JobEvent } from "./events";

// A job clock: seconds since the job started. Replays can run faster than real time.
export interface Clock {
  now(): number;
}

// `offset` (job seconds) starts the replay part-way through, so a refreshed page lands where the job is.
export function useReplayFeed(events: JobEvent[], speed: number, offset = 0) {
  const [state, dispatch] = useReducer(reduce, undefined, initialState);
  const sorted = useRef<JobEvent[]>([]);
  const c = useRef({ base: 0, t0: 0, speed, end: Infinity, i: 0 });
  const [run, setRun] = useState(0);

  const now = useCallback(() => {
    const k = c.current;
    return Math.min(k.end, k.base + ((performance.now() - k.t0) / 1000) * k.speed);
  }, []);

  // Speed changes keep the elapsed time continuous.
  useEffect(() => {
    const k = c.current;
    k.base = now();
    k.t0 = performance.now();
    k.speed = speed;
  }, [speed, now]);

  useEffect(() => {
    sorted.current = [...events].sort((a, b) => a.at - b.at);
    const k = c.current;
    k.base = offset;
    k.t0 = performance.now();
    k.end = Infinity;
    k.i = 0;
    dispatch({ type: "reset" });
    const id = window.setInterval(() => {
      const t = now();
      const list = sorted.current;
      while (k.i < list.length && list[k.i].at <= t) dispatch(list[k.i++]);
      if (k.i >= list.length && k.end === Infinity) k.end = list[list.length - 1]?.at ?? 0;
    }, 50);
    return () => window.clearInterval(id);
  }, [events, run, now, offset]);

  const restart = useCallback(() => setRun((r) => r + 1), []);
  const clock = useMemo<Clock>(() => ({ now }), [now]);
  return { state, clock, restart };
}

export function useLiveFeed(url: string | null, startedAt: number | null) {
  const [state, dispatch] = useReducer(reduce, undefined, initialState);
  const [error, setError] = useState<string | null>(null);
  const end = useRef(Infinity);

  const now = useCallback(() => {
    if (!startedAt) return 0;
    return Math.min(end.current, (Date.now() - startedAt) / 1000);
  }, [startedAt]);

  useEffect(() => {
    if (!url) return;
    dispatch({ type: "reset" });
    const es = new EventSource(url);
    es.onmessage = (m) => {
      try {
        const e = JSON.parse(m.data) as JobEvent;
        if (e.type === "done") end.current = e.at;
        dispatch(e);
      } catch {
        // ignore malformed lines
      }
    };
    es.onerror = () => setError("The sandbox stream dropped. Reconnecting…");
    es.onopen = () => setError(null);
    return () => es.close();
  }, [url]);

  const clock = useMemo<Clock>(() => ({ now }), [now]);
  return { state, clock, error };
}

// Re-renders the caller `fps` times a second with the clock's time.
export function useElapsed(clock: Clock, fps = 10) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setT(clock.now()), 1000 / fps);
    return () => window.clearInterval(id);
  }, [clock, fps]);
  return t;
}

export function timecode(seconds: number, fps = 24) {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const f = Math.floor((s % 1) * fps);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(sec)}:${p(f)}`;
}

export function bytes(n?: number) {
  if (n === undefined) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
