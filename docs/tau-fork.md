# Tau fork notes (steipete)

This repository normally tracks upstream `badlogic/pi-mono` on `main`.
The `tau` branch is a long-lived fork branch used by Clawdis to run `tau`/`pi` in RPC mode.

Goal of this doc: explain what the `tau` branch adds on top of upstream, in a few coherent patchsets, and why.

## Scope and maintenance

- Branch: `tau`
- Strategy: periodically merge upstream `origin/main` into `tau` (keep `tau` “ahead” only).
- Why not keep this as a tiny patch? Some changes are intertwined (tool protocol + background jobs + provider hardening).

## Patchset 1: Tool execution protocol upgrade (options + events + yield)

Summary:
- Tools no longer receive a bare `AbortSignal`; they receive a richer `ToolExecuteOptions` object.
- Adds a “soft-yield” signal (distinct from abort) so a host UI can request a running tool to yield control without killing it.
- Allows tools to emit structured events back into the agent stream (for UIs and embedding hosts).

Key files:
- `packages/ai/src/agent/agent-loop.ts`
- `packages/coding-agent/src/core/hooks/tool-wrapper.ts`
- `packages/coding-agent/src/core/tools/*.ts` (signature adjustments)

User-visible impact:
- Better UI telemetry for tool lifecycles.
- A path to non-destructive interruption of long-running tools.

## Patchset 2: Background job support (streamable bash + process tool + UI)

Summary:
- Adds a streamable bash execution pipeline that can be backgrounded.
- Introduces a process registry that retains bounded output (tail + aggregated) with a TTL.
- Adds a `process` tool to list/poll/log/write/kill/clear backgrounded bash sessions.
- Adds TUI components to inspect jobs and view logs.

Key files:
- `packages/coding-agent/src/core/tools/process-registry.ts`
- `packages/coding-agent/src/core/tools/process.ts`
- `packages/coding-agent/src/core/tools/shell-utils.ts`
- `packages/coding-agent/src/modes/interactive/components/jobs-selector.ts`
- `docs/background-process-list.md`
- `docs/streamable-exec.md`

User-visible impact:
- Long tasks can run “in the background” and be inspected/killed later.

## Patchset 3: Session robustness for embedding hosts (stable IDs + sanitization)

Summary:
- Stabilizes session IDs when a host supplies `--session <path>` (derive from header or filename rather than generating a new UUID).
- Sanitizes message content when loading session history (ensures text blocks are proper strings; wraps unexpected shapes).

Key files:
- `packages/coding-agent/src/core/session-manager.ts`

User-visible impact:
- Embedding hosts (e.g., Clawdis) can reliably map “a chat” to “a session file” without session ID churn.
- Reduced risk of malformed session entries breaking later loads.

## Patchset 4: Provider hardening (image validation + better error surfacing)

Summary:
- Adds an image sanitizer that enforces provider limits (byte size, dimensions, max image count).
- Provider adapters run the sanitizer and append a short note to the conversation if images were dropped.
- Ensures provider errors are surfaced as assistant text when the provider returns an error without content.

Key files:
- `packages/ai/src/utils/image-validation.ts`
- `packages/ai/src/providers/anthropic.ts`
- `packages/ai/src/providers/google.ts`
- `packages/ai/src/providers/openai-responses.ts`
- `packages/ai/test/image-validation.test.ts`
- `packages/ai/scripts/repro/*-oversize.ts`

User-visible impact:
- Fewer “hard failure” situations where a single invalid image causes the whole run to error.
- When images are dropped, the model is explicitly told so it can retry with smaller images if needed.

## Patchset 5: Prevent empty-image tool results (Clawdis incident fix)

Summary:
- The `read` tool now refuses to emit an image content block when the file is empty or base64-encoding yields an empty string.
- This prevents an invalid tool result like `{ type: "image", data: "" }`, which some providers treat as a fatal request error.

Key files:
- `packages/coding-agent/src/core/tools/read.ts`
- `packages/coding-agent/test/tools.test.ts`

User-visible impact:
- Instead of poisoning the conversation with an invalid image block, the tool fails normally and the agent can recover.

## Patchset 6: Small UX + packaging fixes

Summary:
- Various small fixes that make `tau` easier to embed and operate:
  - CLI banner naming derived from invoked binary
  - theme resolution correctness when running from `dist`
  - tool result metadata surfaced more consistently

Key files (non-exhaustive):
- `packages/coding-agent/src/index.ts`
- `packages/coding-agent/src/config.ts`
- `packages/coding-agent/src/core/settings-manager.ts`

## Notes for Clawdis integration

Clawdis typically launches `tau` via the built CLI entrypoint:

- `node …/pi-mono/packages/coding-agent/dist/cli.js --mode rpc … --session <file> --continue`

If you modify `tau` branch source, ensure Clawdis uses a built artifact that includes those changes (or point Clawdis at a TS/tsx entrypoint if that’s the desired workflow).

