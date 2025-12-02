import type { AgentTool } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { drainSession, getFinishedSession, getSession, markExited } from "./process-registry.js";

const pollSchema = Type.Object({
	sessionId: Type.String({ description: "Session id returned by bash_stream" }),
});

export const pollProcessTool: AgentTool<typeof pollSchema> = {
	name: "poll_process",
	label: "poll_process",
	description: "Poll a running bash_stream session for new output or completion.",
	parameters: pollSchema,
	execute: async (_toolCallId: string, { sessionId }: { sessionId: string }, _opts = {}) => {
		const running = getSession(sessionId);
		if (running) {
			const { stdout, stderr } = drainSession(running);
			const exited = running.exited;
			const exitCode = running.exitCode ?? 0;
			const exitSignal = running.exitSignal ?? undefined;
			const aggregated = running.aggregated;

			if (exited) {
				const status = exitCode === 0 && exitSignal == null ? "completed" : "failed";
				markExited(running, running.exitCode ?? null, running.exitSignal ?? null, status);
			}

			const status = exited ? (exitCode === 0 && exitSignal == null ? "completed" : "failed") : "running";
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
							(exited
								? `\n\nProcess exited with ${exitSignal ? `signal ${exitSignal}` : `code ${exitCode}`}.`
								: "\n\nProcess still running."),
					},
				],
				details: { status, sessionId, exitCode: exited ? exitCode : undefined, exitSignal, aggregated },
				status,
			};
		}

		const finished = getFinishedSession(sessionId);
		if (finished) {
			const status: "completed" | "failed" | "running" =
				finished.status === "completed" ? "completed" : finished.status === "running" ? "running" : "failed";
			const exitCode = finished.exitCode ?? 0;
			const exitSignal = finished.exitSignal ?? undefined;
			const output = finished.tail || `(no output recorded${finished.truncated ? " — truncated to cap" : ""})`;
			return {
				content: [
					{
						type: "text",
						text: output + `\n\nProcess exited with ${exitSignal ? `signal ${exitSignal}` : `code ${exitCode}`}.`,
					},
				],
				details: {
					status,
					sessionStatus: finished.status,
					sessionId,
					exitCode,
					exitSignal,
					aggregated: finished.aggregated,
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
