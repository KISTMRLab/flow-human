// Flow Human runtime: branching, weighted feedback, dialogue lists and session export.
// Pure functions shared by the browser editor, the CLI verifier and the tests.

const OPERATORS = new Set(["eq", "gte", "lte", "contains"]);
export const DEFAULT_VARIABLE = "score";

function asNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

// eq compares numerically when both sides are numbers ("4" equals "4.0"),
// otherwise as trimmed, case-insensitive text.
export function compareValues(operator, actual, expected) {
  const a = asNumber(actual), b = asNumber(expected);
  if (operator === "eq") return a !== null && b !== null ? a === b : String(actual ?? "").trim().toLowerCase() === String(expected ?? "").trim().toLowerCase();
  if (operator === "gte") return a !== null && b !== null && a >= b;
  if (operator === "lte") return a !== null && b !== null && a <= b;
  if (operator === "contains") return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
  return false;
}

// A branch tests the current answer (default) or an accumulated session variable:
// { source: "variable", variable: "score", operator: "gte", value: 6, target: "..." }.
export function evaluateBranch(node, answer, variables = {}) {
  for (const branch of node.branches || []) {
    if (!branch.target) continue;
    const actual = branch.source === "variable" ? variables[branch.variable || DEFAULT_VARIABLE] : answer;
    if (actual === undefined) continue;
    if (compareValues(branch.operator, actual, branch.value)) return branch.target;
  }
  return node.next || null;
}

// Choice options: "Yes=2, No=0" or [{label, weight}] or ["Yes", "No"].
export function parseOptions(options) {
  const list = Array.isArray(options) ? options : String(options ?? "").split(",");
  return list.map((option) => {
    if (option && typeof option === "object") return { label: String(option.label ?? option.value ?? "").trim(), weight: asNumber(option.weight) };
    const text = String(option).trim(), split = text.lastIndexOf("=");
    if (split > 0) return { label: text.slice(0, split).trim(), weight: asNumber(text.slice(split + 1)), raw: text };
    return { label: text, weight: null };
  }).filter((option) => option.label);
}

// Weighted value contributed by one answer: a choice option's weight, or a
// number answer times the node's optional numeric weight (default 1).
export function feedbackWeight(node, answer) {
  if (node.feedbackType === "choice") {
    const option = parseOptions(node.options).find((item) => item.label === String(answer).trim());
    return option?.weight ?? null;
  }
  if (node.feedbackType === "number") {
    const value = asNumber(answer);
    if (value === null) return null;
    const factor = node.weight === undefined || node.weight === "" ? 1 : asNumber(node.weight);
    return factor === null ? null : value * factor;
  }
  return null;
}

// Record one feedback answer, accumulate its weight into session.variables and return the next node ID.
export function applyFeedback(session, node, answer, now = new Date().toISOString()) {
  session.answers[node.id] = answer;
  const weight = feedbackWeight(node, answer), variable = node.variable || DEFAULT_VARIABLE;
  const event = { type: "feedback", nodeId: node.id, value: answer, emittedAt: now };
  if (weight !== null) {
    session.variables[variable] = (Number(session.variables[variable]) || 0) + weight;
    Object.assign(event, { weight, variable, total: session.variables[variable] });
  }
  session.events.push(event);
  const next = evaluateBranch(node, answer, session.variables);
  session.events.push({ type: "transition", nodeId: node.id, target: next, emittedAt: now });
  return next;
}

// Chat nodes hold a dialogue list. "sequence" speaks every line in order;
// "random" speaks one variant. A plain `text` string remains valid.
export function dialogueLines(node, random = Math.random) {
  const lines = (Array.isArray(node.dialogue) ? node.dialogue : []).map((line) => String(typeof line === "object" ? line?.text ?? "" : line).trim()).filter(Boolean);
  if (!lines.length) return node.text?.trim() ? [node.text.trim()] : [];
  if (node.dialogueMode === "random") return [lines[Math.min(lines.length - 1, Math.floor(random() * lines.length))]];
  return lines;
}

export function behaviorEvents(text, gesture = "open_hand") {
  return [
    { type: "dialogue", value: text, atMs: 0 },
    { type: "gesture", value: gesture, atMs: 0 },
    // The renderer's speech path derives phoneme visemes from this text during playback.
    { type: "viseme", value: "text-phonemes", source: "speech-text", atMs: 0 },
  ];
}

export function validateFlow(flow) {
  const errors = [];
  if (!Array.isArray(flow?.nodes)) return ["The flow needs a nodes array."];
  const ids = new Set(flow.nodes.map((node) => node.id));
  if (!flow.startId || !ids.has(flow.startId)) errors.push("Select an existing start node.");
  if (ids.size !== flow.nodes.length) errors.push("Node IDs must be unique.");
  for (const node of flow.nodes) {
    if (!dialogueLines(node, () => 0).length) errors.push(`${node.id}: dialogue text is required.`);
    if (node.dialogueMode && !["sequence", "random"].includes(node.dialogueMode)) errors.push(`${node.id}: dialogue mode must be sequence or random.`);
    const targets = [node.next, ...(node.branches || []).map((branch) => branch.target)].filter(Boolean);
    for (const target of targets) if (!ids.has(target)) errors.push(`${node.id}: target '${target}' does not exist.`);
    for (const branch of node.branches || []) {
      if (!OPERATORS.has(branch.operator)) errors.push(`${node.id}: unknown branch operator '${branch.operator}'.`);
      if (branch.source === "variable" && !String(branch.variable || DEFAULT_VARIABLE).trim()) errors.push(`${node.id}: variable branches need a variable name.`);
    }
    if (node.type === "feedback") {
      if (!["choice", "number", "text"].includes(node.feedbackType)) errors.push(`${node.id}: choose a feedback type.`);
      if (node.feedbackType === "choice") {
        const options = parseOptions(node.options);
        if (!options.length) errors.push(`${node.id}: choice feedback needs at least one option.`);
        if (options.some((option) => option.raw && option.weight === null)) errors.push(`${node.id}: option weights must be numbers (e.g. Yes=2).`);
      }
      if (node.feedbackType === "number" && node.weight !== undefined && node.weight !== "" && asNumber(node.weight) === null) errors.push(`${node.id}: the numeric weight must be a number.`);
    }
  }
  if (flow.startId && ids.has(flow.startId)) {
    const byId = Object.fromEntries(flow.nodes.map((node) => [node.id, node]));
    const seen = new Set();
    const visit = (id) => {
      if (!id || seen.has(id) || !byId[id]) return;
      seen.add(id);
      const node = byId[id];
      visit(node.next);
      for (const branch of node.branches || []) visit(branch.target);
    };
    visit(flow.startId);
    for (const id of ids) if (!seen.has(id)) errors.push(`${id}: unreachable from the start node.`);
    const terminating = new Set(flow.nodes.filter((node) => !node.next && !(node.branches || []).some((branch) => branch.target)).map((node) => node.id));
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of flow.nodes) {
        const targets = [node.next, ...(node.branches || []).map((branch) => branch.target)].filter(Boolean);
        if (!terminating.has(node.id) && targets.some((target) => terminating.has(target))) {
          terminating.add(node.id); changed = true;
        }
      }
    }
    if (!terminating.has(flow.startId)) errors.push("The start node has no path to a terminating node.");
  }
  return errors;
}

export function createSession(flow) {
  return { currentId: flow.startId, answers: {}, variables: {}, transcript: [], events: [], complete: false, startedAt: new Date().toISOString() };
}

// Post-analysis export: answers, accumulated variables, transcript and events.
export function sessionExport(session, flow = null) {
  return { format: "flow-human-session", version: 1, exportedAt: new Date().toISOString(), startId: flow?.startId ?? null,
    complete: Boolean(session.complete), answers: session.answers, variables: session.variables, transcript: session.transcript, events: session.events };
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  const formula = /^[=+\-@\t\r]/.test(text) && asNumber(text) === null;
  return formula || /[",\r\n]/.test(text) ? `"${(formula ? "'" : "") + text.replace(/"/g, '""')}"` : text;
}

// One row per event plus one summary row per variable; formula-like cells are neutralised for spreadsheets.
export function sessionToCSV(session) {
  const columns = ["kind", "nodeId", "type", "value", "weight", "variable", "total", "target", "emittedAt"];
  const rows = session.events.map((event) => ({ kind: "event", ...event }));
  for (const [variable, total] of Object.entries(session.variables || {})) rows.push({ kind: "variable", variable, total });
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n") + "\r\n";
}
