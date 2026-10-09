import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { isAllowedPushEndpoint, isGone } from "./_lib/notify.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "unauthorized" });

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublic = process.env.VAPID_PUBLIC_KEY ?? process.env.VITE_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!url || !serviceKey || !vapidPublic || !vapidPrivate) {
    return res.status(500).json({ error: "server-not-configured" });
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", vapidPublic, vapidPrivate);
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Only the signed-in user's own devices are ever targeted.
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return res.status(401).json({ error: "unauthorized" });

  const { data: subs, error } = await db
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userData.user.id);
  if (error) return res.status(500).json({ error: "lookup-failed" });
  if (!subs || subs.length === 0) return res.status(404).json({ error: "no-device" });

  const payload = JSON.stringify({
    title: "Pulse",
    body: "Notifications are working on this device.",
    tag: "test",
    data: { url: "/settings" },
  });

  let sent = 0;
  let removed = 0;
  for (const sub of subs) {
    if (!isAllowedPushEndpoint(sub.endpoint)) {
      await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      removed++;
      continue;
    }
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
        TTL: 60,
        urgency: "high",
      });
      sent++;
    } catch (sendError) {
      if (isGone(sendError)) {
        await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        removed++;
      }
    }
  }

  if (sent === 0) return res.status(502).json({ error: "delivery-failed", removed });
  return res.status(200).json({ sent, removed });
}
