import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPayload,
  isAuthorized,
  isGone,
  processNotifications,
  type Deps,
  type DueNotification,
  type Subscription,
} from "../api/_lib/notify.ts";

const note = (id: string): DueNotification => ({
  user_id: "u1",
  kind: "habit",
  reference_id: id,
  title: "Habits",
  body: "2 habits left today: Read, Run",
  url: "/habits",
  tag: "habit-" + id,
});
const phone: Subscription = { endpoint: "https://push/phone", p256dh: "k", auth: "a" };
const laptop: Subscription = { endpoint: "https://push/laptop", p256dh: "k", auth: "a" };
const gone = Object.assign(new Error("gone"), { statusCode: 410 });
const flaky = Object.assign(new Error("push service down"), { statusCode: 503 });

function fakes(opts: {
  subs?: Subscription[];
  claim?: boolean;
  send?: (sub: Subscription) => Promise<void>;
  subsError?: Error;
}) {
  const calls = { sent: [] as string[], released: [] as string[], removed: [] as string[] };
  const deps: Deps = {
    claim: async () => opts.claim ?? true,
    release: async (n) => void calls.released.push(n.reference_id),
    subscriptionsFor: async () => {
      if (opts.subsError) throw opts.subsError;
      return opts.subs ?? [phone];
    },
    send: async (sub) => {
      if (opts.send) await opts.send(sub);
      calls.sent.push(sub.endpoint);
    },
    removeSubscription: async (endpoint) => void calls.removed.push(endpoint),
  };
  return { deps, calls };
}

test("delivers to every device and keeps the claim", async () => {
  const { deps, calls } = fakes({ subs: [phone, laptop] });
  const summary = await processNotifications([note("d1")], deps);
  assert.deepEqual(calls.sent, [phone.endpoint, laptop.endpoint]);
  assert.deepEqual(calls.released, []);
  assert.equal(summary.delivered, 2);
});

test("an item another run already claimed is not sent again", async () => {
  const { deps, calls } = fakes({ claim: false });
  const summary = await processNotifications([note("d1")], deps);
  assert.deepEqual(calls.sent, []);
  assert.equal(summary.claimed, 0);
});

test("a dead device is removed while the live one keeps the claim", async () => {
  const { deps, calls } = fakes({
    subs: [phone, laptop],
    send: async (sub) => {
      if (sub.endpoint === laptop.endpoint) throw gone;
    },
  });
  const summary = await processNotifications([note("d1")], deps);
  assert.deepEqual(calls.removed, [laptop.endpoint]);
  assert.deepEqual(calls.sent, [phone.endpoint]);
  assert.deepEqual(calls.released, []);
  assert.equal(summary.removed, 1);
});

test("every device failing transiently releases the claim so the next minute retries", async () => {
  const { deps, calls } = fakes({
    subs: [phone, laptop],
    send: async () => {
      throw flaky;
    },
  });
  const summary = await processNotifications([note("d1")], deps);
  assert.deepEqual(calls.released, ["d1"]);
  assert.deepEqual(calls.removed, []);
  assert.equal(summary.released, 1);
});

test("every device gone: all removed, claim kept (nothing left to retry)", async () => {
  const { deps, calls } = fakes({
    subs: [phone, laptop],
    send: async () => {
      throw gone;
    },
  });
  await processNotifications([note("d1")], deps);
  assert.deepEqual(calls.removed, [phone.endpoint, laptop.endpoint]);
  assert.deepEqual(calls.released, []);
});

test("no devices left: claim is released", async () => {
  const { deps, calls } = fakes({ subs: [] });
  await processNotifications([note("d1")], deps);
  assert.deepEqual(calls.released, ["d1"]);
});

test("an unexpected error after claiming releases the claim and is rethrown", async () => {
  const { deps, calls } = fakes({ subsError: new Error("db down") });
  await assert.rejects(() => processNotifications([note("d1")], deps), /db down/);
  assert.deepEqual(calls.released, ["d1"]);
});

test("isAuthorized accepts only the exact bearer secret", () => {
  assert.equal(isAuthorized("Bearer s3cret", "s3cret"), true);
  assert.equal(isAuthorized("Bearer wrong", "s3cret"), false);
  assert.equal(isAuthorized("s3cret", "s3cret"), false);
  assert.equal(isAuthorized(undefined, "s3cret"), false);
  assert.equal(isAuthorized("Bearer s3cret", undefined), false);
  assert.equal(isAuthorized("Bearer s3cret", ""), false);
  assert.equal(isAuthorized("Bearer s3cret-and-more", "s3cret"), false);
});

test("buildPayload shapes the push message the service worker reads", () => {
  assert.deepEqual(JSON.parse(buildPayload(note("d1"))), {
    title: "Habits",
    body: "2 habits left today: Read, Run",
    tag: "habit-d1",
    data: { url: "/habits" },
  });
});

test("isGone recognises 404 and 410 only", () => {
  assert.equal(isGone(gone), true);
  assert.equal(isGone({ statusCode: 404 }), true);
  assert.equal(isGone(flaky), false);
  assert.equal(isGone(null), false);
  assert.equal(isGone("x"), false);
});
