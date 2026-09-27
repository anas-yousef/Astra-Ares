import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store, summarize } from "../server/store.mjs";
test("separate applied steps, fresh evaluations and legacy; do not double count lease costs", () => {
  const rows = [
    { profile: "economy", effort: "high", reused: 0, cost: 0.1 },
    { profile: "economy", effort: "high", reused: 1, cost: 0.1 },
    { profile: "legacy", effort: "low", reused: 0, cost: 0.2 },
  ];
  assert.equal(summarize(rows)[1].total, 2);
  assert.equal(summarize(rows, "fresh")[1].total, 1);
  assert.equal(summarize(rows)[1].cost, 0.1);
  assert.equal(summarize(rows)[2].low, 1);
});
test("incremental importer handles partial records, confirmations, usage deltas and restart", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jev-test-"));
  let store;
  const id = "00000000-0000-0000-0000-000000000001";
  try {
    const runs = path.join(root, "runs"),
      sessions = path.join(root, "sessions");
    fs.mkdirSync(path.join(runs, "a"), { recursive: true });
    fs.mkdirSync(sessions);
    const log = path.join(runs, "a", "decisions.jsonl");
    const opts = { dbPath: path.join(root, "test.sqlite"), runs, sessions };
    const e = {
      at: "2026-09-27T00:00:01Z",
      type: "decision",
      threadId: id,
      turnId: "turn-1",
      step: 1,
      selection: "Astra-Jev-Economy",
      effort: "medium",
      confirmation: "native_step_context_captured",
      cost: 0.001,
    };
    fs.writeFileSync(
      log,
      JSON.stringify(e) +
        "\n" +
        JSON.stringify({ ...e, step: 2, reused: true }).slice(0, -1),
    );
    const session = path.join(sessions, `rollout-${id}.jsonl`);
    const token = (total) => ({
      timestamp: "2026-09-27T00:00:02Z",
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: total,
            cached_input_tokens: total / 2,
            output_tokens: 10,
            total_tokens: total + 10,
          },
        },
      },
    });
    fs.writeFileSync(
      session,
      [
        { type: "session_meta", payload: { id, cwd: "/repo" } },
        { type: "turn_context", payload: { turn_id: "turn-1" } },
        token(100),
        token(200),
        token(200),
      ]
        .map((e) => JSON.stringify(e))
        .join("\n") + "\n",
    );
    store = new Store(opts);
    await store.sync();
    let report = store.report();
    assert.equal(report.metrics.steps, 1);
    assert.equal(report.chats[0].input, 100);
    assert.equal(report.chats[0].cached, 50);
    assert.equal(report.chats[0].repo, "/repo");
    fs.appendFileSync(
      log,
      "}\n" + JSON.stringify({ ...e, step: 3, confirmation: "wrong" }) + "\n",
    );
    await store.sync();
    report = store.report();
    assert.equal(report.metrics.steps, 2);
    assert.equal(report.metrics.fresh, 1);
    assert.equal(report.metrics.cost, 0.001);
    assert.equal(report.chats[0].input, 100);
    store.db.close();
    store = new Store(opts);
    await store.sync();
    assert.equal(store.report().metrics.steps, 2);
    assert.equal(store.report({ profile: "standard" }).metrics.steps, 0);
    assert.equal(store.report({ from: "2026-09-28" }).metrics.steps, 0);
    fs.writeFileSync(log, JSON.stringify({ ...e, effort: "low" }) + "\n");
    await store.sync();
    assert.equal(store.report().metrics.steps, 1);
    assert.equal(store.report().groups[1].low, 1);
  } finally {
    store?.db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
