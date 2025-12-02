import type { AgentTool } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { deleteSession, getSession, markExited } from "./process-registry.js";
import { killProcessTree } from "./shell-utils.js";

const killSchema = Type.Object({
	sessionId: Type.String({ description: "Session id returned by bash_stream" }),
});

export const killProcessTool: AgentTool<typeof killSchema> = {
	name: "kill_process",
	label: "kill_process",
	description: "Force kill a running bash_stream session.",
	parameters: killSchema,
	execute: async (_toolCallId: string, { sessionId }: { sessionId: string }, _opts = {}) => {
		const session = getSession(sessionId);
		if (!session) {
			return {
				content: [{ type: "text", text: `No active session found for ${sessionId}` }],
				details: { status: "failed" },
				status: "failed",
			};
		}

		if (session.child.pid) {
			killProcessTree(session.child.pid);
		}
		markExited(session, null, "SIGKILL");
		deleteSession(sessionId);

		return {
			content: [{ type: "text", text: `Killed session ${sessionId}.` }],
			details: { status: "failed" },
			status: "failed",
		};
	},
};
