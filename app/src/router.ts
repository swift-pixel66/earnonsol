import { useEffect, useState } from "react";

// Minimal path-based router. Routes: "/" (home) and "/app" (vault app).
export function navigate(path: string) {
  if (location.pathname + location.search === path) return;
  history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useRoute() {
  const [route, setRoute] = useState(() => location.pathname);
  useEffect(() => {
    const on = () => setRoute(location.pathname);
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  return route;
}
