// Pure helpers and the delivery loop for the notification sender.
// No relative imports: this file runs under `node --test` and as a Vercel function dependency.
import { createHash, timingSafeEqual } from "node:crypto";

export interface DueNotification {
  user_id: string;
  kind: string;
  reference_id: string;
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface Deps {
  /** Insert into notification_log. true = this run owns the item, false = already claimed. */
  claim(n: DueNotification): Promise<boolean>;
  release(n: DueNotification): Promise<void>;
  subscriptionsFor(userId: string): Promise<Subscription[]>;
  /** Throws on failure; a thrown error with statusCode 404/410 means the device is gone. */
  send(sub: Subscription, payload: string): Promise<void>;
  removeSubscription(endpoint: string): Promise<void>;
}

export interface RunSummary {
  due: number;
  claimed: number;
  delivered: number;
  removed: number;
  released: number;
}

// Push endpoints must be a real push service. Without this a signed-in user could register an
// internal or attacker-controlled URL and make the server send requests to it (SSRF).
const EXACT_PUSH_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com"];
const PUSH_HOST_SUFFIXES = [".push.apple.com", ".notify.windows.com"];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return false;
  if (url.port !== "" && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  return EXACT_PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export function isAuthorized(header: string | undefined, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  // Hash both sides so lengths always match and comparison time does not leak the secret.
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const actual = createHash("sha256").update(header).digest();
  return timingSafeEqual(expected, actual);
}

export function buildPayload(n: DueNotification): string {
  return JSON.stringify({ title: n.title, body: n.body, tag: n.tag, data: { url: n.url } });
}

export function isGone(error: unknown): boolean {
  const status = (error as { statusCode?: number } | null)?.statusCode;
  return status === 404 || status === 410;
}

export async function processNotifications(due: DueNotification[], deps: Deps): Promise<RunSummary> {
  const summary: RunSummary = { due: due.length, claimed: 0, delivered: 0, removed: 0, released: 0 };

  for (const n of due) {
    // Claim first: only the run that inserts the log row may send, so overlapping runs never duplicate.
    if (!(await deps.claim(n))) continue;
    summary.claimed++;

    try {
      const subs = await deps.subscriptionsFor(n.user_id);
      if (subs.length === 0) {
        await deps.release(n);
        summary.released++;
        continue;
      }

      const payload = buildPayload(n);
      let delivered = 0;
      let transient = 0;
      for (const sub of subs) {
        if (!isAllowedPushEndpoint(sub.endpoint)) {
          await deps.removeSubscription(sub.endpoint);
          summary.removed++;
          continue;
        }
        try {
          await deps.send(sub, payload);
          delivered++;
        } catch (error) {
          if (isGone(error)) {
            await deps.removeSubscription(sub.endpoint);
            summary.removed++;
          } else {
            transient++;
          }
        }
      }
      summary.delivered += delivered;

      // Nothing got through and it might work later: give the claim back so the next run retries.
      if (delivered === 0 && transient > 0) {
        await deps.release(n);
        summary.released++;
      }
    } catch (error) {
      await deps.release(n).catch(() => undefined);
      throw error;
    }
  }

  return summary;
}
