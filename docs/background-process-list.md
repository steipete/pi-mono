# Background Process Listing / Control (plan)

Goal: expose running/recent bash_stream sessions so users (and the TUI) can list, inspect logs/tails, and kill them without disk persistence. Implements option 1 (CLI tools) and option 3 (TUI panel) from the earlier plan.

## Current state (as of Dec 2, 2025)
- Runtime: `packages/coding-agent/src/tools/bash-stream.ts` starts jobs and stores them in `process-registry.ts`; sessions are deleted on completion/kill.
- Events: `tool_execution_output` and `tool_execution_progress` exist but TUI ignores them.
- Poll/kill/write tools: `poll_process`, `write_stdin`, `kill_process` operate on in-memory sessions only; no history once deleted.
- TUI: no visibility of streaming/progress events; no job list or controls.

## Design targets
- Keep in-memory history of finished jobs for a bounded TTL (no disk persistence).
- New read-only tools to list jobs and fetch buffered logs/tails.
- CLI slash commands to surface listing/tailing/killing.
- TUI panel showing active + recent jobs with tail snippets and actions.
- Maintain current caps (PI_BASH_MAX_OUTPUT_CHARS) and mark truncation in responses.

## Work plan

### 1) Process registry & lifecycle
- Add `finishedSessions` map with `endedAt`; keep running sessions in existing map.
- On process exit (bash_stream) or kill, move session to finished map instead of deleting.
- Add TTL sweeper (e.g., interval every 60s) that prunes finished entries older than `PI_BASH_JOB_TTL_MS` (default 30 min, clamp 1–180 min).
- Track metadata needed for listing: `command`, `cwd`, `envSummary`, `startedAt`, `endedAt`, `status`, `exitCode`, `exitSignal`, `outputSize`, `tail`, `truncated`.
- Mark `truncated` when `trimWithCap` cuts aggregated output (compare lengths before/after trim).

### 2) Tool surface (option 1)
- New tool `list_processes` (read-only): returns active + finished sessions ordered by startedAt desc with fields: sessionId, status (running/completed/failed/killed), runtime, pid (if alive), cwd, command summary (first 120 chars), tail (last 2 KiB), truncated flag, startedAt/endedAt.
- New tool `get_process_log`: args `{ sessionId, offset?: number, limit?: number }`; returns sliced aggregated output, total length, truncated flag, status, exitCode/Signal if finished. Reads from running or finished maps; for running sessions also drains pending buffers (without deleting).
- Update `poll_process` to stop deleting finished sessions; only mark status and leave in finished map for TTL cleanup.
- Update `kill_process` to move session to finished map with status `failed`/`killed` and capture tail/aggregated before delete from running map.
- Keep `write_stdin` unchanged except to reject writes to finished sessions.

### 3) Agent/TUI wiring (option 3)
- Expose slash commands in coding-agent CLI/TUI:
  - `/jobs` → calls `list_processes`, renders table (sessionId short hash, status badge, runtime, cwd basename, command ellipsis, truncated flag).
  - `/tail <sessionId>` → uses `get_process_log` (or `poll_process` for streaming) to show full buffered output with paging; accept `--since N` to fetch trailing N chars.
  - `/kill <sessionId>` → calls `kill_process`.
- TUI panel: add “Jobs” panel (toggle via footer key or slash) showing active + recent jobs with live updates:
  - Subscribe to `tool_execution_output`/`tool_execution_progress` to refresh selected job tail and runtime.
  - Provide keybindings: `t` tail selected (opens scrollable log), `k` kill selected, `r` refresh.
  - Status indicators: running spinner; completed green; failed/killed red; truncated icon when output capped.
  - Use existing `ToolExecutionComponent` style for consistency; keep file sizes reasonable by showing tail + counts.

### 4) Caps & safety
- Respect existing output cap PI_BASH_MAX_OUTPUT_CHARS (hard 150k); never store more.
- Add optional `PI_BASH_JOB_TTL_MS` default 1_800_000 (30 min) with clamp to prevent unbounded retention.
- Ensure sweeper runs on registry init and after each exit to avoid leaks.

### 5) Tests
- Unit tests in `packages/coding-agent/test`:
  - list_processes shows running + finished; marks truncated when capped.
  - get_process_log paging works (offset/limit) for running and finished sessions.
  - poll_process no longer drops finished sessions; kill_process moves to finished with failed status.
  - TTL sweeper prunes finished entries after expiry.
- TUI: add component tests (if infra exists) or snapshot for `/jobs` command output; otherwise add integration harness that fakes AgentEvents to verify panel rendering.

### 6) Docs/UX
- Update `docs/streamable-exec.md` to mention job listing tools and TTL behavior.
- CLI help strings for new slash commands/tools; note no disk persistence.

Out of scope
- Disk persistence of logs/history.
- PTY mode beyond existing pipe stdin.
