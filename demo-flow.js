// Authored procedural example; the browser and CLI use the same flow contract.
export const demo = {
  version: 1,
  startId: "welcome",
  nodes: [
    { id: "welcome", type: "dialogue", text: "Welcome. I would like to ask one question about this demonstration.", gesture: "auto", next: "rating", x: 50, y: 60 },
    { id: "rating", type: "feedback", text: "How clear was the explanation?", gesture: "auto", feedbackType: "number", prompt: "Choose a value from one to five", options: "", branches: [{ operator: "gte", value: "4", target: "thanks" }], next: "clarify", x: 370, y: 190 },
    { id: "thanks", type: "dialogue", text: "Thank you for the positive feedback.", gesture: "auto", next: "", x: 720, y: 60 },
    { id: "clarify", type: "dialogue", text: "Thank you. The service team can use that feedback to revise this explanation.", gesture: "thinking", next: "", x: 720, y: 340 },
  ],
};
