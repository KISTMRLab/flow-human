import {createStage} from "./static/avatar.js?v=20261006-paper5";
import {Speech} from "./static/speech.js?v=20261006-paper5";
import {prepareApplicationMotion,gestureSummary} from "./static/application-gesture.js?v=20261006-paper5";
import {MotionSequence} from "./static/gesture-library.js?v=20261006-paper5";
import {exampleMap,motionData,retrieveGesture,ruleResult,validateMap} from "./gesture-map.js?v=20261006-pf";
import {DEFAULT_VARIABLE,applyFeedback,behaviorEvents,createSession,dialogueLines,parseOptions,sessionExport,sessionToCSV,validateFlow} from "./core.js?v=20261006-pf";
import {demo} from "./demo-flow.js?v=20261006-pf";

const STORAGE_KEY = "flow-human/v1";
const GESTURES = ["open_hand", "welcome", "point", "thinking", "nod", "wave", "reassure"];
let flow = structuredClone(demo);
let session = null;
const byId = (id) => document.getElementById(id);
const canvas = byId("canvas");
const edges = byId("edges");
const stage=createStage(byId("three-stage")),speech=new Speech(stage);
// Blink, breathing and head idle are renderer behaviors independent of the flow (paper section 2.1).
stage.setIdle?.(true);
let gestureMap=structuredClone(exampleMap),gestureMapName="built-in example map",activeMotion=null,showGeneration=0;

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const selected = (condition) => condition ? "selected" : "";

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ flow, session, savedAt: new Date().toISOString() })); } catch { /* storage may be blocked */ }
}
function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    // Work in progress may be invalid (e.g. a new unconnected node); Validate/Run report it.
    if (!Array.isArray(saved?.flow?.nodes) || !saved.flow.nodes.every((node) => node && typeof node.id === "string")) return false;
    flow = saved.flow; session = saved.session || null; return true;
  } catch { return false; }
}

function nodeOptions(selectedId = "") {
  return `<option value="">End flow</option>${flow.nodes.map((n) => `<option value="${esc(n.id)}" ${selected(n.id === selectedId)}>${esc(n.id)}</option>`).join("")}`;
}
function variableNames() {
  return [...new Set([DEFAULT_VARIABLE, ...flow.nodes.filter((n) => n.type === "feedback").map((n) => n.variable || DEFAULT_VARIABLE), ...flow.nodes.flatMap((n) => (n.branches || []).filter((b) => b.source === "variable").map((b) => b.variable || DEFAULT_VARIABLE))])];
}
function gestureOptions(current) {
  const values = current && current !== "auto" && !GESTURES.includes(current) ? [...GESTURES, current] : GESTURES;
  return `<option value="auto" ${selected(!current || current === "auto")}>Automatic retrieval</option>${values.map((g) => `<option ${selected(current === g)}>${esc(g)}</option>`).join("")}`;
}

function render() {
  byId("start-node").innerHTML = flow.nodes.map((n) => `<option value="${esc(n.id)}" ${selected(n.id === flow.startId)}>${esc(n.id)}</option>`).join("");
  canvas.innerHTML = "";
  for (const node of flow.nodes) {
    const element = document.createElement("article");
    element.className = `node ${node.type === "feedback" ? "feedback" : "dialogue"}`;
    element.dataset.id = node.id;
    element.style.left = `${node.x}px`; element.style.top = `${node.y}px`;
    const lines = Array.isArray(node.dialogue) && node.dialogue.length ? node.dialogue.map((l) => typeof l === "object" ? l.text : l).join("\n") : node.text || "";
    element.innerHTML = `<span class="port in" title="Drop a connection here"></span><div class="node-head"><span>${esc(String(node.type).toUpperCase())} · ${esc(node.id)}</span><button class="delete" type="button" aria-label="Delete node">×</button></div>
      <div class="node-body">
        <label>Dialogue list, one line per row<textarea data-field="dialogue">${esc(lines)}</textarea></label>
        <label>Lines<select data-field="dialogueMode"><option value="sequence" ${selected(node.dialogueMode !== "random")}>Speak in order</option><option value="random" ${selected(node.dialogueMode === "random")}>One random variant</option></select></label>
        <label>Gesture<select data-field="gesture">${gestureOptions(node.gesture)}</select></label>
        ${node.type === "feedback" ? feedbackEditor(node) : ""}
        <label class="port-row">Default next<select data-field="next">${nodeOptions(node.next)}</select><span class="port out" data-edge="next" title="Drag to a node to connect"></span></label>
      </div>`;
    bindNode(element, node);
    canvas.append(element);
  }
  requestAnimationFrame(drawEdges);
  save();
}

function feedbackEditor(node) {
  const variables = variableNames();
  const branches = (node.branches || []).map((branch, index) => {
    const source = branch.source === "variable" ? `var:${branch.variable || DEFAULT_VARIABLE}` : "answer";
    return `<div class="branch port-row" data-index="${index}"><select data-branch="source" title="Test the answer or an accumulated variable"><option value="answer" ${selected(source === "answer")}>answer</option>${variables.map((v) => `<option value="var:${esc(v)}" ${selected(source === `var:${v}`)}>${esc(v)}</option>`).join("")}</select><select data-branch="operator"><option value="eq" ${selected(branch.operator === "eq")}>=</option><option value="gte" ${selected(branch.operator === "gte")}>≥</option><option value="lte" ${selected(branch.operator === "lte")}>≤</option><option value="contains" ${selected(branch.operator === "contains")}>has</option></select><input data-branch="value" value="${esc(branch.value)}" aria-label="Branch value"><select data-branch="target">${nodeOptions(branch.target)}</select><button type="button" data-remove-branch aria-label="Remove branch">×</button><span class="port out" data-edge="branch-${index}" title="Drag to a node to connect"></span></div>`;
  }).join("");
  return `<label>Response control<select data-field="feedbackType"><option value="choice" ${selected(node.feedbackType === "choice")}>Choice</option><option value="number" ${selected(node.feedbackType === "number")}>Number</option><option value="text" ${selected(node.feedbackType === "text")}>Text</option></select></label><label>Prompt<input data-field="prompt" value="${esc(node.prompt)}"></label><label>Choice options, comma-separated; weights as Yes=2<input data-field="options" value="${esc(Array.isArray(node.options) ? node.options.map((o) => typeof o === "object" ? `${o.label}=${o.weight}` : o).join(", ") : node.options)}"></label><div class="pair"><label>Adds to variable<input data-field="variable" value="${esc(node.variable || DEFAULT_VARIABLE)}"></label><label>Number weight<input data-field="weight" value="${esc(node.weight ?? "")}" placeholder="1"></label></div><div class="branch-list">${branches}</div><button class="add-branch" data-add-branch type="button">+ conditional branch</button>`;
}

function bindNode(element, node) {
  element.querySelectorAll("[data-field]").forEach((input) => input.addEventListener("input", () => {
    const field = input.dataset.field;
    if (field === "dialogue") { node.dialogue = input.value.split("\n").map((line) => line.trim()).filter(Boolean); node.text = node.dialogue[0] || ""; }
    else node[field] = input.value;
    drawEdges(); save();
  }));
  element.querySelector(".delete").addEventListener("click", () => { flow.nodes = flow.nodes.filter((item) => item !== node); if (flow.startId === node.id) flow.startId = flow.nodes[0]?.id || ""; render(); });
  element.querySelectorAll("[data-branch]").forEach((input) => input.addEventListener("input", () => {
    const branch = node.branches[Number(input.closest(".branch").dataset.index)];
    if (input.dataset.branch === "source") {
      if (input.value === "answer") { delete branch.source; delete branch.variable; }
      else { branch.source = "variable"; branch.variable = input.value.slice(4); }
    } else branch[input.dataset.branch] = input.value;
    drawEdges(); save();
  }));
  element.querySelectorAll("[data-remove-branch]").forEach((button) => button.addEventListener("click", () => { node.branches.splice(Number(button.closest(".branch").dataset.index), 1); render(); }));
  element.querySelector("[data-add-branch]")?.addEventListener("click", () => { (node.branches ||= []).push({ operator: "eq", value: "", target: "" }); render(); });
  element.querySelectorAll(".port.out").forEach((port) => port.addEventListener("pointerdown", (event) => startConnection(event, node, port)));
  const handle = element.querySelector(".node-head");
  handle.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    handle.setPointerCapture(event.pointerId);
    const offsetX = event.clientX - node.x, offsetY = event.clientY - node.y;
    const move = (e) => { node.x = Math.max(0, e.clientX - offsetX); node.y = Math.max(0, e.clientY - offsetY); element.style.left = `${node.x}px`; element.style.top = `${node.y}px`; drawEdges(); };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", () => { handle.removeEventListener("pointermove", move); save(); }, { once: true });
  });
}

// Port-based edges: drag from an output port and drop on a node to connect;
// drop on empty canvas to disconnect. The dropdowns remain as a fallback.
function centre(element) {
  const box = element.getBoundingClientRect(), origin = canvas.getBoundingClientRect();
  return { x: box.left + box.width / 2 - origin.left, y: box.top + box.height / 2 - origin.top };
}
function curve(a, b) { return `M${a.x} ${a.y} C${a.x + 65} ${a.y},${b.x - 65} ${b.y},${b.x} ${b.y}`; }
function setEdge(node, edge, target) {
  if (edge === "next") node.next = target;
  else node.branches[Number(edge.slice(7))].target = target;
}
function startConnection(event, node, port) {
  event.preventDefault(); event.stopPropagation();
  port.setPointerCapture(event.pointerId);
  const from = centre(port), origin = canvas.getBoundingClientRect();
  const preview = document.createElementNS("http://www.w3.org/2000/svg", "path");
  preview.setAttribute("class", "edge pending"); edges.append(preview);
  const move = (e) => preview.setAttribute("d", curve(from, { x: e.clientX - origin.left, y: e.clientY - origin.top }));
  move(event);
  port.addEventListener("pointermove", move);
  port.addEventListener("pointerup", (e) => {
    port.removeEventListener("pointermove", move); preview.remove();
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest(".node")?.dataset.id || "";
    if (target === node.id) return;
    setEdge(node, port.dataset.edge, target);
    render();
  }, { once: true });
}

function drawEdges() {
  edges.innerHTML = `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#28786f"/></marker></defs>`;
  for (const element of canvas.querySelectorAll(".node")) {
    const node = flow.nodes.find((n) => n.id === element.dataset.id);
    if (!node) continue;
    for (const port of element.querySelectorAll(".port.out")) {
      const edge = port.dataset.edge, target = edge === "next" ? node.next : node.branches?.[Number(edge.slice(7))]?.target;
      const targetElement = target && canvas.querySelector(`.node[data-id="${CSS.escape(target)}"] .port.in`);
      if (!targetElement) continue;
      edges.insertAdjacentHTML("beforeend", `<path class="edge ${edge === "next" ? "" : "conditional"}" d="${curve(centre(port), centre(targetElement))}"/>`);
    }
  }
}

function addNode(type) {
  const id = `${type}-${Date.now().toString(36)}`;
  const text = type === "feedback" ? "Please provide feedback." : "Write dialogue here.";
  flow.nodes.push({ id, type, text, dialogue: [text], dialogueMode: "sequence", gesture: "auto", next: "", branches: [], feedbackType: "choice", prompt: "Choose one", options: "Yes=1, No=0", variable: DEFAULT_VARIABLE, x: 60 + flow.nodes.length * 35, y: 80 + flow.nodes.length * 35 });
  if (!flow.startId) flow.startId = id;
  render();
}

function logSession() {
  byId("session-log").textContent = JSON.stringify(session, null, 2);
  const variables = Object.entries(session?.variables || {});
  byId("variables").textContent = variables.length ? `Variables: ${variables.map(([k, v]) => `${k} = ${v}`).join(", ")}` : "Variables: none yet";
  for (const id of ["download-json", "download-csv"]) byId(id).disabled = !session;
  save();
}

// Rule-map matching: maps with their own word vectors match in the browser;
// otherwise the server matches with Sentence-BERT (local model) or TF-IDF.
async function matchRule(text) {
  if (gestureMap.vectors) return retrieveGesture(text, gestureMap);
  try {
    const response = await fetch("/api/gesture-match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, rules: gestureMap.rules.map(({ phrase, gesture }) => ({ phrase, gesture })), floor: gestureMap.floor }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return { ...ruleResult(gestureMap, result.index === null ? null : gestureMap.rules[result.index], result.score, result.backend), floor: result.floor };
  } catch { return retrieveGesture(text, gestureMap); }
}

async function prepareLine(node, line) {
  if (node.gesture && node.gesture !== "auto") return { pose: node.gesture, route: "manual-node-gesture" };
  if (byId("gesture-source").value === "map") {
    const match = await matchRule(line), data = motionData(match, line);
    const route = `rule-map:${match.backend}${match.matched ? "" : ":below-floor-idle"}`;
    if (data) return { motion: new MotionSequence(stage).load(data, line), data, route, match };
    return { pose: match.matched ? match.gesture : "idle", route, match };
  }
  try { const prepared = await prepareApplicationMotion(stage, line, { mode: "automatic" }); return { ...prepared, route: prepared.data?.trace?.routes?.join(", ") || "recorded-beat" }; }
  catch (error) { byId("speech-status").textContent = `Recorded co-speech unavailable: ${error.message}`; return { pose: "idle", route: "recorded-library-unavailable" }; }
}

function speakLine(text, motion, pose) {
  return new Promise((resolve) => {
    const silent = () => { stage.gesture(pose || "idle"); if (motion) motion.playSilent(); setTimeout(resolve, 1000 * Math.max(1.2, motion?.sourceDuration || text.split(/\s+/).length / 2.6)); };
    if (!byId("voice").checked) { silent(); return; }
    speech.speak(text, { backend: byId("speech-backend").value, lipSync: true,
      onStart: () => { if (motion) motion.onStart(); else stage.gesture(pose || "idle"); },
      onProgress: (clock) => motion?.onProgress(clock),
      onEnd: () => { motion?.onEnd(); stage.clearMotion(); stage.gesture("idle"); },
    }).then(resolve, (error) => { byId("speech-status").textContent = `${error.message}. Playing motion without speech.`; silent(); });
  });
}

function stopPlayback() { speech.cancel(); activeMotion?.onEnd(); activeMotion = null; stage.clearMotion(); stage.gesture("idle"); }

async function playLines(node, lines, generation) {
  for (const line of lines) {
    const prepared = await prepareLine(node, line);
    if (generation !== showGeneration) return;
    activeMotion = prepared.motion || null;
    const now = new Date().toISOString();
    session.events.push({ type: "gesture_retrieval", nodeId: node.id, text: line, route: prepared.route, sequence: (prepared.data?.slots || []).map((slot) => slot.gesture_id || slot.id), ruleMatch: prepared.match ? { gesture: prepared.match.gesture, phrase: prepared.match.phrase, score: prepared.match.score, backend: prepared.match.backend } : null, emittedAt: now });
    session.events.push(...behaviorEvents(line, prepared.motion ? "recorded_co_speech" : prepared.pose).map((event) => ({ ...event, nodeId: node.id, emittedAt: now })));
    session.transcript.push({ speaker: "digital_human", text: line, nodeId: node.id });
    byId("speech").textContent = line;
    byId("speech-status").textContent = prepared.data ? gestureSummary(prepared.data) : `${prepared.route}: ${prepared.pose}`;
    logSession();
    await speakLine(line, activeMotion, prepared.pose);
    if (generation !== showGeneration) return;
  }
}

function showCurrent() {
  const generation = ++showGeneration; stopPlayback();
  if (!session?.currentId) { session.complete = true; byId("speech").textContent = "Flow complete."; byId("advance").disabled = true; byId("feedback-form").hidden = true; logSession(); return; }
  const node = flow.nodes.find((item) => item.id === session.currentId);
  if (!node) return;
  const form = byId("feedback-form"); form.hidden = node.type !== "feedback"; byId("advance").disabled = node.type === "feedback";
  if (node.type === "feedback") renderFeedback(node); else byId("advance").onclick = () => { session.events.push({ type: "transition", nodeId: node.id, target: node.next || null, emittedAt: new Date().toISOString() }); session.currentId = node.next || null; showCurrent(); };
  logSession();
  playLines(node, dialogueLines(node), generation);
}

function renderFeedback(node) {
  const fields = byId("feedback-fields"), label = document.createElement("label");
  let control = Object.assign(document.createElement("input"), { name: "answer", required: true });
  if (node.feedbackType === "number") Object.assign(control, { type: "number", min: 1, max: 5, step: "any" });
  if (node.feedbackType === "choice") {
    const options = parseOptions(node.options);
    if (options.length) { control = Object.assign(document.createElement("select"), { name: "answer", required: true }); for (const option of options) control.append(new Option(option.label, option.label)); }
    else label.append(Object.assign(document.createElement("small"), { textContent: "This choice node has no options; type an answer instead. " }));
  }
  label.prepend(node.prompt || dialogueLines(node, () => 0)[0] || "");
  label.append(control);
  fields.replaceChildren(label);
  byId("feedback-form").onsubmit = (event) => { event.preventDefault(); const answer = new FormData(event.currentTarget).get("answer"); session.currentId = applyFeedback(session, node, answer); showCurrent(); };
}

function download(name, type, content) {
  const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([content], { type })), download: name });
  link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

byId("add-dialogue").onclick = () => addNode("dialogue"); byId("add-feedback").onclick = () => addNode("feedback");
byId("start-node").onchange = (event) => { flow.startId = event.target.value; save(); };
byId("validate").onclick = () => { const errors = validateFlow(flow); const box = byId("validation"); box.className = errors.length ? "" : "ok"; box.replaceChildren(...(errors.length ? errors.flatMap((e, i) => [...(i ? [document.createElement("br")] : []), `• ${e}`]) : ["Flow is structurally valid."])); };
byId("run").onclick = () => { const errors = validateFlow(flow); if (errors.length) { byId("validate").click(); return; } session = createSession(flow); showCurrent(); };
byId("export").onclick = () => download("flow-human.json", "application/json", JSON.stringify(flow, null, 2));
byId("download-json").onclick = () => session && download(`flow-human-session-${Date.now()}.json`, "application/json", JSON.stringify(sessionExport(session, flow), null, 2));
byId("download-csv").onclick = () => session && download(`flow-human-session-${Date.now()}.csv`, "text/csv", sessionToCSV(session));
byId("reset-example").onclick = () => { try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ } flow = structuredClone(demo); session = null; stopPlayback(); render(); logSession(); byId("validation").textContent = "Restored the bundled example; saved browser state cleared."; };
byId("import").onchange = async (event) => { try { const candidate=JSON.parse(await event.target.files[0].text());const errors=validateFlow(candidate);if(errors.length)throw new Error(errors.join('; '));flow=candidate;session=null;stopPlayback();render();logSession(); }catch(error){byId("validation").textContent=error.message;} };
byId("gesture-map").onchange=async e=>{try{gestureMap=validateMap(JSON.parse(await e.target.files[0].text()));gestureMapName=e.target.files[0].name;byId("gesture-source").value="map";const framed=gestureMap.rules.filter(r=>Array.isArray(r.frames)).length;byId("speech-status").textContent=`Loaded ${gestureMap.rules.length} rules (${framed} with motion frames) from ${gestureMapName}; automatic nodes now use this map.`;}catch(error){byId("speech-status").textContent=error.message;}};
byId("audio-file").onchange=async e=>{try{const result=await speech.transcribe(e.target.files[0]);const input=byId("feedback-fields").querySelector("input,textarea");if(input)input.value=result.text;byId("speech-status").textContent=result.text;}catch(error){byId("speech-status").textContent=error.message;}};
fetch("/api/gesture-status").then((r) => r.json()).then((s) => { byId("gesture-source").querySelector('[value="map"]').textContent = `Rule map (${s.backend === "sbert" ? "Sentence-BERT" : "TF-IDF"} match)`; }).catch(() => {});
const restored = restore();
render(); logSession();
if (restored) byId("validation").textContent = "Restored the flow and last session saved in this browser.";
window.addEventListener("pagehide",()=>{save();speech.cancel();stage.dispose();});
