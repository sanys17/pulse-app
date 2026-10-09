import { supabase } from "./supabase";
import { reportError } from "./monitoring";
import { derivePushStatus, isIOSDevice, urlBase64ToUint8Array, type PushStatus } from "./pushSupport";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function currentTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// getRegistration() resolves to undefined when no worker is registered (e.g. `npm run dev`);
// navigator.serviceWorker.ready would hang forever there.
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

export async function getPushStatus(): Promise<PushStatus> {
  const hasNotification = "Notification" in window;
  const subscription = await currentSubscription();
  return derivePushStatus({
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    hasNotification,
    isIOS: isIOSDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints),
    isStandalone: isStandalone(),
    permission: hasNotification ? Notification.permission : "default",
    hasSubscription: subscription !== null,
  });
}

export async function registerSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) throw new Error("Push subscription is missing its keys");
  const { error } = await supabase.rpc("register_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: navigator.userAgent.slice(0, 200),
  });
  if (error) throw error;
}

export type EnableResult =
  | { ok: true }
  | { ok: false; reason: "denied" | "unsupported" | "not-configured" | "failed" };

// Call this directly from a tap handler.
export async function enablePush(): Promise<EnableResult> {
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: "not-configured" };
  if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {
    return { ok: false, reason: "unsupported" };
  }
  try {
    // First await on purpose: iOS only shows the prompt while the tap's user activation is alive.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "denied" };

    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return { ok: false, reason: "unsupported" };

    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));
    await registerSubscription(subscription);
    return { ok: true };
  } catch (error) {
    reportError(error, { area: "push", target: "enable" });
    return { ok: false, reason: "failed" };
  }
}

export async function disablePush(): Promise<void> {
  try {
    const subscription = await currentSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    // Zero rows is fine: the server may already have removed a dead endpoint.
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    if (error) throw error;
  } catch (error) {
    reportError(error, { area: "push", target: "disable" });
    throw error;
  }
}
