export function getServerUrl(): string {
  const fromEnv = (import.meta as any)?.env?.VITE_SERVER_URL as string | undefined;
  if (fromEnv && typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/+$/, "");
  }

  // Local dev default: keep existing behavior.
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const isLocal =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host.endsWith(".localhost");

    if (isLocal) return "http://localhost:3001";

    // Production default: assume API is served from same origin.
    return window.location.origin.replace(/\/+$/, "");
  }

  // Fallback (shouldn't happen in this app, but keeps types happy).
  return "http://localhost:3001";
}

