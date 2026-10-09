import * as Sentry from "@sentry/react";
import { isExpectedFailure, targetOf } from "./monitoringRules";

// Works with Better Stack or Sentry: both accept the Sentry SDK. Without a DSN
// everything below is a no-op (errors are still logged to the console in dev).
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export function initMonitoring() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    enabled: import.meta.env.PROD,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA as string | undefined,
    // Keep personal data out: no cookies, headers (Authorization carries the user's token),
    // request/response bodies, or query strings (Supabase URLs contain user ids).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0,
    ignoreErrors: ["ResizeObserver loop", "Non-Error promise rejection captured"],
  });
}

// Anonymous id only; never an email or name.
export function setMonitoringUser(id: string | null) {
  if (dsn) Sentry.setUser(id ? { id } : null);
}

type Context = Record<string, string | number | boolean | undefined>;
const lastSent = new Map<string, number>();

// Same failure at most once a minute, so a retry loop can't flood the alerts.
export function reportError(error: unknown, context: Context = {}) {
  const err = error instanceof Error ? error : new Error(String(error));
  const key = `${err.message}|${JSON.stringify(context)}`;
  const now = Date.now();
  if (now - (lastSent.get(key) ?? 0) < 60_000) return;
  lastSent.set(key, now);

  if (!dsn) {
    if (import.meta.env.DEV) console.warn("[monitoring]", err.message, context);
    return;
  }
  Sentry.withScope((scope) => {
    scope.setContext("details", context);
    if (context.area) scope.setTag("area", String(context.area));
    scope.setFingerprint([err.message, String(context.area ?? ""), String(context.target ?? "")]);
    Sentry.captureException(err);
  });
}

// A write that "succeeds" but changes nothing is how permission (RLS) bugs hide:
// the database answers OK with zero rows. Call this after a write that used .select().
export function expectRows(operation: string, rows: unknown[] | null | undefined): boolean {
  if (rows && rows.length > 0) return true;
  reportError(new Error(`${operation}: write changed 0 rows (blocked by permissions or row missing)`), {
    area: "silent-write",
    target: operation,
  });
  return false;
}

async function reportFailedResponse(response: Response, method: string, url: string) {
  const target = targetOf(url);
  let code: string | undefined;
  let message = response.statusText;
  try {
    const body = await response.json();
    code = typeof body?.code === "string" ? body.code : undefined;
    message = body?.message ?? body?.msg ?? message;
  } catch {
    // body was not JSON
  }
  if (isExpectedFailure(response.status, target, code)) return;
  reportError(new Error(`Supabase ${method} ${target} -> ${response.status}${code ? ` (${code})` : ""}: ${message}`), {
    area: "supabase",
    method,
    target,
    status: response.status,
    code,
  });
}

// Passed to supabase-js so every failed request is seen in one place.
export const monitoredFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    if (!aborted && navigator.onLine !== false) {
      reportError(error, { area: "network", method, target: targetOf(url) });
    }
    throw error;
  }
  if (!response.ok) void reportFailedResponse(response.clone(), method, url);
  return response;
};
