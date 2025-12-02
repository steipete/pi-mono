import type { AgentTool } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import {
	drainSession,
	getFinishedSession,
	getSession,
	listFinishedSessions,
	listRunningSessions,
	markExited,
} from "./process-registry.js";
import { killProcessTree } from "./shell-utils.js";

const processSchema = Type.Object({
	action: Type.Union([
		Type.Literal("list"),
		Type.Literal("poll"),
		Type.Literal("log"),
		Type.Literal("write"),
		Type.Literal("kill"),
	]),
	sessionId: Type.Optional(Type.String({ description: "Session id for actions other than list" })),
	data: Type.Optional(Type.String({ description: "Data to write for write action" })),
	eof: Type.Optional(Type.Boolean({ description: "Close stdin after write" })),
	offset: Type.Optional(Type.Number({ description: "Log offset" })),
	limit: Type.Optional(Type.Number({ description: "Log length" })),
});

export const processTool: AgentTool<typeof processSchema> = {
	name: "process",
	label: "process",
	description: "Manage running bash sessions: list, poll, log, write, kill.",
	parameters: processSchema,
	execute: async (_toolCallId, { action, sessionId, data, eof, offset, limit }) => {
		if (action === "list") {
			const running = listRunningSessions().map((s) => ({
				sessionId: s.id,
				status: "running",
				pid: s.child.pid ?? undefined,
				startedAt: s.startedAt,
				runtimeMs: Date.now() - s.startedAt,
				cwd: s.cwd,
				command: s.command,
				tail: s.tail,
				truncated: s.truncated,
			}));
			const finished = listFinishedSessions().map((s) => ({
				sessionId: s.id,
				status: s.status,
				startedAt: s.startedAt,
				endedAt: s.endedAt,
				runtimeMs: s.endedAt - s.startedAt,
				cwd: s.cwd,
				command: s.command,
				tail: s.tail,
				truncated: s.truncated,
				exitCode: s.exitCode ?? undefined,
				exitSignal: s.exitSignal ?? undefined,
			}));
			const lines = [...running, ...finished]
				.sort((a, b) => b.startedAt - a.startedAt)
				.map(
					(s) =>
						`${s.sessionId.slice(0, 8)} ${pad(s.status, 9)} ${formatDuration(s.runtimeMs)} :: ${truncateMiddle(s.command, 120)}`,
				);
			return {
				content: [{ type: "text", text: lines.join("\n") || "No running or recent sessions." }],
				details: { status: "completed", sessions: [...running, ...finished] },
				status: "completed",
			};
		}

		if (!sessionId) {
			return {
				content: [{ type: "text", text: "sessionId is required for this action." }],
				details: { status: "failed" },
				status: "failed",
			};
		}

		const session = getSession(sessionId);
		const finished = getFinishedSession(sessionId);

		switch (action) {
			case "poll": {
				if (!session) {
					if (finished) {
						return {
							content: [
								{
									type: "text",
									text:
										(finished.tail ||
											`(no output recorded${finished.truncated ? " — truncated to cap" : ""})`) +
										`\n\nProcess exited with ${finished.exitSignal ? `signal ${finished.exitSignal}` : `code ${finished.exitCode ?? 0}`}.`,
								},
							],
							details: {
								status: finished.status === "completed" ? "completed" : "failed",
								sessionId,
								exitCode: finished.exitCode ?? undefined,
								aggregated: finished.aggregated,
							},
							status: finished.status === "completed" ? "completed" : "failed",
						};
					}
					return {
						content: [{ type: "text", text: `No session found for ${sessionId}` }],
						details: { status: "failed" },
						status: "failed",
					};
				}
				if (!session.backgrounded) {
					return {
						content: [{ type: "text", text: `Session ${sessionId} is not backgrounded.` }],
						details: { status: "failed" },
						status: "failed",
					};
				}
				const { stdout, stderr } = drainSession(session);
				const exited = session.exited;
				const exitCode = session.exitCode ?? 0;
				const exitSignal = session.exitSignal ?? undefined;
				if (exited) {
					const status = exitCode === 0 && exitSignal == null ? "completed" : "failed";
					markExited(session, session.exitCode ?? null, session.exitSignal ?? null, status);
				}
				const status = exited ? (exitCode === 0 && exitSignal == null ? "completed" : "failed") : "running";
				const output = [stdout.trimEnd(), stderr.trimEnd()].filter(Boolean).join("\n").trim();
				return {
					content: [
						{
							type: "text",
							text:
								(output || "(no new output)") +
								(exited
									? `\n\nProcess exited with ${exitSignal ? `signal ${exitSignal}` : `code ${exitCode}`}.`
									: "\n\nProcess still running."),
						},
					],
					details: { status, sessionId, exitCode: exited ? exitCode : undefined, aggregated: session.aggregated },
					status,
				};
			}

			case "log": {
				if (session) {
					if (!session.backgrounded) {
						return {
							content: [{ type: "text", text: `Session ${sessionId} is not backgrounded.` }],
							details: { status: "failed" },
							status: "failed",
						};
					}
					const total = session.aggregated.length;
					const slice = session.aggregated.slice(offset ?? 0, limit ? (offset ?? 0) + limit : undefined);
					return {
						content: [{ type: "text", text: slice || "(no output yet)" }],
						details: {
							status: session.exited ? "completed" : "running",
							sessionId,
							total,
							truncated: session.truncated,
						},
						status: session.exited ? "completed" : "running",
					};
				}
				if (finished) {
					const total = finished.aggregated.length;
					const slice = finished.aggregated.slice(offset ?? 0, limit ? (offset ?? 0) + limit : undefined);
					const status = finished.status === "completed" ? "completed" : "failed";
					return {
						content: [{ type: "text", text: slice || "(no output recorded)" }],
						details: {
							status,
							sessionId,
							total,
							truncated: finished.truncated,
							exitCode: finished.exitCode ?? undefined,
							exitSignal: finished.exitSignal ?? undefined,
						},
						status,
					};
				}
				return {
					content: [{ type: "text", text: `No session found for ${sessionId}` }],
					details: { status: "failed" },
					status: "failed",
				};
			}

			case "write": {
				if (!session) {
					return {
						content: [{ type: "text", text: `No active session found for ${sessionId}` }],
						details: { status: "failed" },
						status: "failed",
					};
				}
				if (!session.backgrounded) {
					return {
						content: [{ type: "text", text: `Session ${sessionId} is not backgrounded.` }],
						details: { status: "failed" },
						status: "failed",
					};
				}
				if (!session.child.stdin || session.child.stdin.destroyed) {
					return {
						content: [{ type: "text", text: `Session ${sessionId} stdin is not writable.` }],
						details: { status: "failed" },
						status: "failed",
					};
				}
				await new Promise<void>((resolve, reject) => {
					session.child.stdin.write(data ?? "", (err) => {
						if (err) reject(err);
						else resolve();
					});
				});
				if (eof) {
					session.child.stdin.end();
				}
				return {
					content: [
						{
							type: "text",
							text: `Wrote ${(data ?? "").length} bytes to session ${sessionId}${eof ? " (stdin closed)" : ""}.`,
						},
					],
					details: { status: "running", sessionId },
					status: "running",
				};
			}

			case "kill": {
				if (!session) {
					return {
						content: [{ type: "text", text: `No active session found for ${sessionId}` }],
						details: { status: "failed" },
						status: "failed",
					};
				}
				if (!session.backgrounded) {
					return {
						content: [{ type: "text", text: `Session ${sessionId} is not backgrounded.` }],
						details: { status: "failed" },
						status: "failed",
					};
				}
				if (session.child.pid) {
					killProcessTree(session.child.pid);
				}
				markExited(session, null, "SIGKILL", "failed");
				return {
					content: [{ type: "text", text: `Killed session ${sessionId}.` }],
					details: { status: "failed" },
					status: "failed",
				};
			}
		}

		return {
			content: [{ type: "text", text: `Unknown action ${action}` }],
			details: { status: "failed" },
			status: "failed",
		};
	},
};

function truncateMiddle(str: string, max: number) {
	if (str.length <= max) return str;
	const half = Math.floor((max - 3) / 2);
	return `${str.slice(0, half)}...${str.slice(str.length - half)}`;
}

function formatDuration(ms: number) {
	if (ms < 1000) return `${ms}ms`;
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const rem = seconds % 60;
	return `${minutes}m${rem.toString().padStart(2, "0")}s`;
}

function pad(str: string, width: number) {
	if (str.length >= width) return str;
	return str + " ".repeat(width - str.length);
}
