import type { AgentEvent } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import {
	bashStreamTool,
	getProcessLogTool,
	listProcessesTool,
	pollProcessTool,
	writeStdinTool,
} from "../src/tools/index.js";

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("streamable bash tools", () => {
	it("yields and can be polled to completion", async () => {
		const events: AgentEvent[] = [];

		const start = await bashStreamTool.execute(
			"call-stream-1",
			{
				command: "printf hello && sleep 2 && printf world",
				yieldMs: 50,
			},
			{ emitEvent: (e) => events.push(e) },
		);

		expect(start.details.status).toBe("running");
		expect(events.some((e) => e.type === "tool_execution_progress")).toBe(true);

		await sleep(2500);

		const polled = await pollProcessTool.execute("call-stream-1-poll", {
			sessionId: (start.details as any).sessionId,
		});

		expect(polled.status).toBe("completed");
		expect(polled.details?.aggregated).toContain("helloworld");
	});

	it("supports stdin and EOF to complete cat-like processes", async () => {
		const start = await bashStreamTool.execute(
			"call-stdin-1",
			{
				command: "cat",
				yieldMs: 30,
			},
			{ emitEvent: () => {} },
		);

		expect(start.details.status).toBe("running");

		const sessionId = (start.details as any).sessionId as string;

		const writeResult = await writeStdinTool.execute("call-stdin-write", { sessionId, data: "hi\n", eof: true });
		expect(writeResult.status).toBe("running");

		await sleep(50);

		const polled = await pollProcessTool.execute("call-stdin-poll", { sessionId });

		expect(polled.status).toBe("completed");
		expect(polled.details?.aggregated).toContain("hi");
	});

	it("surfaces aborts as failures", async () => {
		const ac = new AbortController();
		const promise = bashStreamTool.execute(
			"call-abort-1",
			{
				command: "sleep 5",
				yieldMs: 1000,
			},
			{ signal: ac.signal, emitEvent: () => {} },
		);

		ac.abort();

		await expect(promise).rejects.toThrow(/aborted|signal/i);
	});

	it("lists running and finished sessions and fetches logs", async () => {
		// start a command that will yield quickly
		const start = await bashStreamTool.execute(
			"call-list-1",
			{
				command: "printf running && sleep 1 && printf done",
				yieldMs: 20,
			},
			{ emitEvent: () => {} },
		);

		expect(start.details.status).toBe("running");
		const sessionId = (start.details as any).sessionId as string;

		// Allow completion
		await sleep(300);
		await pollProcessTool.execute("call-list-1-poll", { sessionId });

		const list = await listProcessesTool.execute("call-list-1-list", { limit: 5 });
		const sessions = (list.details as any).sessions as any[];
		expect(Array.isArray(sessions)).toBe(true);
		const match = sessions.find((s) => s.sessionId === sessionId);
		expect(match).toBeDefined();
		expect(match?.status === "completed" || match?.status === "failed").toBe(true);

		const log = await getProcessLogTool.execute("call-list-1-log", { sessionId, limit: 200 });
		const logText = (log.content?.find((c) => (c as any).type === "text") as any)?.text as string;
		expect(logText).toContain("running");
	});
});
