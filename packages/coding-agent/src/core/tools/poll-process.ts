import type { AgentTool } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { deleteSession, drainSession, getSession } from "./process-registry.js";

const pollSchema = Type.Object({
	sessionId: Type.String({ description: "Session id returned by bash_stream" }),
});

export const pollProcessTool: AgentTool<typeof pollSchema> = {
	name: "poll_process",
	label: "poll_process",
	description: "Poll a running bash_stream session for new output or completion.",
	parameters: pollSchema,
	execute: async (_toolCallId: string, { sessionId }: { sessionId: string }, _opts = {}) => {
		const session = getSession(sessionId);
		if (!session) {
			return {
				content: [{ type: "text", text: `No active session found for ${sessionId}` }],
				details: { status: "failed" },
				status: "failed",
			};
		}

		const { stdout, stderr } = drainSession(session);
		const exited = session.exited;
		const exitCode = session.exitCode ?? 0;
		const aggregated = session.aggregated;

		if (exited) {
			deleteSession(sessionId);
		}

		const status = exited ? (exitCode === 0 ? "completed" : "failed") : "running";
		const parts: string[] = [];
		if (stdout) parts.push(stdout.trimEnd());
		if (stderr) parts.push(stderr.trimEnd());
		const output = parts.join("\n").trim();

		return {
			content: [
				{
					type: "text",
					text:
						(output || "(no new output)") +
						(exited ? `\n\nProcess exited with code ${exitCode}.` : "\n\nProcess still running."),
				},
			],
			details: { status, sessionId, exitCode: exited ? exitCode : undefined, aggregated },
			status,
		};
	},
};
