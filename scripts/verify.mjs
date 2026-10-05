import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyFeedback, behaviorEvents, createSession, dialogueLines, sessionExport, sessionToCSV, validateFlow } from "../core.js";
import { demo } from "../demo-flow.js";

const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${name} requires a value`);
  return args[index + 1];
}
const input = option("--flow", null);
const answersFile = option("--answers", null);
const output = option("--output", "outputs/verify");
const flow = input ? JSON.parse(await readFile(input, "utf8")) : structuredClone(demo);
const answers = answersFile ? JSON.parse(await readFile(answersFile, "utf8")) : { interest: "Product details", rating: "5" };
assert.deepEqual(validateFlow(flow), [], "Invalid flow");
const session = createSession(flow);
let steps = 0;
while (session.currentId) {
  if (++steps > 1000) throw new Error("Flow exceeded 1000 steps; inspect loops and answers");
  const node = flow.nodes.find((item) => item.id === session.currentId);
  for (const line of dialogueLines(node, () => 0)) {
    session.transcript.push({ speaker: "digital_human", nodeId: node.id, text: line });
    session.events.push(...behaviorEvents(line, node.gesture).map((event) => ({ ...event, nodeId: node.id })));
  }
  if (node.type === "feedback") {
    if (!(node.id in answers)) throw new Error(`Provide an answer for feedback node ${node.id} with --answers`);
    session.currentId = applyFeedback(session, node, answers[node.id]);
  } else session.currentId = node.next || null;
}
session.complete = true;
assert.ok(session.events.length > 0);
await mkdir(output, { recursive: true });
await writeFile(join(output, "flow.json"), JSON.stringify(flow, null, 2) + "\n");
await writeFile(join(output, "session.json"), JSON.stringify(sessionExport(session, flow), null, 2) + "\n");
await writeFile(join(output, "session.csv"), sessionToCSV(session));
console.log(`Completed ${steps} nodes; variables ${JSON.stringify(session.variables)}; wrote ${session.events.length} events to ${output}/session.json and session.csv`);
