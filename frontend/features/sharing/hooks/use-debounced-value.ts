import { useEffect, useState } from "react";

/**
 * Trails `value` by `delayMs`, resetting the timer on every change.
 *
 * Used to keep the member picker from firing a request per keystroke: the
 * search endpoint is rate limited with everything else under /api/v1, and an
 * un-debounced typeahead burns that budget on terms nobody reads.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
