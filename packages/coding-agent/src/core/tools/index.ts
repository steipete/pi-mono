import type { AgentTool } from "@mariozechner/pi-ai";

export { type BashToolDetails, bashTool, createBashTool } from "./bash.js";
export { bashStreamTool } from "./bash-stream.js";
export { createEditTool, editTool } from "./edit.js";
export { createFindTool, type FindToolDetails, findTool } from "./find.js";
export { createGrepTool, type GrepToolDetails, grepTool } from "./grep.js";
export { killProcessTool } from "./kill-process.js";
export { createLsTool, type LsToolDetails, lsTool } from "./ls.js";
export { pollProcessTool } from "./poll-process.js";
export { createReadTool, type ReadToolDetails, readTool } from "./read.js";
export type { TruncationResult } from "./truncate.js";
export { createWriteTool, writeTool } from "./write.js";
export { writeStdinTool } from "./write-stdin.js";

import { bashTool, createBashTool } from "./bash.js";
import { bashStreamTool } from "./bash-stream.js";
import { createEditTool, editTool } from "./edit.js";
import { createFindTool, findTool } from "./find.js";
import { createGrepTool, grepTool } from "./grep.js";
import { killProcessTool } from "./kill-process.js";
import { createLsTool, lsTool } from "./ls.js";
import { pollProcessTool } from "./poll-process.js";
import { createReadTool, readTool } from "./read.js";
import { createWriteTool, writeTool } from "./write.js";
import { writeStdinTool } from "./write-stdin.js";

/** Tool type (AgentTool from pi-ai) */
export type Tool = AgentTool<any>;

// Default tools for full access mode (using process.cwd())
export const codingTools: Tool[] = [readTool, bashStreamTool, bashTool, editTool, writeTool];

// Read-only tools for exploration without modification (using process.cwd())
export const readOnlyTools: Tool[] = [readTool, grepTool, findTool, lsTool];

// All available tools (using process.cwd())
export const allTools = {
	read: readTool,
	bash_stream: bashStreamTool,
	bash: bashTool,
	edit: editTool,
	write: writeTool,
	grep: grepTool,
	find: findTool,
	ls: lsTool,
	poll_process: pollProcessTool,
	write_stdin: writeStdinTool,
	kill_process: killProcessTool,
};

export type ToolName = keyof typeof allTools;

/**
 * Create coding tools configured for a specific working directory.
 */
export function createCodingTools(cwd: string): Tool[] {
	return [createReadTool(cwd), bashStreamTool, createBashTool(cwd), createEditTool(cwd), createWriteTool(cwd)];
}

/**
 * Create read-only tools configured for a specific working directory.
 */
export function createReadOnlyTools(cwd: string): Tool[] {
	return [createReadTool(cwd), createGrepTool(cwd), createFindTool(cwd), createLsTool(cwd)];
}

/**
 * Create all tools configured for a specific working directory.
 */
export function createAllTools(cwd: string): Record<ToolName, Tool> {
	return {
		read: createReadTool(cwd),
		bash_stream: bashStreamTool,
		bash: createBashTool(cwd),
		edit: createEditTool(cwd),
		write: createWriteTool(cwd),
		grep: createGrepTool(cwd),
		find: createFindTool(cwd),
		ls: createLsTool(cwd),
		poll_process: pollProcessTool,
		write_stdin: writeStdinTool,
		kill_process: killProcessTool,
	};
}
