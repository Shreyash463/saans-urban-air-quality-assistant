import { useEffect, useState } from 'react';

/**
 * Debounces a rapidly changing value (such as the city text input)
 * to avoid unnecessary lookups or re-renders while typing.
 */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => globalThis.clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}
