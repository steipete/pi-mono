import type { AgentEvent, AgentTool } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { type ChildProcessWithoutNullStreams, spawn } from "child_process";
import { randomUUID } from "crypto";
import { addSession, appendOutput, deleteSession, markExited } from "./process-registry.js";
import { getShellConfig, killProcessTree } from "./shell-utils.js";

const CHUNK_LIMIT = 8 * 1024;
const DEFAULT_YIELD_MS = clampNumber(readEnvInt("PI_BASH_YIELD_MS"), 60_000, 1_000, 120_000);
const DEFAULT_MAX_OUTPUT = clampNumber(readEnvInt("PI_BASH_MAX_OUTPUT_CHARS"), 30_000, 1_000, 150_000);

const bashStreamSchema = Type.Object({
	command: Type.String({ description: "Bash command to execute" }),
	workdir: Type.Optional(Type.String({ description: "Working directory (defaults to cwd)" })),
	env: Type.Optional(Type.Record(Type.String(), Type.String())),
	yieldMs: Type.Optional(
		Type.Number({ description: "Milliseconds to block before yielding control (default 60000)" }),
	),
	stdinMode: Type.Optional(Type.Union([Type.Literal("pipe"), Type.Literal("pty")])),
});

type BashStreamDetails =
	| {
			status: "running";
			sessionId: string;
			pid?: number;
			startedAt: number;
			tail?: string;
	  }
	| {
			status: "completed" | "failed";
			exitCode: number | null;
			durationMs: number;
			aggregated: string;
	  };

function clampNumber(value: number | undefined, defaultValue: number, min: number, max: number) {
	if (value === undefined || Number.isNaN(value)) return defaultValue;
	return Math.min(Math.max(value, min), max);
}

function readEnvInt(key: string) {
	const raw = process.env[key];
	if (!raw) return undefined;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function chunkString(input: string, limit = CHUNK_LIMIT) {
	const chunks: string[] = [];
	for (let i = 0; i < input.length; i += limit) {
		chunks.push(input.slice(i, i + limit));
	}
	return chunks;
}

function emitChunk(
	emitEvent: ((event: AgentEvent) => void) | undefined,
	toolCallId: string,
	stream: "stdout" | "stderr",
	chunk: string,
) {
	if (!emitEvent) return;
	emitEvent({
		type: "tool_execution_output",
		toolCallId,
		stream,
		chunk,
	});
}

export const bashStreamTool: AgentTool<typeof bashStreamSchema, BashStreamDetails> = {
	name: "bash_stream",
	label: "bash (streaming)",
	description:
		"Execute bash with live streaming and background continuation. Use poll_process/write_stdin/kill_process with the returned sessionId for follow-up.",
	parameters: bashStreamSchema,
	execute: async (
		toolCallId: string,
		{
			command,
			workdir,
			env,
			yieldMs,
			stdinMode,
		}: {
			command: string;
			workdir?: string;
			env?: Record<string, string>;
			yieldMs?: number;
			stdinMode?: "pipe" | "pty";
		},
		{ signal, emitEvent }: { signal?: AbortSignal; emitEvent?: (event: AgentEvent) => void } = {},
	) => {
		if (stdinMode && stdinMode !== "pipe") {
			throw new Error('Only stdinMode "pipe" is supported right now.');
		}

		const yieldWindow = clampNumber(yieldMs, DEFAULT_YIELD_MS, 1_000, 120_000);
		const maxOutput = DEFAULT_MAX_OUTPUT;
		const startedAt = Date.now();
		const sessionId = randomUUID();

		const { shell, args } = getShellConfig();
		const child: ChildProcessWithoutNullStreams = spawn(shell, [...args, command], {
			cwd: workdir || process.cwd(),
			env: { ...process.env, ...env },
			detached: true,
			stdio: ["pipe", "pipe", "pipe"],
		});

		const session = {
			id: sessionId,
			child,
			startedAt,
			cwd: workdir,
			maxOutputChars: maxOutput,
			pendingStdout: [],
			pendingStderr: [],
			aggregated: "",
			tail: "",
			exited: false,
			exitCode: undefined as number | null | undefined,
			exitSignal: undefined as NodeJS.Signals | number | null | undefined,
		};
		addSession(session);

		let settled = false;
		let yielded = false;

		const settle = (fn: () => void) => {
			if (settled) return;
			settled = true;
			fn();
		};

		const cleanup = () => {
			signal?.removeEventListener("abort", onAbort);
		};

		const onAbort = () => {
			if (child.pid) {
				killProcessTree(child.pid);
			}
		};

		if (signal?.aborted) {
			onAbort();
		} else if (signal) {
			signal.addEventListener("abort", onAbort, { once: true });
		}

		child.stdout.on("data", (data) => {
			const str = data.toString();
			for (const chunk of chunkString(str)) {
				appendOutput(session, "stdout", chunk);
				emitChunk(emitEvent, toolCallId, "stdout", chunk);
			}
		});

		child.stderr.on("data", (data) => {
			const str = data.toString();
			for (const chunk of chunkString(str)) {
				appendOutput(session, "stderr", chunk);
				emitChunk(emitEvent, toolCallId, "stderr", chunk);
			}
		});

		return new Promise((resolve, reject) => {
			const resolveRunning = () => {
				settle(() =>
					resolve({
						content: [
							{
								type: "text",
								text:
									`Command still running (session ${sessionId}, pid ${child.pid ?? "n/a"}). ` +
									"Use poll_process to fetch output and write_stdin to send input.",
							},
						],
						details: {
							status: "running",
							sessionId,
							pid: child.pid ?? undefined,
							startedAt,
							tail: session.tail,
						},
						status: "running",
					}),
				);
			};

			const yieldTimer = setTimeout(() => {
				if (settled) return;
				yielded = true;
				emitEvent?.({
					type: "tool_execution_progress",
					toolCallId,
					sessionId,
					pid: child.pid ?? undefined,
					startedAt,
					tail: session.tail,
				});
				resolveRunning();
			}, yieldWindow);

			child.once("exit", (code, exitSignal) => {
				clearTimeout(yieldTimer);
				markExited(session, code, exitSignal);
				cleanup();

				if (yielded) {
					// Keep session for polling; do not resolve again
					return;
				}

				const aggregated = session.aggregated.trim();
				const durationMs = Date.now() - startedAt;
				const wasSignal = exitSignal != null;
				const isSuccess = code === 0 && !wasSignal;
				if (!isSuccess) {
					const reason =
						wasSignal && exitSignal
							? `Command aborted by signal ${exitSignal}`
							: code === null
								? "Command aborted before exit code was captured"
								: `Command exited with code ${code}`;
					const message = aggregated ? `${aggregated}\n\n${reason}` : reason;
					settle(() => reject(new Error(message)));
					deleteSession(sessionId);
					return;
				}

				settle(() =>
					resolve({
						content: [{ type: "text", text: aggregated || "(no output)" }],
						details: { status: "completed", exitCode: code ?? 0, durationMs, aggregated },
						status: "completed",
					}),
				);
				deleteSession(sessionId);
			});

			child.once("error", (err) => {
				clearTimeout(yieldTimer);
				cleanup();
				settle(() => reject(err));
				deleteSession(sessionId);
			});
		});
	},
};
