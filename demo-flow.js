// Authored procedural example; the browser and CLI use the same flow contract.
// It shows a dialogue list, weighted choice feedback accumulated into the
// `score` variable, and branches on the answer and on the accumulated variable.
export const demo = {
  version: 2,
  startId: "welcome",
  nodes: [
    { id: "welcome", type: "dialogue", text: "Welcome to this demonstration.", dialogue: ["Welcome to this demonstration.", "I would like to ask two short questions about the service."], dialogueMode: "sequence", gesture: "auto", next: "interest", x: 20, y: 40 },
    { id: "interest", type: "feedback", text: "Which part of the service interests you most?", dialogue: ["Which part of the service interests you most?"], gesture: "auto", feedbackType: "choice", prompt: "Choose one topic", options: "Product details=2, Opening hours=1, Nothing today=0", variable: "score", branches: [{ operator: "eq", value: "Nothing today", target: "goodbye" }], next: "rating", x: 310, y: 40 },
    { id: "rating", type: "feedback", text: "How clear was the explanation?", dialogue: ["How clear was the explanation?"], gesture: "auto", feedbackType: "number", prompt: "Choose a value from one to five", options: "", variable: "score", weight: "1", branches: [{ source: "variable", variable: "score", operator: "gte", value: "6", target: "thanks" }], next: "clarify", x: 600, y: 40 },
    { id: "thanks", type: "dialogue", text: "Thank you for the positive feedback.", dialogue: ["Thank you for the positive feedback.", "Thank you, I am glad the explanation was clear."], dialogueMode: "random", gesture: "auto", next: "", x: 900, y: 40 },
    { id: "clarify", type: "dialogue", text: "Thank you. The service team can use that feedback to revise this explanation.", gesture: "thinking", next: "", x: 900, y: 330 },
    { id: "goodbye", type: "dialogue", text: "No problem. Thank you for stopping by.", gesture: "wave", next: "", x: 310, y: 560 },
  ],
};
