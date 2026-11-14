"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

/**
 * State that starts from a server payload and follows it when a new one arrives.
 *
 * Back/forward, and anything that re-runs the server component, replaces the
 * props. Plain `useState(initialData.x)` ignores that: the screen keeps showing
 * the rows it was first painted with, even though the fresh data is sitting in
 * the props. This re-seeds whenever the payload object changes identity.
 *
 * The payload is stable between server renders, so ordinary client re-renders
 * never trigger the sync, and it cannot loop.
 */
export function useServerSeeded<T>(payload: unknown, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState(initial);
  const seen = useRef(payload);

  useEffect(() => {
    if (seen.current === payload) return;
    seen.current = payload;
    setState(initial);
  }, [payload, initial]);

  return [state, setState];
}
