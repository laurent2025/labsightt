import { useEffect, useState } from 'react';

/**
 * Delays propagating a rapidly-changing value.
 *
 * Search boxes need this: firing a request per keystroke would issue a query
 * per character, which is both slow and a trivial way to hammer the server.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
