export type PushStatus = "unsupported" | "needs-install" | "blocked" | "off" | "on";

export interface PushEnv {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  permission: "default" | "granted" | "denied";
  hasSubscription: boolean;
}

export function derivePushStatus(env: PushEnv): PushStatus {
  // An iPhone Safari tab has no PushManager at all, so check "not installed" first to give the useful hint.
  if (env.isIOS && !env.isStandalone) return "needs-install";
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return "unsupported";
  if (env.permission === "denied") return "blocked";
  if (env.permission === "granted" && env.hasSubscription) return "on";
  return "off";
}

export function isIOSDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Where a tapped notification may send the user: same-origin only.
export function safeTargetUrl(raw: unknown, origin: string): string {
  if (typeof raw !== "string") return `${origin}/`;
  try {
    const url = new URL(raw, origin);
    return url.origin === origin ? url.href : `${origin}/`;
  } catch {
    return `${origin}/`;
  }
}
