# Testing

The test suite verifies the router's contracts at two levels. It does not establish model quality, cost savings, or production availability.

## Unit and regression tests

```sh
npm ci
npm test
```

These tests require no API keys. They cover effort/lease validation, lease reuse and invalidation, bounded tool previews, Unicode and JSON escaping, exact-body HTTP retries, cancellation, explicit provider errors, credential handling, and CLI configuration.

Launcher regressions cover prompt text after `--`, option values that resemble flags or commands, and rejection of actual unsupported transports. RPC regressions verify that a missing executable rejects pending and future calls immediately instead of waiting for the request timeout.

## Native integration fixtures

Build or adopt the compatible native Codex, install Bun, then run:

```sh
JEV_TEST_BINARY="$HOME/.local/share/astra-ares/bin/codex" npm run test:native
```

For a custom binary path, set `JEV_TEST_BINARY` accordingly. The three suites run the actual native executable against explicit local Responses and Jev fixtures; they do not spend API credits.

| Suite     | Boundary checked                                                                                                                   |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Context   | Task text and public notes preserved; recent tool previews bounded; main-model history unchanged; opaque reasoning excluded        |
| Session   | Settings acknowledged before inference; leases; accepted user input; cancellation; visible provider failure; ordinary-model bypass |
| Selection | Native model selection, restart/resume, effort updates, original prefix retained, missing bridge rejected before inference         |

Artifacts are written under ignored `work/` directories. Request-prefix preservation is not a measurement of production prompt-cache hit rate. Local build and runtime acceptance covers Apple Silicon macOS; other platform and long-session compaction coverage remains limited. CI separately runs unit tests and package checks on Linux and macOS.

## Live checks

```sh
ares doctor          # local installation and configuration checks
ares doctor --probe  # one small, billable Jev request
```

A successful probe verifies that the configured provider accepted one request. It does not guarantee sustained capacity or validate Astra's task quality. Check local decision logs for provider errors, request sizes, lease reuse and native acknowledgements during your own workloads. Keep task transcripts and credentials out of public reports.
