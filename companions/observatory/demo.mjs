// Synthetic metadata only. No prompts, real chat IDs, or provider generations.
import fs from "node:fs";
import path from "node:path";
export function writeDemo(root) {
  fs.mkdirSync(path.join(root, "runs/demo"), { recursive: true });
  fs.mkdirSync(path.join(root, "sessions"), { recursive: true });
  const rows = [];
  for (let i = 0; i < 100; i++)
    rows.push({
      type: "decision",
      at: "2026-09-27T10:00:00.000Z",
      threadId: "demo-chat",
      turnId: "demo-turn",
      step: i + 1,
      model: "gpt-6-astra",
      effort: i < 30 ? "low" : i < 60 ? "medium" : i < 95 ? "high" : "xhigh",
      reused: i % 5 === 0,
      confirmation: "native_step_context_captured",
      cost: i % 5 === 0 ? 0 : 0.0001,
      jevMs: 600,
      leaseSteps: 1,
    });
  fs.writeFileSync(
    path.join(root, "runs/demo/decisions.jsonl"),
    rows.map((x) => JSON.stringify(x)).join("\n") + "\n",
  );
}
