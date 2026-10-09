import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { isAuthorized, processNotifications, type DueNotification, type Subscription } from "./_lib/notify.js";

// Better Stack heartbeat: pinged on every successful run, "/fail" on errors. Never let it break sending.
async function ping(url: string | undefined, suffix = "") {
  if (!url) return;
  try {
    await fetch(url + suffix, { signal: AbortSignal.timeout(3000) });
  } catch {
    // ignore
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!isAuthorized(req.headers.authorization, process.env.CRON_SECRET)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const heartbeat = process.env.BETTERSTACK_HEARTBEAT_URL;
  try {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const vapidPublic = process.env.VAPID_PUBLIC_KEY ?? process.env.VITE_VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    if (!url || !serviceKey || !vapidPublic || !vapidPrivate) {
      throw new Error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY");
    }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", vapidPublic, vapidPrivate);
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data, error } = await db.rpc("pending_notifications");
    if (error) throw error;
    const due = (data ?? []) as DueNotification[];

    const devices = new Map<string, Subscription[]>();
    const summary = await processNotifications(due, {
      claim: async (n) => {
        const { error: claimError } = await db
          .from("notification_log")
          .insert({ user_id: n.user_id, kind: n.kind, reference_id: n.reference_id });
        if (!claimError) return true;
        if (claimError.code === "23505") return false; // another run owns it
        throw claimError;
      },
      release: async (n) => {
        await db
          .from("notification_log")
          .delete()
          .eq("user_id", n.user_id)
          .eq("kind", n.kind)
          .eq("reference_id", n.reference_id);
      },
      subscriptionsFor: async (userId) => {
        const cached = devices.get(userId);
        if (cached) return cached;
        const { data: subs, error: subsError } = await db
          .from("push_subscriptions")
          .select("endpoint, p256dh, auth")
          .eq("user_id", userId);
        if (subsError) throw subsError;
        devices.set(userId, subs ?? []);
        return subs ?? [];
      },
      send: async (sub, payload) => {
        // TTL matches the 15-minute alert window: a reminder that arrives later is worse than none.
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
          TTL: 900,
          urgency: "high",
        });
      },
      removeSubscription: async (endpoint) => {
        await db.from("push_subscriptions").delete().eq("endpoint", endpoint);
        devices.clear();
      },
    });

    console.log("[send-notifications]", JSON.stringify(summary));
    await ping(heartbeat);
    return res.status(200).json(summary);
  } catch (error) {
    console.error("[send-notifications] failed", error);
    await ping(heartbeat, "/fail");
    return res.status(500).json({ error: "send failed" });
  }
}
