export function evaluateBranch(node, answer) {
  for (const branch of node.branches || []) {
    const isText = branch.operator === "eq" || branch.operator === "contains";
    const value = isText ? String(answer) : Number(answer);
    const expected = isText ? String(branch.value) : Number(branch.value);
    if (branch.operator === "eq" && value === expected) return branch.target;
    if (branch.operator === "gte" && Number.isFinite(value) && value >= expected) return branch.target;
    if (branch.operator === "lte" && Number.isFinite(value) && value <= expected) return branch.target;
    if (branch.operator === "contains" && value.toLowerCase().includes(expected.toLowerCase())) return branch.target;
  }
  return node.next || null;
}

export function behaviorEvents(text, gesture = "open_hand") {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const visemes = words.map((word, index) => ({
    type: "viseme",
    value: /^[aeiou]/i.test(word) ? "open" : "narrow",
    atMs: index * 180,
    intensity: Math.min(1, 0.35 + word.length / 12),
  }));
  return [
    { type: "dialogue", value: text, atMs: 0 },
    { type: "gesture", value: gesture, atMs: 120 },
    ...visemes,
  ];
}

export function validateFlow(flow) {
  const errors = [];
  const ids = new Set(flow.nodes.map((node) => node.id));
  if (!flow.startId || !ids.has(flow.startId)) errors.push("Select an existing start node.");
  if (ids.size !== flow.nodes.length) errors.push("Node IDs must be unique.");
  for (const node of flow.nodes) {
    if (!node.text?.trim()) errors.push(`${node.id}: dialogue text is required.`);
    const targets = [node.next, ...(node.branches || []).map((branch) => branch.target)].filter(Boolean);
    for (const target of targets) if (!ids.has(target)) errors.push(`${node.id}: target '${target}' does not exist.`);
    if (node.type === "feedback" && !["choice", "number", "text"].includes(node.feedbackType)) {
      errors.push(`${node.id}: choose a feedback type.`);
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
  return { currentId: flow.startId, answers: {}, variables: {}, transcript: [], events: [], complete: false };
}
