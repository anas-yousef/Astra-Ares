import express from "express";
import { fileURLToPath } from "node:url";
import { Store, defaults } from "./store.mjs";
const port = Number(process.env.OBSERVATORY_PORT || 4319);
const store = new Store({
  ...defaults,
  dbPath: process.env.OBSERVATORY_DB || defaults.dbPath,
  runs: process.env.OBSERVATORY_RUNS || defaults.runs,
  sessions: process.env.OBSERVATORY_SESSIONS || defaults.sessions,
});
const app = express();
app.use((req, res, next) => {
  if (!["127.0.0.1", "localhost"].includes(req.hostname))
    return res.sendStatus(403);
  if (
    req.headers.origin &&
    !["http://127.0.0.1:" + port, "http://localhost:" + port].includes(
      req.headers.origin,
    )
  )
    return res.sendStatus(403);
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "12kb" }));
app.get("/api/report", (req, res) => res.json(store.report(req.query)));
app.post("/api/sync", async (req, res) => {
  await store.sync();
  res.json(store.status);
});
app.post("/api/reviews/:id", (req, res) => {
  const { outcome, note = "" } = req.body || {};
  if (
    !["pass", "rework", "failed", "unrated"].includes(outcome) ||
    typeof note !== "string" ||
    note.length > 4000
  )
    return res.sendStatus(400);
  store.db
    .prepare("INSERT OR REPLACE INTO reviews VALUES(?,?,?,?)")
    .run(req.params.id, outcome, note, new Date().toISOString());
  res.json({ ok: true });
});
app.use(express.static(fileURLToPath(new URL("../dist", import.meta.url))));
let timer;
const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Jev Observatory http://127.0.0.1:${port}`);
  void store.sync();
  timer = setInterval(() => void store.sync(), 30000);
});
process.on("SIGTERM", () => {
  clearInterval(timer);
  server.close();
});
