import type { AgentEvent } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { bashStreamTool, pollProcessTool, writeStdinTool } from "../src/tools/index.js";

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
});
