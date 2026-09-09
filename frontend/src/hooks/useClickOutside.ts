import { useEffect, useRef, type RefObject } from 'react';

/**
 * Calls `onOutsideClick` when a pointerdown lands outside `ref`'s element,
 * but only while `active` — used to close a dropdown/menu on an outside
 * click without re-subscribing the listener on every render (the callback
 * is read from a ref so it doesn't need to be memoised by the caller).
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T>,
  active: boolean,
  onOutsideClick: () => void,
): void {
  const callbackRef = useRef(onOutsideClick);
  callbackRef.current = onOutsideClick;

  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        callbackRef.current();
      }
    };
    /**
     * Escape closes too (Task 5), so every menu in the app dismisses the same
     * two ways regardless of which component owns it. Listening here rather
     * than per-dropdown means a control cannot accidentally opt out.
     *
     * Note the outside-click half also gives "only one menu open at a time"
     * for free: clicking a second toggle is a mousedown outside the first,
     * which closes it before the second opens.
     */
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') callbackRef.current();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [active, ref]);
}
