import type { AgentTool } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { getSession } from "./process-registry.js";

const writeSchema = Type.Object({
	sessionId: Type.String({ description: "Session id returned by bash_stream" }),
	data: Type.String({ description: "Data to write to stdin" }),
	eof: Type.Optional(Type.Boolean({ description: "Close stdin after writing" })),
});

export const writeStdinTool: AgentTool<typeof writeSchema> = {
	name: "write_stdin",
	label: "write_stdin",
	description: "Write data to a running bash_stream session's stdin.",
	parameters: writeSchema,
	execute: async (
		_toolCallId: string,
		{ sessionId, data, eof }: { sessionId: string; data: string; eof?: boolean },
		_opts = {},
	) => {
		const session = getSession(sessionId);
		if (!session) {
			return {
				content: [{ type: "text", text: `No active session found for ${sessionId}` }],
				details: { status: "failed" },
				status: "failed",
			};
		}

		if (session.exited || session.child.killed) {
			return {
				content: [{ type: "text", text: `Session ${sessionId} has already exited.` }],
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
			session.child.stdin.write(data, (err) => {
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
					text: `Wrote ${data.length} bytes to session ${sessionId}${eof ? " (stdin closed)" : ""}.`,
				},
			],
			details: { status: "running", sessionId },
			status: "running",
		};
	},
};
