# Architecture

`astra-ares` launches a pinned native Codex with inherited terminal I/O. `Astra Ares`, `Sol Ares`, and `Luna Ares` are logical catalog selections that resolve to `gpt-6-astra`, `gpt-6-sol`, and `gpt-6-luna`, respectively. Their stored selection IDs remain `Astra-Jev`, `Sol-Jev`, and `Luna-Jev`, so existing sessions retain their selection. Each preserves its real model identity on OpenAI requests; Jev selects effort, not the model. Ordinary catalog selections bypass the evaluator. This is a small native fork plus sidecar, not an MCP tool or HTTP proxy.

Before sampling, after tool results and accepted user input enter history, core checks the logical selection. The selected checkpoint sends its public text projection over a private Unix socket. The bridge limits evaluator-only tool previews and asks Jev two typed Choice questions: effort and lease length. It uses the selected effort without semantic overrides.

Core applies the result through `Session::apply_turn_settings`, then captures a fresh `StepContext`, checks its actual model/effort, and acknowledges it. Only then is the decision logged as applied and the native TUI notified. Sampling, permissions, tool execution, OpenAI authentication, and cancellation remain native.

A lease counts generations, including the immediately upcoming one; it does not count individual parallel tool calls. Each retained decision is acknowledged at a local checkpoint, but the bridge performs no provider evaluation or context tokenization while its lease remains valid. Accepted input revision, failure count, current model and current effort invalidate stale leases.

For the selected GPT-6 model's reasoning-effort override, native `configuration_update` items carry changes while the original request effort baseline stays pinned. We verified prefix preservation at the request boundary. That does not establish a workload's cache hit rate or dollar savings. See OpenAI's [mid-conversation reasoning documentation](https://developers.openai.com/api/docs/guides/reasoning#change-reasoning-mid-conversation). Its supported mode is standard, single-agent GPT-6 requests; automatic compaction/truncation and the standalone compact endpoint have restrictions with these history items. The live acceptance here does not establish long-session compaction support.

## Boundaries

- One bridge connection/state machine per active turn; per-connection ownership prevents duplicate simultaneous owners.
- Fixed 2 MB framed transport limit; reply identity and efforts must match the active step and catalog.
- 1000 local tokens for all results of each retained tool call; public notes and accepted prompts remain intact.
- 28,000 local tokens for the complete evaluator request: an explicit local error if exceeded.
- Same-provider HTTP retries only; no alternative provider/model or saved-effort fallback after failure.
- A provider error does not confirm or apply an effort. A cancelled request cannot commit a decision.
- Source/archive/patch/companion checksums are pinned in `patches/upstream.json`; arbitrary Codex upgrades are not supported.

## Why a native patch

A shell wrapper or MCP server alone cannot reliably interpose between every native sampling step and its captured settings. An Astra HTTP proxy would add a separate transport/cache boundary. The patch exposes the sampling checkpoint and uses the existing settings owner; the public frontend stays the normal Codex CLI.
