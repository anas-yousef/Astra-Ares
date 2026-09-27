import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";

export const efforts = ["low", "medium", "high", "xhigh", "max", "ultra"];
export function profile(e) {
  return e.selection === "Astra-Jev-Economy"
    ? "economy"
    : e.selection === "Astra-Jev"
      ? "standard"
      : "legacy";
}
export function summarize(rows, mode = "steps") {
  const selected = rows.filter((r) => mode !== "fresh" || !r.reused);
  return ["standard", "economy", "legacy"].map((p) => {
    const all = selected.filter((r) => r.profile === p);
    const counts = Object.fromEntries(
      efforts.map((e) => [e, all.filter((r) => r.effort === e).length]),
    );
    return {
      profile: p,
      total: all.length,
      ...counts,
      cost: all.reduce((n, r) => n + (r.reused ? 0 : r.cost || 0), 0),
      violations: all.filter(
        (r) => p === "economy" && ["max", "ultra"].includes(r.effort),
      ).length,
    };
  });
}
export class Store {
  constructor({ dbPath, runs, sessions }) {
    this.runs = runs;
    this.sessions = sessions;
    this.busy = false;
    this.status = { lastSync: null, error: null, files: 0 };
    fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath);
    fs.chmodSync(dbPath, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS events(source TEXT, offset INTEGER, at TEXT, type TEXT, thread TEXT, turn TEXT, step INTEGER, profile TEXT, effort TEXT, reused INTEGER, confirmed INTEGER, cost REAL, ms REAL, lease INTEGER, generation TEXT, probabilities TEXT, failures INTEGER, previous TEXT, PRIMARY KEY(source,offset));
      CREATE INDEX IF NOT EXISTS event_thread ON events(thread,turn);
      CREATE TABLE IF NOT EXISTS cursors(source TEXT PRIMARY KEY, position INTEGER, inode TEXT, context TEXT);
      CREATE TABLE IF NOT EXISTS chats(id TEXT PRIMARY KEY, repo TEXT);
      CREATE TABLE IF NOT EXISTS usage(source TEXT, offset INTEGER, at TEXT, thread TEXT, turn TEXT, input INTEGER, cached INTEGER, output INTEGER, reasoning INTEGER, PRIMARY KEY(source,offset));
      CREATE TABLE IF NOT EXISTS reviews(thread TEXT PRIMARY KEY, outcome TEXT, note TEXT, updated TEXT);`);
  }
  async lines(file, handle) {
    const stat = fs.statSync(file);
    const cursor = this.db
      .prepare("SELECT * FROM cursors WHERE source=?")
      .get(file);
    let position = cursor?.position || 0;
    let context = JSON.parse(cursor?.context || "{}");
    if (cursor && (cursor.inode !== String(stat.ino) || position > stat.size)) {
      this.db.prepare("DELETE FROM events WHERE source=?").run(file);
      this.db.prepare("DELETE FROM usage WHERE source=?").run(file);
      position = 0;
      context = {};
    }
    if (position === stat.size) return;
    // Process complete lines only. Leave a partial trailing record for the next poll.
    const stream = fs.createReadStream(file, {
      start: position,
      end: stat.size - 1,
    });
    let pending = Buffer.alloc(0);
    for await (const chunk of stream) {
      pending = Buffer.concat([pending, chunk]);
      let start = 0;
      let end;
      while ((end = pending.indexOf(10, start)) !== -1) {
        const bytes = pending.subarray(start, end);
        try {
          handle(JSON.parse(bytes.toString("utf8")), position, context);
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
          this.status.malformed = (this.status.malformed || 0) + 1;
        }
        position += bytes.length + 1;
        start = end + 1;
      }
      pending = pending.subarray(start);
      if (pending.length > 64 * 1024 * 1024)
        throw new Error("Record exceeds 64 MB");
    }
    this.db
      .prepare("INSERT OR REPLACE INTO cursors VALUES(?,?,?,?)")
      .run(file, position, String(stat.ino), JSON.stringify(context));
  }
  async sync() {
    if (this.busy) return;
    this.busy = true;
    this.status.error = null;
    try {
      let files = 0,
        sourceBytes = 0;
      if (fs.existsSync(this.runs))
        for (const dir of fs.readdirSync(this.runs)) {
          const f = path.join(this.runs, dir, "decisions.jsonl");
          if (!fs.existsSync(f)) continue;
          files++;
          sourceBytes += fs.statSync(f).size;
          await this.lines(f, (e, offset) => {
            if (
              ![
                "decision",
                "provider_request",
                "provider_error",
                "controller_error",
                "evaluation_requested",
              ].includes(e.type)
            )
              return;
            this.db
              .prepare(
                "INSERT OR IGNORE INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
              )
              .run(
                f,
                offset,
                e.at || "",
                e.type,
                e.threadId || "",
                e.turnId || "",
                e.step || 0,
                profile(e),
                e.effort || "",
                Number(Boolean(e.reused)),
                Number(e.confirmation === "native_step_context_captured"),
                Number(e.cost) || 0,
                Number(e.jevMs) || 0,
                e.leaseSteps || 0,
                e.generationId || "",
                JSON.stringify(e.probabilities || null),
                e.newToolFailures || 0,
                e.previousEffort || "",
              );
          });
        }
      this.status.files = files;
      this.status.sourceBytes = sourceBytes;
      const ids = new Set(
        this.db
          .prepare("SELECT DISTINCT thread FROM events WHERE thread != ''")
          .all()
          .map((r) => r.thread),
      );
      if (fs.existsSync(this.sessions)) {
        const walk = async (dir) => {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const f = path.join(dir, entry.name);
            if (entry.isDirectory()) await walk(f);
            else if (
              entry.name.endsWith(".jsonl") &&
              ids.has(entry.name.slice(-42, -6))
            )
              await this.lines(f, (e, offset, ctx) => {
                if (e.type === "session_meta") {
                  ctx.thread = e.payload.id;
                  this.db
                    .prepare("INSERT OR REPLACE INTO chats VALUES(?,?)")
                    .run(ctx.thread, e.payload.cwd || "");
                }
                if (e.type === "turn_context") ctx.turn = e.payload.turn_id;
                if (
                  e.type === "event_msg" &&
                  e.payload?.type === "token_count" &&
                  e.payload.info?.total_token_usage &&
                  ctx.thread
                ) {
                  const t = e.payload.info.total_token_usage;
                  const previous = ctx.totals;
                  ctx.totals = t;
                  if (!previous) return;
                  const delta = (k) =>
                    Math.max(0, (t[k] || 0) - (previous[k] || 0));
                  if ((t.total_tokens || 0) < (previous.total_tokens || 0))
                    return;
                  const input = delta("input_tokens"),
                    cached = delta("cached_input_tokens"),
                    output = delta("output_tokens"),
                    reasoning = delta("reasoning_output_tokens");
                  if (input + output > 0)
                    this.db
                      .prepare(
                        "INSERT OR IGNORE INTO usage VALUES(?,?,?,?,?,?,?,?,?)",
                      )
                      .run(
                        f,
                        offset,
                        e.timestamp || "",
                        ctx.thread,
                        ctx.turn || "",
                        input,
                        cached,
                        output,
                        reasoning,
                      );
                }
              });
          }
        };
        await walk(this.sessions);
      }
      this.status.lastSync = new Date().toISOString();
    } catch (error) {
      this.status.error = error.message;
    } finally {
      this.busy = false;
    }
  }
  report({
    profile: p = "all",
    from = "",
    to = "",
    repo = "",
    mode = "steps",
    thread = "",
  } = {}) {
    const rows = this.db
      .prepare(
        "SELECT e.*,c.repo FROM events e LEFT JOIN chats c ON c.id=e.thread WHERE e.type='decision' AND e.confirmed=1 ORDER BY at",
      )
      .all()
      .filter(
        (r) =>
          (p === "all" || r.profile === p) &&
          (!from || r.at >= from) &&
          (!to || r.at < to + "T23:59:59.999Z") &&
          (!repo || r.repo === repo) &&
          (!thread || r.thread === thread),
      );
    const displayed = rows.filter((r) => mode !== "fresh" || !r.reused);
    const ids = [...new Set(rows.map((r) => r.thread))];
    const dayMap = new Map();
    for (const r of displayed) {
      const day = r.at.slice(0, 10);
      const d = dayMap.get(day) || {
        day,
        ...Object.fromEntries(efforts.map((e) => [e, 0])),
      };
      d[r.effort]++;
      dayMap.set(day, d);
    }
    const chats = ids.map((id) => {
      const rs = rows.filter((r) => r.thread === id);
      const turns = new Set(rs.map((r) => r.turn));
      const usage = this.db
        .prepare("SELECT * FROM usage WHERE thread=?")
        .all(id)
        .filter(
          (u) =>
            turns.has(u.turn) &&
            (!from || u.at >= from) &&
            (!to || u.at < to + "T23:59:59.999Z"),
        );
      // Token counters are attributed to whole turns, never guessed by timestamp/step.
      return {
        id,
        repo: rs[0].repo || "",
        steps: rs.length,
        profiles: [...new Set(rs.map((r) => r.profile))],
        last: rs.at(-1).at,
        efforts: summarize(rs).reduce((a, g) => {
          for (const e of efforts) a[e] = (a[e] || 0) + g[e];
          return a;
        }, {}),
        input: usage.reduce((n, u) => n + u.input, 0),
        cached: usage.reduce((n, u) => n + u.cached, 0),
        output: usage.reduce((n, u) => n + u.output, 0),
        reasoning: usage.reduce((n, u) => n + u.reasoning, 0),
        usageSamples: usage.length,
        review:
          this.db
            .prepare("SELECT outcome,note FROM reviews WHERE thread=?")
            .get(id) || null,
      };
    });
    const latencies = rows
      .filter((r) => !r.reused)
      .map((r) => r.ms)
      .sort((a, b) => a - b);
    return {
      status: {
        ...this.status,
        busy: this.busy,
        dbBytes: fs.statSync(this.dbPath).size,
      },
      groups: summarize(rows, mode),
      days: [...dayMap.values()],
      chats: chats.sort((a, b) => b.last.localeCompare(a.last)),
      rows: displayed.slice(-2000).reverse(),
      rowCount: displayed.length,
      metrics: {
        steps: rows.length,
        fresh: rows.filter((r) => !r.reused).length,
        cost: rows.reduce((n, r) => n + (r.reused ? 0 : r.cost), 0),
        p50: latencies[Math.floor(latencies.length * 0.5)] || 0,
        p95: latencies[Math.floor(latencies.length * 0.95)] || 0,
        failures: rows.reduce((n, r) => n + r.failures, 0),
      },
      repos: this.db
        .prepare("SELECT DISTINCT repo FROM chats ORDER BY repo")
        .all()
        .map((r) => r.repo),
      errors: this.db
        .prepare(
          "SELECT at,type,thread FROM events WHERE type IN ('provider_error','controller_error') ORDER BY at DESC LIMIT 30",
        )
        .all(),
    };
  }
}
export const defaults = {
  dbPath: path.join(
    os.homedir(),
    ".local/share/astra-ares-observatory/metrics.sqlite",
  ),
  runs: path.join(os.homedir(), ".local/share/astra-ares/runs"),
  sessions: path.join(os.homedir(), ".codex/sessions"),
};
