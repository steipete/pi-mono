export { type BashToolDetails, bashTool } from "./bash.js";
export { bashStreamTool } from "./bash-stream.js";
export { editTool } from "./edit.js";
export { type FindToolDetails, findTool } from "./find.js";
export { type GrepToolDetails, grepTool } from "./grep.js";
export { getProcessLogTool } from "./get-process-log.js";
export { killProcessTool } from "./kill-process.js";
export { type LsToolDetails, lsTool } from "./ls.js";
export { listProcessesTool } from "./list-processes.js";
export { pollProcessTool } from "./poll-process.js";
export { type ReadToolDetails, readTool } from "./read.js";
export type { TruncationResult } from "./truncate.js";
export { writeTool } from "./write.js";
export { writeStdinTool } from "./write-stdin.js";

import { bashTool } from "./bash.js";
import { bashStreamTool } from "./bash-stream.js";
import { editTool } from "./edit.js";
import { findTool } from "./find.js";
import { getProcessLogTool } from "./get-process-log.js";
import { grepTool } from "./grep.js";
import { killProcessTool } from "./kill-process.js";
import { listProcessesTool } from "./list-processes.js";
import { lsTool } from "./ls.js";
import { pollProcessTool } from "./poll-process.js";
import { readTool } from "./read.js";
import { writeTool } from "./write.js";
import { writeStdinTool } from "./write-stdin.js";

// Default tools for full access mode
export const codingTools = [readTool, bashStreamTool, bashTool, editTool, writeTool];

// All available tools (including read-only exploration tools)
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
	list_processes: listProcessesTool,
	get_process_log: getProcessLogTool,
};

export type ToolName = keyof typeof allTools;
