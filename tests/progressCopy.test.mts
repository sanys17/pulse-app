import { test } from "node:test";
import assert from "node:assert/strict";
import { NAME_CAP, progressLine } from "../src/lib/progressCopy.ts";
import type { PlannedItem } from "../src/lib/progress.ts";

let seq = 0;
const open = (name: string): PlannedItem => ({ id: `i${++seq}`, name, done: false });
const done = (name: string): PlannedItem => ({ id: `i${++seq}`, name, done: true });

test("nothing planned is not the same as everything done", () => {
  assert.equal(progressLine([]), "Nothing planned today");
  assert.equal(progressLine([done("Gym")]), "Everything done");
});

test("planned but untouched", () => {
  assert.equal(progressLine([open("Gym"), open("Invoice")]), "Nothing yet today");
});

test("one left names it", () => {
  assert.equal(progressLine([done("A"), open("Gym")]), "Last one: Gym");
});

test("two or three left name the next one and count the rest", () => {
  assert.equal(progressLine([done("A"), open("Gym"), open("B")]), "Gym and 1 more");
  assert.equal(progressLine([done("A"), open("Gym"), open("B"), open("C")]), "Gym and 2 more");
});

test("four or more left is a bare count", () => {
  const items = [done("A"), open("B"), open("C"), open("D"), open("E"), open("F"), open("G")];
  assert.equal(progressLine(items), "6 left today");
});

test("'last one' never appears before anything has been done", () => {
  // One item, untouched: "Last one" would imply progress that has not happened.
  assert.equal(progressLine([open("Gym")]), "Nothing yet today");
});

test("a name is never transformed, whatever its grammar", () => {
  assert.equal(progressLine([done("A"), open("Go to gym")]), "Last one: Go to gym");
  assert.equal(
    progressLine([done("A"), open("Work on Pulse"), open("B"), open("C")]),
    "Work on Pulse and 2 more",
  );
  assert.equal(progressLine([done("A"), open("20 min reading")]), "Last one: 20 min reading");
});

test("a name keeps the user's own capitalisation", () => {
  assert.equal(progressLine([done("A"), open("creatine")]), "Last one: creatine");
});

test("a long name is capped", () => {
  assert.equal(progressLine([done("A"), open("Call mum about the thing")]), "Last one: Call mum about the…");
});

test("the capped name never exceeds the cap", () => {
  const line = progressLine([done("A"), open("x".repeat(100))]);
  assert.equal(line.length, "Last one: ".length + NAME_CAP);
});

test("a blank name does not produce a dangling line", () => {
  assert.equal(progressLine([done("A"), open("   ")]), "Last one: Untitled");
  assert.equal(progressLine([done("A"), open("")]), "Last one: Untitled");
});
