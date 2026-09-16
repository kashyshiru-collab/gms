// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;
const RELOAD_KEY = "tronix-option-dynamic-import-reload";

function record(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => {
    const err = (event as ErrorEvent).error ?? event;
    record(err);
    recoverDynamicImportFailure(err);
  });
  globalThis.addEventListener("unhandledrejection", (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    record(reason);
    recoverDynamicImportFailure(reason);
  });
}

export function isDynamicImportFetchFailure(error: unknown) {
  const msg = String((error && (error as { message?: unknown }).message) ?? error ?? "");
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module")
  );
}

export function recoverDynamicImportFailure(error: unknown, options: { force?: boolean } = {}) {
  if (typeof window === "undefined" || !isDynamicImportFetchFailure(error)) return false;

  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? "0");
    if (!options.force && Date.now() - last < 1000 * 60 * 5) {
      try {
        alert("App resources are out of sync. Please hard reload to update.");
      } catch (alertError) {
        console.warn("Could not show dynamic import recovery alert", alertError);
      }
      return true;
    }

    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));

    if (navigator && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((registration) => registration.unregister()))
        .catch(() => {});
    }

    const url = new URL(window.location.href);
    url.searchParams.set("_tbust", String(Date.now()));
    window.location.replace(url.toString());
    return true;
  } catch (e) {
    console.error("Dynamic import recovery failed", e);
    return false;
  }
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}
