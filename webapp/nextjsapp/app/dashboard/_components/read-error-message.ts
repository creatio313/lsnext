export function readErrorMessage(data: unknown, fallback: string) {
  if (typeof data === "object" && data !== null && "error" in data) {
    return String((data as { error?: unknown }).error ?? fallback);
  }

  return fallback;
}
