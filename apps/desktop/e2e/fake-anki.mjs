/* global process, console */
// A stand-in AnkiConnect for the proof window: answers the few actions the
// 总控 reads with fixed numbers, so screenshots never touch the real Anki.
// Usage: node e2e/fake-anki.mjs [due cards, default 42] [port, default 18765]
import { createServer } from "node:http";

const due = Number(process.argv[2] ?? 42);
const port = Number(process.argv[3] ?? 18765);
const answers = {
  version: 6,
  deckNames: ["默认"],
  getNumCardsReviewedToday: 0,
  findCards: Array.from({ length: due }, (_, i) => i + 1),
};

createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const { action } = JSON.parse(body || "{}");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ result: answers[action] ?? null, error: null }));
  });
}).listen(port, "127.0.0.1", () => console.log(`fake anki on ${port}, ${due} due`));
