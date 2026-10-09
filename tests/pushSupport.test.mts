import { test } from "node:test";
import assert from "node:assert/strict";
import {
  derivePushStatus,
  isIOSDevice,
  safeTargetUrl,
  urlBase64ToUint8Array,
  type PushEnv,
} from "../src/lib/pushSupport.ts";

const supported: PushEnv = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  isIOS: false,
  isStandalone: false,
  permission: "default",
  hasSubscription: false,
};
const status = (over: Partial<PushEnv>) => derivePushStatus({ ...supported, ...over });

test("iPhone Safari tab (not installed) needs the Home Screen app, even though PushManager is missing there", () => {
  assert.equal(status({ isIOS: true, isStandalone: false, hasPushManager: false }), "needs-install");
});

test("installed iPhone app behaves like any supported browser", () => {
  assert.equal(status({ isIOS: true, isStandalone: true }), "off");
  assert.equal(status({ isIOS: true, isStandalone: true, permission: "granted", hasSubscription: true }), "on");
});

test("unsupported when the browser lacks service workers, push or notifications", () => {
  assert.equal(status({ hasServiceWorker: false }), "unsupported");
  assert.equal(status({ hasPushManager: false }), "unsupported");
  assert.equal(status({ hasNotification: false }), "unsupported");
});

test("permission states", () => {
  assert.equal(status({ permission: "denied" }), "blocked");
  assert.equal(status({ permission: "default" }), "off");
  assert.equal(status({ permission: "granted", hasSubscription: false }), "off");
  assert.equal(status({ permission: "granted", hasSubscription: true }), "on");
  // permission revoked in system settings while a stale subscription object still exists
  assert.equal(status({ permission: "denied", hasSubscription: true }), "blocked");
});

test("isIOSDevice detects iPhone, iPad and iPadOS desktop mode", () => {
  assert.equal(isIOSDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "iPhone", 5), true);
  assert.equal(isIOSDevice("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", "iPad", 5), true);
  assert.equal(isIOSDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5), true);
  assert.equal(isIOSDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0), false);
  assert.equal(isIOSDevice("Mozilla/5.0 (Linux; Android 14)", "Linux armv8l", 5), false);
});

test("urlBase64ToUint8Array decodes URL-safe base64 with and without padding", () => {
  assert.deepEqual([...urlBase64ToUint8Array("AQID")], [1, 2, 3]);
  assert.deepEqual([...urlBase64ToUint8Array("-_8")], [0xfb, 0xff]);
  assert.deepEqual([...urlBase64ToUint8Array("AQI")], [1, 2]);
});

test("safeTargetUrl keeps same-origin paths and rejects everything else", () => {
  const origin = "https://pulse.example";
  assert.equal(safeTargetUrl("/calendar", origin), "https://pulse.example/calendar");
  assert.equal(safeTargetUrl("https://pulse.example/social/plan/1", origin), "https://pulse.example/social/plan/1");
  assert.equal(safeTargetUrl("https://evil.example/x", origin), "https://pulse.example/");
  assert.equal(safeTargetUrl("javascript:alert(1)", origin), "https://pulse.example/");
  assert.equal(safeTargetUrl(undefined, origin), "https://pulse.example/");
  assert.equal(safeTargetUrl(42, origin), "https://pulse.example/");
});
