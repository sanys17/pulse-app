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
