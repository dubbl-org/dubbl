import { useCallback, useRef } from "react";

function setRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref != null) (ref as React.RefObject<T | null>).current = value;
}

/**
 * Returns a stable ref callback that keeps a portaled, scrollable element
 * scrollable while a Radix Dialog / Sheet is open.
 *
 * Radix Dialog (and our Sheet) lock page scroll with `react-remove-scroll`,
 * which attaches a non-passive `wheel`/`touchmove` listener on `document` and
 * calls `preventDefault()` for any event whose target is outside the dialog's
 * content subtree (its only shard). A Popover portals its content to
 * `document.body` — outside that subtree — so the lock cancels every scroll
 * gesture over the popover, and long lists (e.g. the currency combobox) can't
 * be scrolled.
 *
 * We stop `wheel`/`touchmove` from bubbling up to `document`, so
 * react-remove-scroll's listener never sees them and never cancels them; the
 * browser still scrolls the element under the cursor. This must be a *native*
 * listener on the element itself: React delegates synthetic events on the same
 * `document` node react-remove-scroll binds to, so a synthetic
 * `stopPropagation` wouldn't prevent it. Because the element is a descendant of
 * `document`, its bubble-phase listener runs first and stops the event before
 * the lock can act — independent of listener registration order.
 *
 * Pass any external ref (e.g. Radix's forwarded ref) and it is forwarded too.
 */
export function useScrollLockSafeRef<T extends HTMLElement = HTMLElement>(
  externalRef?: React.Ref<T>
) {
  const cleanupRef = useRef<(() => void) | null>(null);

  const attach = useCallback((node: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;

    if (!node) return;

    const stop = (event: Event) => event.stopPropagation();
    node.addEventListener("wheel", stop, { passive: true });
    node.addEventListener("touchmove", stop, { passive: true });

    cleanupRef.current = () => {
      node.removeEventListener("wheel", stop);
      node.removeEventListener("touchmove", stop);
    };
  }, []);

  return useCallback(
    (node: T | null) => {
      attach(node);
      setRef(externalRef, node);
    },
    [attach, externalRef]
  );
}
