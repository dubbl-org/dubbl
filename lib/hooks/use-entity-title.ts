import { useSyncExternalStore, useEffect } from "react";

let entityTitle: string | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return entityTitle;
}

export function setEntityTitle(title: string | null) {
  entityTitle = title;
  listeners.forEach((l) => l());
}

export function useEntityTitle(title?: string) {
  useEffect(() => {
    if (title !== undefined) {
      setEntityTitle(title);
      return () => setEntityTitle(null);
    }
  }, [title]);

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
