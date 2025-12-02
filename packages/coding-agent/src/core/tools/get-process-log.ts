import type { AgentTool } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { appendOutput, drainSession, getFinishedSession, getSession } from "./process-registry.js";

const logSchema = Type.Object({
	sessionId: Type.String({ description: "Session id returned by bash_stream" }),
	offset: Type.Optional(Type.Number({ description: "Start offset into aggregated output (default 0)" })),
	limit: Type.Optional(Type.Number({ description: "Max characters to return" })),
});

export const getProcessLogTool: AgentTool<typeof logSchema> = {
	name: "get_process_log",
	label: "get_process_log",
	description: "Fetch buffered output for a running or finished bash_stream session (paged).",
	parameters: logSchema,
	execute: async (
		_toolCallId: string,
		{ sessionId, offset, limit }: { sessionId: string; offset?: number; limit?: number },
		_opts = {},
	) => {
		const start = Math.max(0, offset ?? 0);
		const max = limit && limit > 0 ? limit : undefined;

		const running = getSession(sessionId);
		if (running) {
			// drain pending output so aggregated stays up to date
			const drained = drainSession(running);
			if (drained.stdout) appendOutput(running, "stdout", drained.stdout);
			if (drained.stderr) appendOutput(running, "stderr", drained.stderr);
			const total = running.aggregated.length;
			const slice = running.aggregated.slice(start, max ? start + max : undefined);
			return {
				content: [{ type: "text", text: slice || "(no output yet)" }],
				details: {
					status: "running",
					sessionId,
					total,
					offset: start,
					limit: max,
					truncated: running.truncated,
				},
				status: "running",
			};
		}

		const finished = getFinishedSession(sessionId);
		if (finished) {
			const total = finished.aggregated.length;
			const slice = finished.aggregated.slice(start, max ? start + max : undefined);
			const status: "running" | "completed" | "failed" =
				finished.status === "running" ? "running" : finished.status === "completed" ? "completed" : "failed";
			return {
				content: [{ type: "text", text: slice || "(no output recorded)" }],
				details: {
					status,
					sessionStatus: finished.status,
					sessionId,
					total,
					offset: start,
					limit: max,
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
	},
};
