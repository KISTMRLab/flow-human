import assert from "node:assert/strict";
import test from "node:test";
import { applyFeedback, behaviorEvents, compareValues, createSession, dialogueLines, evaluateBranch, feedbackWeight, parseOptions, sessionExport, sessionToCSV, validateFlow } from "./core.js";
import { demo } from "./demo-flow.js";

test("numeric feedback chooses a conditional branch", () => {
  const node = { next: "low", branches: [{ operator: "gte", value: "4", target: "high" }] };
  assert.equal(evaluateBranch(node, 5), "high");
  assert.equal(evaluateBranch(node, 2), "low");
});

test("eq compares numbers numerically and text case-insensitively", () => {
  // Audit regression: "4" did not equal "4.0".
  const node = { next: "other", branches: [{ operator: "eq", value: "4", target: "four" }] };
  assert.equal(evaluateBranch(node, "4.0"), "four");
  assert.equal(evaluateBranch(node, 4), "four");
  assert.equal(evaluateBranch(node, "40"), "other");
  assert.ok(compareValues("eq", " Yes ", "yes"));
  assert.ok(!compareValues("gte", "many", "3"));
});

test("free-text feedback supports contains branches", () => {
  const node = { next: "fallback", branches: [{ operator: "contains", value: "unclear", target: "clarify" }] };
  assert.equal(evaluateBranch(node, "The second part was unclear"), "clarify");
});

test("weighted choice options accumulate into session variables and drive variable branches", () => {
  const interest = { id: "interest", type: "feedback", feedbackType: "choice", options: "Product=2, Hours=1, Nothing=0", next: "rating" };
  const rating = { id: "rating", type: "feedback", feedbackType: "number", variable: "score", weight: "1", next: "low",
    branches: [{ source: "variable", variable: "score", operator: "gte", value: "6", target: "high" }] };
  const session = createSession({ startId: "interest" });
  assert.equal(applyFeedback(session, interest, "Product"), "rating");
  assert.deepEqual(session.variables, { score: 2 });
  assert.equal(applyFeedback(session, rating, "5"), "high");
  assert.deepEqual(session.variables, { score: 7 });
  const other = createSession({ startId: "interest" });
  applyFeedback(other, interest, "Hours");
  assert.equal(applyFeedback(other, rating, "4"), "low");
  const feedback = session.events.filter((event) => event.type === "feedback");
  assert.deepEqual(feedback.map((event) => [event.weight, event.total]), [[2, 2], [5, 7]]);
  assert.deepEqual(session.answers, { interest: "Product", rating: "5" });
});

test("option parsing accepts weights, plain labels and objects", () => {
  assert.deepEqual(parseOptions("Yes=2, No = -1, Maybe").map((o) => [o.label, o.weight]), [["Yes", 2], ["No", -1], ["Maybe", null]]);
  assert.deepEqual(parseOptions([{ label: "A", weight: 3 }]).map((o) => [o.label, o.weight]), [["A", 3]]);
  assert.equal(feedbackWeight({ feedbackType: "choice", options: "Yes,No" }, "Yes"), null);
  assert.equal(feedbackWeight({ feedbackType: "number", weight: "0.5" }, "4"), 2);
  assert.equal(feedbackWeight({ feedbackType: "text" }, "anything"), null);
});

test("chat nodes speak a dialogue list in order or one random variant, and keep single text", () => {
  const node = { text: "first", dialogue: ["first", "second", "third"] };
  assert.deepEqual(dialogueLines(node), ["first", "second", "third"]);
  assert.deepEqual(dialogueLines({ ...node, dialogueMode: "random" }, () => 0.5), ["second"]);
  assert.deepEqual(dialogueLines({ text: "Legacy single line" }), ["Legacy single line"]);
});

test("dialogue produces coordinated behavior channels", () => {
  const types = new Set(behaviorEvents("Welcome to the service", "welcome").map((event) => event.type));
  assert.deepEqual(types, new Set(["dialogue", "gesture", "viseme"]));
});

test("validator catches dangling edges", () => {
  const errors = validateFlow({ startId: "a", nodes: [{ id: "a", type: "dialogue", text: "Hello", next: "missing" }] });
  assert.ok(errors.some((error) => error.includes("does not exist")));
});

test("validator rejects choice nodes without options and bad weights", () => {
  const errors = validateFlow({ startId: "a", nodes: [
    { id: "a", type: "feedback", text: "Pick", feedbackType: "choice", options: "", next: "b" },
    { id: "b", type: "feedback", text: "Pick", feedbackType: "choice", options: "Yes=lots" },
  ] });
  assert.ok(errors.some((error) => error.startsWith("a: choice feedback needs")));
  assert.ok(errors.some((error) => error.startsWith("b: option weights")));
});

test("validator catches a flow trapped in a cycle", () => {
  const errors = validateFlow({ startId: "a", nodes: [
    { id: "a", type: "dialogue", text: "A", next: "b" },
    { id: "b", type: "dialogue", text: "B", next: "a" },
  ] });
  assert.ok(errors.some((error) => error.includes("no path")));
});

test("bundled demo flow is valid", () => assert.deepEqual(validateFlow(demo), []));

test("session export as JSON and CSV keeps answers, variables and escapes cells", () => {
  const session = createSession({ startId: "a" });
  applyFeedback(session, { id: "a", type: "feedback", feedbackType: "choice", options: "Yes=2, No=0" }, "Yes", "2026-10-06T00:00:00Z");
  applyFeedback(session, { id: "b", type: "feedback", feedbackType: "text" }, '=HYPERLINK("x"), "quoted"', "2026-10-06T00:00:01Z");
  const exported = sessionExport(session, { startId: "a" });
  assert.equal(exported.format, "flow-human-session");
  assert.deepEqual(exported.variables, { score: 2 });
  const csv = sessionToCSV(session).trim().split("\r\n");
  assert.equal(csv[0], "kind,nodeId,type,value,weight,variable,total,target,emittedAt");
  assert.equal(csv[1], "event,a,feedback,Yes,2,score,2,,2026-10-06T00:00:00Z");
  assert.ok(csv.some((row) => row.includes(`"'=HYPERLINK(""x""), ""quoted"""`)), "formula-like text is neutralised and quoted");
  assert.equal(csv.at(-1), "variable,,,,,score,2,,");
});
