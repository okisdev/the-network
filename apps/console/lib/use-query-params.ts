"use client";

import { useCallback, useEffect, useState } from "react";

export function useQueryParams(): [
  URLSearchParams,
  (patch: Record<string, string | undefined>) => void,
] {
  const [params, setParams] = useState(() => new URLSearchParams());

  useEffect(() => {
    const sync = () => setParams(new URLSearchParams(window.location.search));
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const update = useCallback((patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const encoded = next.toString();
    window.history.replaceState(
      null,
      "",
      encoded ? `${window.location.pathname}?${encoded}` : window.location.pathname,
    );
    setParams(next);
  }, []);

  return [params, update];
}
