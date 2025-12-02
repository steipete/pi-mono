# Streamable / Non‑Blocking Exec (design draft)

## Goal
Let the pi agent run long shell commands without stalling the reasoning loop by:
- streaming stdout/stderr live,
- yielding after a configurable window (default 60 s),
- continuing to monitor the process via polling/kill/write‑stdin.

## Interfaces
- **Tool: `bash_stream`**  
  - Args: `command` (string), `workdir?`, `env?`, `yieldMs?` (default 60000, clamped), `stdinMode?` (`"pipe"` | `"pty"`, default pipe).  
  - Returns (completed): `status:"completed"|"failed"`, `exitCode`, `stdout`, `stderr`, `aggregated`, `durationMs`.  
  - Returns (yielded): `status:"running"`, `sessionId`, `pid`, `startedAt`, `tail` (last chunk).
  - Emits live `tool_execution_output` events (stdout/stderr chunks, capped).

- **Tool: `poll_process`**  
  - Args: `sessionId`, `killIf?` (`"timeout"|"always"`), `maxDrainMs?` (cap polling work).  
  - Returns running/completed status plus drained output; on completion includes `exitCode`, `aggregated`.

- **Tool: `write_stdin`**  
  - Args: `sessionId`, `data` (string/bytes), `eof?` (close stdin).  
  - Errors if session unknown, exited, or input caps exceeded.

- **Tool: `kill_process`**  
  - Args: `sessionId`, `signal?` (default SIGKILL / taskkill /T on Windows).  
  - Returns final status.

## Events
- `tool_execution_output` — streaming chunks with `sessionId`, `stream:"stdout"|"stderr"`, `chunk`.
- `tool_execution_progress` — emitted when `bash_stream` yields while still running (includes `sessionId`, `pid`, `startedAt`, `lastOutputTail`).

## Limits & caps
- Per‑chunk size ~8 KiB; max deltas per call ~10k (Codex-style guardrail).
- Aggregated output cap defaults to 30 000 chars (env `PI_BASH_MAX_OUTPUT_CHARS`, hard max 150 000).
- Yield window default 60 s (`PI_BASH_YIELD_MS`, CLI `--bash-yield-ms`); per‑call `yieldMs` overrides and is clamped (e.g., 1 s–120 s).
- Optional stdin cap (e.g., 256 KiB per session) to avoid runaway input.

## Default flow
1) `bash_stream` starts the process, streams output, waits up to `yieldMs`.
2) If still running: returns `status:"running"` + `sessionId`, emits `tool_execution_progress`.
3) Model can `poll_process` (or `write_stdin` then `poll_process`) in later turns.
4) When the process exits, `poll_process` returns `completed/failed` with `exitCode` and aggregated output; the loop proceeds normally.

## Design notes (borrowed from Codex/Claude CLI)
- Streamed output with caps to avoid runaway buffers.
- Session registry tracks pid, start time, cwd, and open stdin.
- Group kill on timeout/abort; drain output briefly after exit to avoid hangs.
- `stdinMode` allows PTY for TTY-only programs; default pipe for safety.

## Open questions
- Exact clamp ranges for `yieldMs` and stdin cap.
- Whether to expose `maxOutputTokens` to align with LLM token budgets.
- How much of the `tail` to include in progress events (e.g., last 2 KiB).

## Migration steps
- Implement tool handlers + registry.
- Extend event types in the agent event stream.
- Wire TUI/CLI to render streaming output and progress states.
- Add tests: streaming, yield/poll, stdin, kill, caps, abort signal.

## Background visibility (in-memory, no disk)
- Tools: `list_processes` (running + recent, TTL bounded) and `get_process_log` (paged buffered output) alongside `kill_process`/`poll_process`.
- Registry keeps finished sessions for 30 min by default (`PI_BASH_JOB_TTL_MS`, clamped).
- CLI/TUI affordances: `/jobs` opens a jobs selector (Enter tails a session), `/tail <sessionId> [limit]` dumps buffered output, `/kill <sessionId>` terminates.
