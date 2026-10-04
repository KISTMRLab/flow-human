import assert from "node:assert/strict";
import test from "node:test";
import { behaviorEvents, evaluateBranch, validateFlow } from "./core.js";

test("weighted feedback chooses a conditional branch", () => {
  const node = { next: "low", branches: [{ operator: "gte", value: "4", target: "high" }] };
  assert.equal(evaluateBranch(node, 5), "high");
  assert.equal(evaluateBranch(node, 2), "low");
});

test("free-text feedback supports contains branches", () => {
  const node = { next: "fallback", branches: [{ operator: "contains", value: "unclear", target: "clarify" }] };
  assert.equal(evaluateBranch(node, "The second part was unclear"), "clarify");
});

test("dialogue produces coordinated behavior channels", () => {
  const types = new Set(behaviorEvents("Welcome to the service", "welcome").map((event) => event.type));
  assert.deepEqual(types, new Set(["dialogue", "gesture", "viseme"]));
});

test("validator catches dangling edges", () => {
  const errors = validateFlow({ startId: "a", nodes: [{ id: "a", type: "dialogue", text: "Hello", next: "missing" }] });
  assert.ok(errors.some((error) => error.includes("does not exist")));
});

test("validator catches a flow trapped in a cycle", () => {
  const errors = validateFlow({ startId: "a", nodes: [
    { id: "a", type: "dialogue", text: "A", next: "b" },
    { id: "b", type: "dialogue", text: "B", next: "a" },
  ] });
  assert.ok(errors.some((error) => error.includes("no path")));
});
