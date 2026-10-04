import { behaviorEvents, createSession, evaluateBranch, validateFlow } from "./core.js";

import { demo } from "./demo-flow.js";

let flow = structuredClone(demo);
let session = null;
const byId = (id) => document.getElementById(id);
const canvas = byId("canvas");
const edges = byId("edges");

function nodeOptions(selected = "") {
  return `<option value="">End flow</option>${flow.nodes.map((n) => `<option value="${n.id}" ${n.id === selected ? "selected" : ""}>${n.id}</option>`).join("")}`;
}

function render() {
  byId("start-node").innerHTML = flow.nodes.map((n) => `<option value="${n.id}" ${n.id === flow.startId ? "selected" : ""}>${n.id}</option>`).join("");
  canvas.innerHTML = "";
  for (const node of flow.nodes) {
    const element = document.createElement("article");
    element.className = `node ${node.type}`;
    element.dataset.id = node.id;
    element.style.left = `${node.x}px`; element.style.top = `${node.y}px`;
    element.innerHTML = `<div class="node-head"><span>${node.type.toUpperCase()} · ${node.id}</span><button class="delete" type="button">×</button></div>
      <div class="node-body">
        <label>Spoken text<textarea data-field="text">${node.text || ""}</textarea></label>
        <label>Gesture<select data-field="gesture"><option>open_hand</option><option ${node.gesture === "welcome" ? "selected" : ""}>welcome</option><option ${node.gesture === "point" ? "selected" : ""}>point</option><option ${node.gesture === "thinking" ? "selected" : ""}>thinking</option></select></label>
        ${node.type === "feedback" ? feedbackEditor(node) : ""}
        <label>Default next<select data-field="next">${nodeOptions(node.next)}</select></label>
      </div>`;
    bindNode(element, node);
    canvas.append(element);
  }
  requestAnimationFrame(drawEdges);
}

function feedbackEditor(node) {
  const branches = (node.branches || []).map((branch, index) => `<div class="branch" data-index="${index}"><select data-branch="operator"><option value="eq" ${branch.operator === "eq" ? "selected" : ""}>=</option><option value="gte" ${branch.operator === "gte" ? "selected" : ""}>≥</option><option value="lte" ${branch.operator === "lte" ? "selected" : ""}>≤</option><option value="contains" ${branch.operator === "contains" ? "selected" : ""}>has</option></select><input data-branch="value" value="${branch.value}"><select data-branch="target">${nodeOptions(branch.target)}</select><button type="button" data-remove-branch>×</button></div>`).join("");
  return `<label>Response control<select data-field="feedbackType"><option value="choice" ${node.feedbackType === "choice" ? "selected" : ""}>Choice</option><option value="number" ${node.feedbackType === "number" ? "selected" : ""}>Number</option><option value="text" ${node.feedbackType === "text" ? "selected" : ""}>Text</option></select></label><label>Prompt<input data-field="prompt" value="${node.prompt || ""}"></label><label>Choice options, comma-separated<input data-field="options" value="${node.options || ""}"></label><div class="branch-list">${branches}</div><button class="add-branch" data-add-branch type="button">+ conditional branch</button>`;
}

function bindNode(element, node) {
  element.querySelectorAll("[data-field]").forEach((input) => input.addEventListener("input", () => { node[input.dataset.field] = input.value; drawEdges(); }));
  element.querySelector(".delete").addEventListener("click", () => { flow.nodes = flow.nodes.filter((item) => item !== node); if (flow.startId === node.id) flow.startId = flow.nodes[0]?.id || ""; render(); });
  element.querySelectorAll("[data-branch]").forEach((input) => input.addEventListener("input", () => { node.branches[Number(input.closest(".branch").dataset.index)][input.dataset.branch] = input.value; drawEdges(); }));
  element.querySelectorAll("[data-remove-branch]").forEach((button) => button.addEventListener("click", () => { node.branches.splice(Number(button.closest(".branch").dataset.index), 1); render(); }));
  element.querySelector("[data-add-branch]")?.addEventListener("click", () => { (node.branches ||= []).push({ operator: "eq", value: "", target: "" }); render(); });
  const handle = element.querySelector(".node-head");
  handle.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    handle.setPointerCapture(event.pointerId);
    const offsetX = event.clientX - node.x, offsetY = event.clientY - node.y;
    const move = (e) => { node.x = Math.max(0, e.clientX - offsetX); node.y = Math.max(0, e.clientY - offsetY); element.style.left = `${node.x}px`; element.style.top = `${node.y}px`; drawEdges(); };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", () => handle.removeEventListener("pointermove", move), { once: true });
  });
}

function drawEdges() {
  edges.innerHTML = `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#28786f"/></marker></defs>`;
  const positions = Object.fromEntries(flow.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
  for (const node of flow.nodes) for (const target of [node.next, ...(node.branches || []).map((b) => b.target)].filter(Boolean)) {
    if (!positions[target]) continue;
    const x1 = node.x + 250, y1 = node.y + 60, x2 = positions[target].x, y2 = positions[target].y + 60;
    edges.insertAdjacentHTML("beforeend", `<path class="edge" d="M${x1} ${y1} C${x1 + 65} ${y1},${x2 - 65} ${y2},${x2} ${y2}"/>`);
  }
}

function addNode(type) {
  const id = `${type}-${Date.now().toString(36)}`;
  flow.nodes.push({ id, type, text: type === "feedback" ? "Please provide feedback." : "Write dialogue here.", gesture: "open_hand", next: "", branches: [], feedbackType: "choice", prompt: "Choose one", options: "Yes,No", x: 60 + flow.nodes.length * 35, y: 80 + flow.nodes.length * 35 });
  if (!flow.startId) flow.startId = id;
  render();
}

function logSession() { byId("session-log").textContent = JSON.stringify(session, null, 2); }
function speak(text) { if (byId("voice").checked && "speechSynthesis" in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(text)); } }

function showCurrent() {
  if (!session?.currentId) { session.complete = true; byId("speech").textContent = "Flow complete."; byId("advance").disabled = true; byId("feedback-form").hidden = true; logSession(); return; }
  const node = flow.nodes.find((item) => item.id === session.currentId);
  if (!node) return;
  const events = behaviorEvents(node.text, node.gesture);
  session.events.push(...events.map((event) => ({ ...event, nodeId: node.id, emittedAt: new Date().toISOString() })));
  session.transcript.push({ speaker: "digital_human", text: node.text, nodeId: node.id });
  byId("speech").textContent = node.text; byId("avatar").dataset.gesture = node.gesture || "open_hand"; speak(node.text);
  for (const event of events.filter((event) => event.type === "viseme")) setTimeout(() => { const mouth = document.querySelector(".mouth"); mouth.classList.toggle("open", event.value === "open"); }, event.atMs);
  const form = byId("feedback-form"); form.hidden = node.type !== "feedback"; byId("advance").disabled = node.type === "feedback";
  if (node.type === "feedback") renderFeedback(node); else byId("advance").onclick = () => { session.currentId = node.next || null; showCurrent(); };
  logSession();
}

function renderFeedback(node) {
  let control = `<input name="answer" required>`;
  if (node.feedbackType === "number") control = `<input name="answer" type="number" min="1" max="5" required>`;
  if (node.feedbackType === "choice") control = `<select name="answer" required>${node.options.split(",").map((option) => `<option>${option.trim()}</option>`).join("")}</select>`;
  byId("feedback-fields").innerHTML = `<label>${node.prompt || node.text}${control}</label>`;
  byId("feedback-form").onsubmit = (event) => { event.preventDefault(); const answer = new FormData(event.currentTarget).get("answer"); session.answers[node.id] = answer; session.events.push({ type: "feedback", nodeId: node.id, value: answer, emittedAt: new Date().toISOString() }); session.currentId = evaluateBranch(node, answer); showCurrent(); };
}

byId("add-dialogue").onclick = () => addNode("dialogue"); byId("add-feedback").onclick = () => addNode("feedback");
byId("start-node").onchange = (event) => { flow.startId = event.target.value; };
byId("validate").onclick = () => { const errors = validateFlow(flow); const box = byId("validation"); box.className = errors.length ? "" : "ok"; box.innerHTML = errors.length ? errors.map((e) => `• ${e}`).join("<br>") : "Flow is structurally valid."; };
byId("run").onclick = () => { const errors = validateFlow(flow); if (errors.length) { byId("validate").click(); return; } session = createSession(flow); showCurrent(); };
byId("export").onclick = () => { const blob = new Blob([JSON.stringify(flow, null, 2)], { type: "application/json" }); const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "flow-human.json" }); link.click(); URL.revokeObjectURL(link.href); };
byId("import").onchange = async (event) => { flow = JSON.parse(await event.target.files[0].text()); render(); };
render();
