import type { AgentTool } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { listFinishedSessions, listRunningSessions, tail } from "./process-registry.js";

const listSchema = Type.Object({
	limit: Type.Optional(Type.Number({ description: "Maximum number of sessions to return (most recent first)" })),
});

export const listProcessesTool: AgentTool<typeof listSchema> = {
	name: "list_processes",
	label: "list_processes",
	description: "List running and recently finished bash_stream sessions (in-memory, TTL bounded).",
	parameters: listSchema,
	execute: async (_toolCallId: string, { limit }: { limit?: number }, _opts = {}) => {
		const running = listRunningSessions().map((session) => ({
			sessionId: session.id,
			status: "running" as const,
			pid: session.child.pid ?? undefined,
			startedAt: session.startedAt,
			cwd: session.cwd,
			command: session.command,
			runtimeMs: Date.now() - session.startedAt,
			tail: session.tail,
			truncated: session.truncated,
		}));

		const finished = listFinishedSessions().map((session) => ({
			sessionId: session.id,
			status: session.status,
			pid: undefined as number | undefined,
			startedAt: session.startedAt,
			endedAt: session.endedAt,
			cwd: session.cwd,
			command: session.command,
			runtimeMs: session.endedAt - session.startedAt,
			tail: session.tail,
			truncated: session.truncated,
			exitCode: session.exitCode ?? undefined,
			exitSignal: session.exitSignal ?? undefined,
		}));

		const all = [...running, ...finished].sort((a, b) => b.startedAt - a.startedAt);
		const sliced = limit && limit > 0 ? all.slice(0, limit) : all;

		if (sliced.length === 0) {
			return {
				content: [{ type: "text", text: "No running or recent sessions." }],
				details: { status: "completed", sessions: [] },
				status: "completed",
			};
		}

		const lines = sliced.map((s) => {
			const status = s.status;
			const runtime = formatDuration(s.runtimeMs);
			const location = s.cwd ? ` ${s.cwd}` : "";
			const cmd = truncateMiddle(s.command, 120);
			const tailSnippet = s.tail ? ` tail: ${truncateMiddle(tail(s.tail, 200), 120)}` : "";
			const truncatedFlag = s.truncated ? " [truncated]" : "";
			const exitInfo =
				status === "running" ? "" : ` exit ${s.exitSignal ? `signal ${s.exitSignal}` : `code ${s.exitCode ?? 0}`}`;
			return `${s.sessionId.slice(0, 8)} ${pad(status, 9)} ${runtime}${location} :: ${cmd}${tailSnippet}${truncatedFlag}${exitInfo}`;
		});

		return {
			content: [{ type: "text", text: lines.join("\n") }],
			details: { status: "completed", sessions: sliced },
			status: "completed",
		};
	},
};

function pad(str: string, width: number) {
	if (str.length >= width) return str;
	return str + " ".repeat(width - str.length);
}

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
